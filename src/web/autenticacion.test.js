'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { abrirBaseDeDatos } = require('../infra/baseDeDatos');
const { ejecutarMigraciones } = require('../infra/migraciones');
const { crearAuditoria } = require('../infra/auditoria');
const { sembrarUsuarios } = require('../infra/sembrado');
const { iniciarServidor } = require('./servidor');
const { crearAutenticacion } = require('./autenticacion');

const CLAVES = {
  SEED_PASSWORD_ESTUDIANTE: 'clave-estudiante',
  SEED_PASSWORD_ASESOR_FINANCIERO: 'clave-asesor',
  SEED_PASSWORD_COMITE_BECAS: 'clave-comite',
  SEED_PASSWORD_DIRECCION_ACADEMICA: 'clave-direccion',
};

// Reloj mutable para avanzar el tiempo en las pruebas.
function crearRelojManual(inicio = new Date('2026-01-01T10:00:00Z')) {
  let actual = inicio.getTime();
  return {
    ahora: () => new Date(actual),
    avanzar: (ms) => {
      actual += ms;
    },
  };
}

const abiertos = [];

async function levantar(opciones = {}) {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  await sembrarUsuarios({ db, entorno: CLAVES });
  const reloj = crearRelojManual();
  const auditoria = crearAuditoria({ db, reloj });
  const auth = crearAutenticacion({ db, reloj, auditoria, ...opciones });
  const rutas = [
    ...auth.rutas,
    ['GET', '/solo-asesor', auth.requerirRol('asesor_financiero')(({ usuario }) => ({ ok: usuario.rol }))],
    ['GET', '/protegida', auth.requerirSesion(({ usuario }) => ({ ok: usuario.nombre_usuario }))],
  ];
  const servidor = await iniciarServidor({ puerto: 0, rutas });
  abiertos.push(servidor);
  const base = `http://127.0.0.1:${servidor.puerto}`;
  return { db, reloj, base, servidor };
}

test.after(async () => {
  for (const servidor of abiertos) await servidor.cerrar();
});

function login(base, cuerpo, cookie) {
  return fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(cuerpo),
  });
}

function cookieDe(respuesta) {
  const linea = respuesta.headers.getSetCookie().find((c) => c.startsWith('sid='));
  return linea ? linea.split(';')[0] : null;
}

const ESTUDIANTE = { nombre_usuario: 'estudiante', contrasena: 'clave-estudiante' };

test('Scenario: credenciales correctas crean una sesión en SQLite y el identificador rota', async () => {
  const { base, db } = await levantar();
  const primera = await login(base, ESTUDIANTE);
  assert.strictEqual(primera.status, 200);
  const setCookie = primera.headers.getSetCookie().find((c) => c.startsWith('sid='));
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  const cookie1 = cookieDe(primera);
  assert.match(cookie1, /^sid=[0-9a-f]{64}$/);

  const filas = db.prepare('SELECT * FROM sesiones').all();
  assert.strictEqual(filas.length, 1);
  assert.notStrictEqual(filas[0].id, cookie1.slice(4), 'solo se guarda el hash, no el token');
  assert.match(filas[0].id, /^[0-9a-f]{64}$/);

  const segunda = await login(base, ESTUDIANTE, cookie1);
  assert.strictEqual(segunda.status, 200);
  const cookie2 = cookieDe(segunda);
  assert.notStrictEqual(cookie2, cookie1);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM sesiones').get().n, 1);
  assert.strictEqual((await fetch(`${base}/me`, { headers: { Cookie: cookie1 } })).status, 401);
  assert.strictEqual((await fetch(`${base}/me`, { headers: { Cookie: cookie2 } })).status, 200);
});

test('login acepta application/x-www-form-urlencoded', async () => {
  const { base } = await levantar();
  const respuesta = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'nombre_usuario=estudiante&contrasena=clave-estudiante',
  });
  assert.strictEqual(respuesta.status, 200);
  assert.ok(cookieDe(respuesta));
});

test('login rechaza cuerpos mayores a 16 KiB con 413 y cuerpos inválidos con 400', async () => {
  const { base } = await levantar();
  const grande = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre_usuario: 'a', contrasena: 'x'.repeat(20 * 1024) }),
  });
  assert.strictEqual(grande.status, 413);
  const roto = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{no es json',
  });
  assert.strictEqual(roto.status, 400);
  const sinCampos = await login(base, { nombre_usuario: 'estudiante' });
  assert.strictEqual(sinCampos.status, 400);
});

test('Scenario: fallos repetidos más allá del límite responden 429 y el éxito reinicia el contador', async () => {
  const { base, reloj } = await levantar({ maxIntentos: 3, ventanaMs: 60_000 });
  const mala = { nombre_usuario: 'estudiante', contrasena: 'mala' };
  for (let i = 0; i < 3; i += 1) assert.strictEqual((await login(base, mala)).status, 401);
  assert.strictEqual((await login(base, mala)).status, 429);
  // incluso la contraseña correcta queda bloqueada dentro de la ventana
  assert.strictEqual((await login(base, ESTUDIANTE)).status, 429);
  // otro usuario no se ve afectado
  const otro = await login(base, { nombre_usuario: 'asesor_financiero', contrasena: 'clave-asesor' });
  assert.strictEqual(otro.status, 200);
  // pasada la ventana se puede intentar de nuevo
  reloj.avanzar(60_001);
  assert.strictEqual((await login(base, ESTUDIANTE)).status, 200);
  // el éxito reinicia: 2 fallos + éxito + 2 fallos no bloquea
  for (let i = 0; i < 2; i += 1) await login(base, mala);
  assert.strictEqual((await login(base, ESTUDIANTE)).status, 200);
  for (let i = 0; i < 2; i += 1) assert.strictEqual((await login(base, mala)).status, 401);
  assert.strictEqual((await login(base, ESTUDIANTE)).status, 200);
});

