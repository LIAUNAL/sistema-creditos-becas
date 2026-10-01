'use strict';

const crypto = require('node:crypto');
const { verificarContrasena, hashearContrasena } = require('../infra/contrasenas');
const { responderJson } = require('./respuestas');
const { crearGuardias, errorHttp } = require('./guardias');

const NOMBRE_COOKIE = 'sid';
const LIMITE_CUERPO_LOGIN = 16 * 1024; // 16 KiB; P4 lo reemplaza por el limite compartido.
const OCHO_HORAS_MS = 8 * 60 * 60 * 1000;
const QUINCE_MINUTOS_MS = 15 * 60 * 1000;

const sha256 = (texto) => crypto.createHash('sha256').update(texto).digest('hex');

function leerCookie(req, nombre) {
  for (const par of (req.headers.cookie ?? '').split(';')) {
    const indice = par.indexOf('=');
    if (indice > 0 && par.slice(0, indice).trim() === nombre) return par.slice(indice + 1).trim();
  }
  return null;
}

// Lector de cuerpo acotado local a /login (JSON o x-www-form-urlencoded).
function leerCuerpoLogin(req) {
  return new Promise((resolver, rechazar) => {
    const trozos = [];
    let total = 0;
    req.on('data', (trozo) => {
      total += trozo.length;
      if (total > LIMITE_CUERPO_LOGIN) {
        trozos.length = 0;
        req.removeAllListeners('data');
        req.resume();
        rechazar(errorHttp(413, 'CUERPO_DEMASIADO_GRANDE'));
        return;
      }
      trozos.push(trozo);
    });
    req.on('end', () => {
      if (total > LIMITE_CUERPO_LOGIN) return;
      const texto = Buffer.concat(trozos).toString('utf8');
      const tipo = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      try {
        if (tipo === 'application/json') resolver(JSON.parse(texto));
        else if (tipo === 'application/x-www-form-urlencoded') {
          resolver(Object.fromEntries(new URLSearchParams(texto)));
        } else rechazar(errorHttp(400, 'FORMATO_INVALIDO'));
      } catch {
        rechazar(errorHttp(400, 'FORMATO_INVALIDO'));
      }
    });
    req.on('error', rechazar);
  });
}

function cookieDeSesion(valor, maxAgeSegundos) {
  // P4 endurece el resto de atributos (Secure, etc.).
  return `${NOMBRE_COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSegundos}`;
}

/**
 * Identidad: login, logout, /me, sesiones en SQLite y guardias de rol.
 *
 * El contador de intentos fallidos vive en memoria: vale para una sola
 * instancia del servidor y se pierde al reiniciar (limitacion aceptada).
 */
