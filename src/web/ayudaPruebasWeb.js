'use strict';

// Ayuda para las pruebas de las paginas: servidor real en puerto efimero, base `:memory:`,
// usuarios sembrados y un cliente HTTP con jarra de cookies que sigue el flujo de formularios.
const { abrirBaseDeDatos } = require('../infra/baseDeDatos');
const { ejecutarMigraciones } = require('../infra/migraciones');
const { crearRelojFijo } = require('../infra/reloj');
const { sembrarUsuarios } = require('../infra/sembrado');
const { hashearContrasena } = require('../infra/contrasenas');
const { iniciarServidor } = require('./servidor');
const { crearCsrf } = require('./csrf');
const { crearAplicacionWeb } = require('./aplicacionWeb');

const CLAVES = Object.freeze({
  SEED_PASSWORD_ESTUDIANTE: 'clave-estudiante',
  SEED_PASSWORD_ASESOR_FINANCIERO: 'clave-asesor',
  SEED_PASSWORD_COMITE_BECAS: 'clave-comite',
  SEED_PASSWORD_DIRECCION_ACADEMICA: 'clave-direccion',
});

const DATOS_FORMULARIO = Object.freeze({
  periodoAcademico: '2026-1',
  ingresosHogar: '1500000',
  numeroDependientes: '2',
  estrato: '3',
  ocupacionAcudiente: 'docente',
});

const DOCUMENTOS = Object.freeze([
  Object.freeze({ tipo: 'identificacion', nombreArchivo: 'id.pdf' }),
  Object.freeze({ tipo: 'certificado_ingresos', nombreArchivo: 'ingresos.pdf' }),
  Object.freeze({ tipo: 'certificado_matricula', nombreArchivo: 'matricula.png' }),
]);

async function levantarAplicacion() {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  await sembrarUsuarios({ db, entorno: CLAVES });
  const reloj = crearRelojFijo(new Date('2026-05-04T12:30:00.000Z'));
  const csrf = crearCsrf({ secreto: 'secreto-de-prueba-0123456789' });
  const aplicacion = crearAplicacionWeb({ db, reloj, csrf });
  const servidor = await iniciarServidor({ puerto: 0, rutas: aplicacion.rutas, ...aplicacion.opcionesServidor });
  return {
    db,
    base: `http://127.0.0.1:${servidor.puerto}`,
    cerrar: async () => {
      await servidor.cerrar();
      db.close();
    },
  };
}

async function crearUsuario(db, nombreUsuario, rol, contrasena) {
  db.prepare('INSERT INTO usuarios (nombre_usuario, hash_contrasena, rol, activo) VALUES (?, ?, ?, 1)').run(
    nombreUsuario,
    await hashearContrasena(contrasena),
    rol,
  );
}

// Cliente que no sigue redirecciones y conserva la cookie de sesion entre peticiones.
function crearCliente(base) {
  let cookie = null;

  async function pedir(metodo, ruta, campos, cabecerasExtra = {}, { json = false } = {}) {
    const cabeceras = { ...cabecerasExtra };
    if (cookie) cabeceras.Cookie = cookie;
    let cuerpo;
    if (json) {
      cabeceras['Content-Type'] = 'application/json';
      cuerpo = JSON.stringify(campos ?? {});
    } else if (campos !== undefined) {
      cabeceras['Content-Type'] = 'application/x-www-form-urlencoded';
      cuerpo = new URLSearchParams(campos).toString();
    }
    const respuesta = await fetch(`${base}${ruta}`, { method: metodo, headers: cabeceras, body: cuerpo, redirect: 'manual' });
    const nueva = respuesta.headers.getSetCookie().find((c) => c.startsWith('sid='));
    if (nueva) {
      const valor = nueva.split(';')[0];
      cookie = valor === 'sid=' ? null : valor;
    }
    return {
      estado: respuesta.status,
      ubicacion: respuesta.headers.get('location'),
      cabeceras: respuesta.headers,
      texto: await respuesta.text(),
    };
  }

  const token = async () => JSON.parse((await pedir('GET', '/csrf')).texto).csrf;

  return {
    get: (ruta) => pedir('GET', ruta),
    // Por defecto agrega el token CSRF de la sesion, como lo hace el campo oculto de los formularios.
    post: async (ruta, campos = {}, { conToken = true } = {}) =>
      pedir('POST', ruta, conToken ? { ...campos, _csrf: await token() } : campos),
    // Cuerpo JSON; el token CSRF viaja en la cabecera `x-csrf-token`, como un cliente de API.
    postJson: async (ruta, cuerpo = {}, { conToken = true } = {}) =>
      pedir('POST', ruta, cuerpo, conToken ? { 'x-csrf-token': await token() } : {}, { json: true }),
    iniciarSesion: (nombreUsuario, contrasena) =>
      pedir('POST', '/login', { nombre_usuario: nombreUsuario, contrasena }),
    pedir,
  };
}

async function clienteConSesion(base, nombreUsuario, contrasena) {
  const cliente = crearCliente(base);
  const respuesta = await cliente.iniciarSesion(nombreUsuario, contrasena);
  if (respuesta.estado !== 303) throw new Error(`login de prueba fallido: ${respuesta.estado}`);
  return cliente;
}

// Crea un borrador por el formulario y devuelve su id (sale de la redireccion al detalle).
async function crearBorradorPorFormulario(cliente, datos = {}) {
  const respuesta = await cliente.post('/solicitudes', { ...DATOS_FORMULARIO, ...datos });
  const coincidencia = /^\/solicitudes\/([^/]+)$/.exec(respuesta.ubicacion ?? '');
  if (respuesta.estado !== 303 || !coincidencia) {
    throw new Error(`no se creo el borrador: ${respuesta.estado} ${respuesta.texto.slice(0, 200)}`);
  }
  return coincidencia[1];
}

// Crea un borrador, adjunta los tres documentos y lo envia a revision; devuelve el id.
async function crearSolicitudEnviada(cliente, datos = {}) {
  const id = await crearBorradorPorFormulario(cliente, datos);
  for (const documento of DOCUMENTOS) {
    const respuesta = await cliente.post(`/solicitudes/${id}/documentos`, documento);
    if (respuesta.estado !== 303) throw new Error(`no se adjunto el documento: ${respuesta.estado}`);
  }
  const envio = await cliente.post(`/solicitudes/${id}/enviar`);
  if (envio.estado !== 303) throw new Error(`no se envio la solicitud: ${envio.estado}`);
  return id;
}

module.exports = {
  CLAVES,
  crearSolicitudEnviada,
  DATOS_FORMULARIO,
  DOCUMENTOS,
  levantarAplicacion,
  crearUsuario,
  crearCliente,
  clienteConSesion,
  crearBorradorPorFormulario,
};
