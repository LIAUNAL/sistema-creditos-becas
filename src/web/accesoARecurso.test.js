'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { abrirBaseDeDatos } = require('../infra/baseDeDatos');
const { ejecutarMigraciones } = require('../infra/migraciones');
const { crearAuditoria } = require('../infra/auditoria');
const { crearAsignaciones } = require('../infra/asignaciones');
const { sembrarUsuarios } = require('../infra/sembrado');
const { iniciarServidor } = require('./servidor');
const { crearAutenticacion } = require('./autenticacion');
const { crearCsrf } = require('./csrf');
const { crearPoliticas } = require('./politicas');

const CLAVES = {
  SEED_PASSWORD_ESTUDIANTE: 'clave-estudiante',
  SEED_PASSWORD_ASESOR_FINANCIERO: 'clave-asesor',
  SEED_PASSWORD_COMITE_BECAS: 'clave-comite',
  SEED_PASSWORD_DIRECCION_ACADEMICA: 'clave-direccion',
};
const CREDENCIALES = {
  estudiante: 'clave-estudiante',
  asesor_financiero: 'clave-asesor',
  comite_becas: 'clave-comite',
  direccion_academica: 'clave-direccion',
};

let servidor;
let base;
let usuarios;
let asignaciones;

test.before(async () => {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  await sembrarUsuarios({ db, entorno: CLAVES });
  const reloj = { ahora: () => new Date('2026-01-01T10:00:00Z') };
  const auditoria = crearAuditoria({ db, reloj });
  asignaciones = crearAsignaciones({ db, reloj, auditoria });
  usuarios = Object.fromEntries(
    db
      .prepare('SELECT id, nombre_usuario, rol FROM usuarios')
      .all()
      .map((u) => [u.rol, { id: u.id, nombre_usuario: u.nombre_usuario, rol: u.rol }]),
  );
  const politicas = crearPoliticas({ asignaciones });

  const datos = {
    propia: {
      id: 'propia',
      estudianteId: String(usuarios.estudiante.id),
      ingresosHogar: 100,
      estrato: 2,
    },
    ajena: { id: 'ajena', estudianteId: '999', ingresosHogar: 100, estrato: 3 },
  };
  asignaciones.reclamar({ solicitudId: 'propia', usuario: usuarios.asesor_financiero });

  const csrf = crearCsrf({ secreto: 'secreto-de-prueba-0123456789' });
  const autenticacion = crearAutenticacion({ db, reloj, auditoria, csrf });
  const acceso = autenticacion.requerirAccesoARecurso(
    ({ params }) => datos[params.id] ?? null,
    {
      permitir: politicas.puedeVerSolicitud,
      proyectar: politicas.proyectarSolicitud,
    },
  );
  // Ruta de prueba: el rol se valida antes (403) y el acceso al recurso despues (404).
  const ruta = autenticacion.requerirRol('estudiante', 'asesor_financiero')(
    acceso(({ recurso, usuario }) => ({ usuario: usuario.rol, recurso })),
  );
  // Ruta de prueba sin filtro de rol: la politica decide.
  const rutaSinRol = acceso(({ recurso }) => ({ recurso }));

  servidor = await iniciarServidor({
    puerto: 0,
    rutas: [
      ...autenticacion.rutas,
      ['GET', '/prueba/solicitudes/:id', ruta],
      ['GET', '/prueba/abierta/:id', rutaSinRol],
    ],
    ...autenticacion.opcionesServidor,
  });
  base = `http://127.0.0.1:${servidor.puerto}`;
});

test.after(async () => {
  await servidor.cerrar();
});

async function sesion(rol) {
  const respuesta = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre_usuario: rol, contrasena: CREDENCIALES[rol] }),
  });
  assert.strictEqual(respuesta.status, 200);
  return respuesta.headers.getSetCookie().find((c) => c.startsWith('sid=')).split(';')[0];
}

const pedir = async (ruta, cookie) => {
  const respuesta = await fetch(`${base}${ruta}`, cookie ? { headers: { Cookie: cookie } } : {});
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
};

test('sin sesion el guardia de recurso responde 401', async () => {
  const { estado } = await pedir('/prueba/solicitudes/propia');
  assert.strictEqual(estado, 401);
});

test('el estudiante recibe su propia solicitud proyectada', async () => {
  const { estado, cuerpo } = await pedir('/prueba/solicitudes/propia', await sesion('estudiante'));
  assert.strictEqual(estado, 200);
  assert.strictEqual(cuerpo.recurso.id, 'propia');
  assert.strictEqual(cuerpo.recurso.ingresosHogar, 100);
});

test('un estudiante sobre la solicitud de otro recibe 404, igual que si no existiera', async () => {
  const cookie = await sesion('estudiante');
  const ajena = await pedir('/prueba/solicitudes/ajena', cookie);
  const inexistente = await pedir('/prueba/solicitudes/no-existe', cookie);
  assert.strictEqual(ajena.estado, 404);
  assert.deepStrictEqual(ajena, inexistente);
  assert.deepStrictEqual(ajena.cuerpo, { codigo: 'RECURSO_NO_ENCONTRADO' });
});

test('el asesor asignado accede; sobre una no asignada recibe 404', async () => {
  const cookie = await sesion('asesor_financiero');
  assert.strictEqual((await pedir('/prueba/solicitudes/propia', cookie)).estado, 200);
  assert.strictEqual((await pedir('/prueba/solicitudes/ajena', cookie)).estado, 404);
});

test('un rol no permitido en la ruta sigue siendo 403 (guardia de rol de P3)', async () => {
  const { estado, cuerpo } = await pedir('/prueba/solicitudes/propia', await sesion('direccion_academica'));
  assert.strictEqual(estado, 403);
  assert.deepStrictEqual(cuerpo, { codigo: 'ROL_NO_PERMITIDO' });
});

test('sin guardia de rol, direccion y comite reciben 404 y nunca el recurso', async () => {
  for (const rol of ['direccion_academica', 'comite_becas']) {
    const { estado, cuerpo } = await pedir('/prueba/abierta/propia', await sesion(rol));
    assert.strictEqual(estado, 404, rol);
    assert.ok(!JSON.stringify(cuerpo).includes('ingresosHogar'), rol);
  }
});

test('el manejador recibe el recurso proyectado por la politica', async () => {
  // Con una politica que permite a direccion, la proyeccion elimina los campos socioeconomicos.
  const { crearGuardias } = require('./guardias');
  const guardias = crearGuardias({ obtenerUsuario: () => usuarios.direccion_academica });
  const politicas = crearPoliticas({ asignaciones });
  const manejador = guardias.requerirAccesoARecurso(
    () => ({ id: 'r', ingresosHogar: 5, detalle: { estrato: 1 }, otro: 'ok' }),
    { permitir: () => true, proyectar: politicas.proyectarSolicitud },
  )(({ recurso }) => recurso);
  assert.deepStrictEqual(await manejador({ req: {} }), { id: 'r', detalle: {}, otro: 'ok' });
});