test('Scenario: un estudiante en una ruta de asesor_financiero recibe 403', async () => {
  const { base } = await levantar();
  const cookie = cookieDe(await login(base, ESTUDIANTE));
  const respuesta = await fetch(`${base}/solo-asesor`, { headers: { Cookie: cookie } });
  assert.strictEqual(respuesta.status, 403);
  assert.deepStrictEqual(await respuesta.json(), { codigo: 'ROL_NO_PERMITIDO' });

  const asesor = cookieDe(
    await login(base, { nombre_usuario: 'asesor_financiero', contrasena: 'clave-asesor' }),
  );
  const ok = await fetch(`${base}/solo-asesor`, { headers: { Cookie: asesor } });
  assert.strictEqual(ok.status, 200);
  assert.deepStrictEqual(await ok.json(), { ok: 'asesor_financiero' });
});

test('Scenario: sin sesión, una ruta protegida responde 401', async () => {
  const { base } = await levantar();
  for (const ruta of ['/me', '/protegida', '/solo-asesor']) {
    const respuesta = await fetch(`${base}${ruta}`);
    assert.strictEqual(respuesta.status, 401);
    assert.deepStrictEqual(await respuesta.json(), { codigo: 'NO_AUTENTICADO' });
  }
  const falsa = await fetch(`${base}/me`, { headers: { Cookie: `sid=${'a'.repeat(64)}` } });
  assert.strictEqual(falsa.status, 401);
});

test('Scenario: logout elimina la sesión y el mismo identificador deja de funcionar', async () => {
  const { base, db } = await levantar();
  const cookie = cookieDe(await login(base, ESTUDIANTE));
  assert.strictEqual((await fetch(`${base}/me`, { headers: { Cookie: cookie } })).status, 200);
  const salida = await fetch(`${base}/logout`, { method: 'POST', headers: { Cookie: cookie } });
  assert.strictEqual(salida.status, 200);
  assert.match(salida.headers.getSetCookie().find((c) => c.startsWith('sid=')), /Max-Age=0/);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM sesiones').get().n, 0);
  assert.strictEqual((await fetch(`${base}/me`, { headers: { Cookie: cookie } })).status, 401);
});

test('GET /me devuelve el usuario sin el hash', async () => {
  const { base } = await levantar();
  const cookie = cookieDe(await login(base, ESTUDIANTE));
  const cuerpo = await (await fetch(`${base}/me`, { headers: { Cookie: cookie } })).json();
  assert.deepStrictEqual(Object.keys(cuerpo).sort(), ['id', 'nombre_usuario', 'rol']);
  assert.strictEqual(cuerpo.rol, 'estudiante');
});

test('una sesión expirada se rechaza y se elimina', async () => {
  const { base, reloj, db } = await levantar({ duracionSesionMs: 1000 });
  const cookie = cookieDe(await login(base, ESTUDIANTE));
  assert.strictEqual((await fetch(`${base}/me`, { headers: { Cookie: cookie } })).status, 200);
  reloj.avanzar(1001);
  assert.strictEqual((await fetch(`${base}/me`, { headers: { Cookie: cookie } })).status, 401);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM sesiones').get().n, 0);
});

test('un login fallido de usuario inexistente es indistinguible de contraseña incorrecta', async () => {
  const { base } = await levantar();
  const desconocido = await login(base, { nombre_usuario: 'fantasma', contrasena: 'x' });
  const incorrecta = await login(base, { nombre_usuario: 'estudiante', contrasena: 'x' });
  assert.strictEqual(desconocido.status, 401);
  assert.strictEqual(incorrecta.status, 401);
  assert.strictEqual(await desconocido.text(), await incorrecta.text());
  assert.strictEqual(cookieDe(desconocido), null);
});

test('se audita login_exitoso, login_fallido y logout sin registrar contraseñas', async () => {
  const { base, db } = await levantar();
  await login(base, { nombre_usuario: 'fantasma', contrasena: 'secreto-fantasma' });
  const cookie = cookieDe(await login(base, ESTUDIANTE));
  await fetch(`${base}/logout`, { method: 'POST', headers: { Cookie: cookie } });
  const entradas = db.prepare('SELECT * FROM audit_log ORDER BY id').all();
  assert.deepStrictEqual(
    entradas.map((e) => [e.accion, e.actor]),
    [
      ['login_fallido', 'fantasma'],
      ['login_exitoso', 'estudiante'],
      ['logout', 'estudiante'],
    ],
  );
  const volcado = JSON.stringify(entradas);
  assert.ok(!volcado.includes('secreto-fantasma'));
  assert.ok(!volcado.includes('clave-estudiante'));
  assert.ok(!volcado.includes(cookie.slice(4)));
});
