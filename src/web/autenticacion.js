'use strict';

const crypto = require('node:crypto');
const { verificarContrasena, hashearContrasena } = require('../infra/contrasenas');
const { responderJson, redirigir } = require('./respuestas');
const { crearGuardias, errorHttp } = require('./guardias');
const { crearCsrf } = require('./csrf');
const { crearPoliticaCookies } = require('./cookies');

const NOMBRE_COOKIE = 'sid';
const LONGITUD_MAXIMA_ACTOR = 64;
const OCHO_HORAS_MS = 8 * 60 * 60 * 1000;
const QUINCE_MINUTOS_MS = 15 * 60 * 1000;

// Pagina de aterrizaje tras el login por formulario; los demas roles van a /solicitudes.
const PAGINAS_INICIALES = Object.freeze({
  asesor_financiero: '/asesor/cola',
  comite_becas: '/comite',
  direccion_academica: '/direccion',
});

const sha256 =(texto) => crypto.createHash('sha256').update(texto).digest('hex');

function leerCookie(req, nombre) {
  for (const par of (req.headers.cookie ?? '').split(';')) {
    const indice = par.indexOf('=');
    if (indice > 0 && par.slice(0, indice).trim() === nombre) return par.slice(indice + 1).trim();
  }
  return null;
}

// El nombre de usuario de un login fallido lo controla el atacante: sin caracteres
// de control y acotado antes de guardarlo en la bitacora o usarlo como clave.
function sanearActor(nombre) {
  const limpio = nombre.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, LONGITUD_MAXIMA_ACTOR);
  return limpio === '' ? 'anonimo' : limpio;
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
  csrf = crearCsrf(),
  cookies = crearPoliticaCookies(),
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

  const obtenerIdSesion = (req) => sesionDeSolicitud(req)?.id ?? null;

  const cookieDeSesion = (req, valor, maxAgeSegundos) =>
    cookies.serializar(req, NOMBRE_COOKIE, valor, maxAgeSegundos);

  // Los formularios del navegador envian x-www-form-urlencoded; los clientes de API, JSON.
  const esFormulario = (req) =>
    (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() === 'application/x-www-form-urlencoded';

  // Codigos de error que un formulario muestra en /login (el resto se propaga como siempre).
  const ERRORES_DE_FORMULARIO = Object.freeze({
    CREDENCIALES_INVALIDAS: 'credenciales',
    DEMASIADOS_INTENTOS: 'intentos',
    FORMATO_INVALIDO: 'formato',
  });

  // Formulario: exito -> 303 a /solicitudes; fallo -> 303 a /login?error=... (post/redirect/get).
  // JSON: sin cambios (cuerpo JSON y errores JSON).
  async function login(contexto) {
    if (!esFormulario(contexto.req)) return iniciarSesion(contexto, false);
    try {
      return await iniciarSesion(contexto, true);
    } catch (error) {
      const motivo = ERRORES_DE_FORMULARIO[error?.codigo];
      if (!motivo) throw error;
      return redirigir(contexto.res, `/login?error=${motivo}`);
    }
  }

  async function iniciarSesion({ req, res, leerCuerpo }, desdeFormulario) {
    const cuerpo = await leerCuerpo();
    const { nombre_usuario: nombre, contrasena } = cuerpo ?? {};
    if (typeof nombre !== 'string' || typeof contrasena !== 'string' || nombre === '') {
      throw errorHttp(400, 'FORMATO_INVALIDO');
    }
    const ip = req.socket.remoteAddress ?? 'desconocida';
    const actor = sanearActor(nombre);
    const clave = `${actor}|${ip}`;
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
        actor,
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
    res.setHeader('Set-Cookie', cookieDeSesion(req, token, Math.floor(duracionSesionMs / 1000)));
    if (desdeFormulario) {
      redirigir(res, PAGINAS_INICIALES[usuario.rol] ?? '/solicitudes');
      return;
    }
    responderJson(res, 200, {
      id: usuario.id,
      nombre_usuario: usuario.nombre_usuario,
      rol: usuario.rol,
      csrf: csrf.generar(sha256(token)),
    });
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
    res.setHeader('Set-Cookie', cookieDeSesion(req, '', 0));
    if (esFormulario(req)) {
      redirigir(res, '/login');
      return;
    }
    responderJson(res, 200, {});
  }

  const guardias = crearGuardias({ obtenerUsuario });

  const rutas = [
    ['POST', '/login', login],
    ['POST', '/logout', logout],
    ['GET', '/me', guardias.requerirSesion(({ usuario }) => usuario)],
    // Token CSRF de la sesion actual, para que las paginas lo incrusten en sus formularios.
    [
      'GET',
      '/csrf',
      ({ req }) => {
        const idSesion = obtenerIdSesion(req);
        if (!idSesion) throw errorHttp(401, 'NO_AUTENTICADO');
        return { csrf: csrf.generar(idSesion) };
      },
    ],
  ];

  // Opciones para iniciarServidor: comparten el mismo secreto CSRF y la misma sesion.
  const opcionesServidor = { csrf, obtenerIdSesion };

  return { rutas, obtenerUsuario, obtenerIdSesion, opcionesServidor, ...guardias };
}

module.exports = { crearAutenticacion };