function crearAutenticacion({
  db,
  reloj,
  auditoria,
  duracionSesionMs = OCHO_HORAS_MS,
  maxIntentos = 5,
  ventanaMs = QUINCE_MINUTOS_MS,
}) {
  const buscarUsuario = db.prepare('SELECT * FROM usuarios WHERE nombre_usuario = ?');
  const insertarSesion = db.prepare(
    'INSERT INTO sesiones (id, usuario_id, creada_en, expira_en) VALUES (?, ?, ?, ?)',
  );
  const borrarSesion = db.prepare('DELETE FROM sesiones WHERE id = ?');
  const buscarSesion = db.prepare(
    `SELECT s.expira_en, u.id, u.nombre_usuario, u.rol, u.activo
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.id = ?`,
  );

  // Hash ficticio: si el usuario no existe se verifica contra el, para igualar tiempos.
  let hashFicticio = null;
  const obtenerHashFicticio = () => {
    hashFicticio ??= hashearContrasena(crypto.randomBytes(16).toString('hex'));
    return hashFicticio;
  };

  const fallos = new Map(); // clave usuario|ip -> marcas de tiempo (ms) de fallos

  function fallosVigentes(clave) {
    const limite = reloj.ahora().getTime() - ventanaMs;
    const vigentes = (fallos.get(clave) ?? []).filter((marca) => marca > limite);
    if (vigentes.length > 0) fallos.set(clave, vigentes);
    else fallos.delete(clave);
    return vigentes;
  }

  function sesionDeSolicitud(req) {
    const token = leerCookie(req, NOMBRE_COOKIE);
    if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
    const id = sha256(token);
    const fila = buscarSesion.get(id);
    if (!fila) return null;
    if (new Date(fila.expira_en).getTime() <= reloj.ahora().getTime()) {
      borrarSesion.run(id);
      return null;
    }
    if (fila.activo !== 1) return null;
    return { id, usuario: { id: fila.id, nombre_usuario: fila.nombre_usuario, rol: fila.rol } };
  }

  const obtenerUsuario = (req) => sesionDeSolicitud(req)?.usuario ?? null;

  function crearSesion(usuarioId) {
    const token = crypto.randomBytes(32).toString('hex');
    const ahora = reloj.ahora();
    insertarSesion.run(
      sha256(token),
      usuarioId,
      ahora.toISOString(),
      new Date(ahora.getTime() + duracionSesionMs).toISOString(),
    );
    return token;
  }

  async function login({ req, res }) {
    const cuerpo = await leerCuerpoLogin(req);
    const { nombre_usuario: nombre, contrasena } = cuerpo ?? {};
    if (typeof nombre !== 'string' || typeof contrasena !== 'string' || nombre === '') {
      throw errorHttp(400, 'FORMATO_INVALIDO');
    }
    const ip = req.socket.remoteAddress ?? 'desconocida';
    const clave = `${nombre}|${ip}`;
    if (fallosVigentes(clave).length >= maxIntentos) {
      throw errorHttp(429, 'DEMASIADOS_INTENTOS');
    }

    const usuario = buscarUsuario.get(nombre);
    const valida = await verificarContrasena(
      contrasena,
      usuario ? usuario.hash_contrasena : await obtenerHashFicticio(),
    );
    if (!usuario || !valida || usuario.activo !== 1) {
      fallos.set(clave, [...fallosVigentes(clave), reloj.ahora().getTime()]);
      auditoria.registrar({
        actor: nombre === '' ? 'anonimo' : nombre,
        rol: 'anonimo',
        accion: 'login_fallido',
        objetivo: 'login',
        detalle: { ip },
      });
      throw errorHttp(401, 'CREDENCIALES_INVALIDAS');
    }

    fallos.delete(clave);
    // Rotacion: la sesion previa de esta solicitud (si existe) se descarta.
    const previa = leerCookie(req, NOMBRE_COOKIE);
    if (previa) borrarSesion.run(sha256(previa));
    const token = crearSesion(usuario.id);
    auditoria.registrar({
      actor: usuario.nombre_usuario,
      rol: usuario.rol,
      accion: 'login_exitoso',
      objetivo: `usuario:${usuario.id}`,
      detalle: { ip },
    });
    res.setHeader('Set-Cookie', cookieDeSesion(token, Math.floor(duracionSesionMs / 1000)));
    responderJson(res, 200, { id: usuario.id, nombre_usuario: usuario.nombre_usuario, rol: usuario.rol });
  }

  function logout({ req, res }) {
    const sesion = sesionDeSolicitud(req);
    if (sesion) {
      borrarSesion.run(sesion.id);
      auditoria.registrar({
        actor: sesion.usuario.nombre_usuario,
        rol: sesion.usuario.rol,
        accion: 'logout',
        objetivo: `usuario:${sesion.usuario.id}`,
      });
    }
    res.setHeader('Set-Cookie', cookieDeSesion('', 0));
    responderJson(res, 200, {});
  }

  const guardias = crearGuardias({ obtenerUsuario });

  const rutas = [
    ['POST', '/login', login],
    ['POST', '/logout', logout],
    ['GET', '/me', guardias.requerirSesion(({ usuario }) => usuario)],
  ];

  return { rutas, obtenerUsuario, ...guardias };
}

module.exports = { crearAutenticacion };
