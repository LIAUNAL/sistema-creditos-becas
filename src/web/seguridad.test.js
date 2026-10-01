'use strict';

const test = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const { abrirBaseDeDatos } = require('../infra/baseDeDatos');
const { ejecutarMigraciones } = require('../infra/migraciones');
const { crearAuditoria } = require('../infra/auditoria');
const { sembrarUsuarios } = require('../infra/sembrado');
const { iniciarServidor } = require('./servidor');
const { crearAutenticacion } = require('./autenticacion');
const { crearCsrf } = require('./csrf');
const { crearPoliticaCookies } = require('./cookies');

const CLAVES = {
  SEED_PASSWORD_ESTUDIANTE: 'clave-estudiante',
  SEED_PASSWORD_ASESOR_FINANCIERO: 'clave-asesor',
  SEED_PASSWORD_COMITE_BECAS: 'clave-comite',
  SEED_PASSWORD_DIRECCION_ACADEMICA: 'clave-direccion',
};
const ESTUDIANTE = { nombre_usuario: 'estudiante', contrasena: 'clave-estudiante' };
const ASESOR = { nombre_usuario: 'asesor_financiero', contrasena: 'clave-asesor' };

const abiertos = [];

async function levantar({ auth = {}, servidor: opcionesServidor = {} } = {}) {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  await sembrarUsuarios({ db, entorno: CLAVES });
  const reloj = { ahora: () => new Date('2026-01-01T10:00:00Z') };
  const auditoria = crearAuditoria({ db, reloj });
  const csrf = crearCsrf({ secreto: 'secreto-de-prueba-0123456789' });
  const autenticacion = crearAutenticacion({ db, reloj, auditoria, csrf, ...auth });
  const rutas = [
    ...autenticacion.rutas,
    ['POST', '/eco', async ({ leerCuerpo }) => ({ recibido: await leerCuerpo() })],
    ['PUT', '/eco', () => ({})],
    ['PATCH', '/eco', () => ({})],
    ['DELETE', '/eco', () => ({})],
    ['GET', '/colgada', () => new Promise(() => {})],
  ];
  const servidor = await iniciarServidor({
    puerto: 0,
    rutas,
    ...autenticacion.opcionesServidor,
    ...opcionesServidor,
  });
  abiertos.push(servidor);
  return { db, servidor, puerto: servidor.puerto, base: `http://127.0.0.1:${servidor.puerto}` };
}

test.after(async () => {
  for (const servidor of abiertos) await servidor.cerrar();
});

function login(base, cuerpo, cabeceras = {}) {
  return fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    body: JSON.stringify(cuerpo),
  });
}

async function iniciarSesion(base, credenciales = ESTUDIANTE) {
  const respuesta = await login(base, credenciales);
  assert.strictEqual(respuesta.status, 200);
  const cookie = respuesta.headers.getSetCookie().find((c) => c.startsWith('sid=')).split(';')[0];
  const { csrf } = await respuesta.json();
  return { cookie, csrf };
}

// Envía bytes crudos y devuelve todo lo recibido hasta que el servidor cierra la conexión.
function conversarPorSocket(puerto, texto, limiteMs = 3000) {
  return new Promise((resolver) => {
    const socket = net.connect(puerto, '127.0.0.1');
    let recibido = '';
    const plazo = setTimeout(() => {
      socket.destroy();
      resolver({ recibido, cerrado: false });
    }, limiteMs);
    socket.on('data', (trozo) => {
      recibido += trozo;
    });
    socket.on('close', () => {
      clearTimeout(plazo);
      resolver({ recibido, cerrado: true });
    });
    socket.on('error', () => {});
    socket.write(texto);
  });
}

// --- Unidades -------------------------------------------------------------

test('csrf: el token es determinista por sesión, distinto entre sesiones y se compara sin lanzar', () => {
  const csrf = crearCsrf({ secreto: 'secreto-de-prueba-0123456789' });
  const token = csrf.generar('sesion-a');
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.strictEqual(csrf.generar('sesion-a'), token);
  assert.notStrictEqual(csrf.generar('sesion-b'), token);
  assert.strictEqual(csrf.verificar('sesion-a', token), true);
  assert.strictEqual(csrf.verificar('sesion-b', token), false);
  for (const invalido of [undefined, null, '', 'corto', 'x'.repeat(200), 42, [token]]) {
    assert.strictEqual(csrf.verificar('sesion-a', invalido), false);
  }
  const otroServidor = crearCsrf({ secreto: 'otro-secreto-0123456789' });
  assert.strictEqual(otroServidor.verificar('sesion-a', token), false);
});

test('csrf: sin secreto usa uno aleatorio por proceso y un secreto corto se rechaza', () => {
  const a = crearCsrf({ secreto: '' });
  const b = crearCsrf({ secreto: '' });
  assert.notStrictEqual(a.generar('s'), b.generar('s'));
  assert.throws(() => crearCsrf({ secreto: 'corto' }), /CSRF_SECRET/);
});

test('cookies: HttpOnly, SameSite=Lax y Path=/ siempre; Secure según HTTPS, proxy de confianza o COOKIE_SECURE', () => {
  const peticion = (cabeceras = {}, cifrado = false) => ({ headers: cabeceras, socket: { encrypted: cifrado } });
  const base = crearPoliticaCookies({ entorno: {} });
  const plana = base.serializar(peticion(), 'sid', 'abc', 60);
  assert.strictEqual(plana, 'sid=abc; Path=/; HttpOnly; SameSite=Lax; Max-Age=60');

  assert.match(base.serializar(peticion({}, true), 'sid', 'abc', 60), /; Secure$/);
  // Sin TRUST_PROXY el encabezado X-Forwarded-Proto se ignora (podría falsearlo el cliente).
  assert.doesNotMatch(
    base.serializar(peticion({ 'x-forwarded-proto': 'https' }), 'sid', 'abc', 60),
    /Secure/,
  );

  const proxy = crearPoliticaCookies({ entorno: { TRUST_PROXY: '1' } });
  assert.match(proxy.serializar(peticion({ 'x-forwarded-proto': 'https' }), 'sid', 'abc', 60), /; Secure$/);
  assert.match(proxy.serializar(peticion({ 'x-forwarded-proto': 'https, http' }), 'sid', 'abc', 60), /; Secure$/);
  assert.doesNotMatch(proxy.serializar(peticion({ 'x-forwarded-proto': 'http' }), 'sid', 'abc', 60), /Secure/);

  const forzada = crearPoliticaCookies({ entorno: { COOKIE_SECURE: '1' } });
  assert.match(forzada.serializar(peticion(), 'sid', 'abc', 60), /; Secure$/);
});

// --- Escenarios del spec -------------------------------------------------

test('Scenario: una petición POST sin token CSRF válido se rechaza con 403', async () => {
  const { base } = await levantar();
  const { cookie } = await iniciarSesion(base);
  const respuesta = await fetch(`${base}/logout`, { method: 'POST', headers: { Cookie: cookie } });
  assert.strictEqual(respuesta.status, 403);
  assert.deepStrictEqual(await respuesta.json(), { codigo: 'CSRF_INVALIDO' });
  // la sesión sigue viva: el rechazo no tuvo efectos
  assert.strictEqual((await fetch(`${base}/me`, { headers: { Cookie: cookie } })).status, 200);
});

test('Scenario: la cookie de sesión incluye HttpOnly y SameSite, y Secure cuando aplica', async () => {
  const { base } = await levantar();
  const respuesta = await login(base, ESTUDIANTE);
  const cookie = respuesta.headers.getSetCookie().find((c) => c.startsWith('sid='));
  assert.match(cookie, /; Path=\//);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; SameSite=Lax/);
  assert.doesNotMatch(cookie, /Secure/);

  const seguro = await levantar({
    auth: { cookies: crearPoliticaCookies({ entorno: { TRUST_PROXY: '1' } }) },
  });
  const tras = await login(seguro.base, ESTUDIANTE, { 'X-Forwarded-Proto': 'https' });
  const cookieSegura = tras.headers.getSetCookie().find((c) => c.startsWith('sid='));
  assert.match(cookieSegura, /; HttpOnly/);
  assert.match(cookieSegura, /; SameSite=Lax/);
  assert.match(cookieSegura, /; Secure/);
});

test('Scenario: un cuerpo mayor al límite configurado responde 413 y cierra sin leer el resto', async () => {
  const { base, puerto } = await levantar();
  const grande = await login(base, { nombre_usuario: 'a', contrasena: 'x'.repeat(200 * 1024) });
  assert.strictEqual(grande.status, 413);
  assert.deepStrictEqual(await grande.json(), { codigo: 'CUERPO_DEMASIADO_GRANDE' });

  // Declara 200 KB pero no envía el cuerpo: el 413 llega de inmediato y la conexión se cierra.
  const { recibido, cerrado } = await conversarPorSocket(
    puerto,
    'POST /login HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 204800\r\n\r\n{"a":',
  );
  assert.match(recibido, /^HTTP\/1\.1 413/);
  assert.match(recibido, /connection: close/i);
  assert.strictEqual(cerrado, true);
});

test('Scenario: una petición que se detiene sin completar el cuerpo se cierra al vencer el tiempo límite', async () => {
  const { puerto } = await levantar({ servidor: { tiempos: { manejador: 200 } } });
  const inicio = Date.now();
  const { recibido, cerrado } = await conversarPorSocket(
    puerto,
    'POST /login HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{"nombre_usuario":',
  );
  assert.strictEqual(cerrado, true, 'el servidor debe cerrar la conexión');
  assert.match(recibido, /^HTTP\/1\.1 408/);
  assert.ok(Date.now() - inicio < 2500);
});

// --- Casos adicionales ---------------------------------------------------

test('un token CSRF válido en x-csrf-token o en el campo _csrf se acepta', async () => {
  const { base } = await levantar();
  const { cookie, csrf } = await iniciarSesion(base);

  const porCabecera = await fetch(`${base}/eco`, {
    method: 'POST',
    headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
    body: JSON.stringify({ a: '1' }),
  });
  assert.strictEqual(porCabecera.status, 200);
  assert.deepStrictEqual((await porCabecera.json()).recibido, { a: '1' });

  const porFormulario = await fetch(`${base}/eco`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: csrf, a: '2' }).toString(),
  });
  assert.strictEqual(porFormulario.status, 200);
  assert.strictEqual((await porFormulario.json()).recibido.a, '2');

  const salida = await fetch(`${base}/logout`, {
    method: 'POST',
    headers: { Cookie: cookie, 'X-CSRF-Token': csrf },
  });
  assert.strictEqual(salida.status, 200);
});

test('el token de otra sesión, uno alterado o ninguna sesión se rechazan con 403', async () => {
  const { base } = await levantar();
  const a = await iniciarSesion(base, ESTUDIANTE);
  const b = await iniciarSesion(base, ASESOR);
  assert.notStrictEqual(a.csrf, b.csrf);

  const cruzado = await fetch(`${base}/logout`, {
    method: 'POST',
    headers: { Cookie: a.cookie, 'X-CSRF-Token': b.csrf },
  });
  assert.strictEqual(cruzado.status, 403);
  // El último carácter se cambia SIEMPRE por uno distinto: si el token ya terminara en "0",
  // reemplazarlo por "0" lo dejaría idéntico al original y el test fallaría 1 de cada 16 veces.
  const ultimo = a.csrf.slice(-1);
  const alterado = await fetch(`${base}/logout`, {
    method: 'POST',
    headers: { Cookie: a.cookie, 'X-CSRF-Token': `${a.csrf.slice(0, -1)}${ultimo === '0' ? '1' : '0'}` },
  });
  assert.strictEqual(alterado.status, 403);
  const sinSesion = await fetch(`${base}/logout`, { method: 'POST', headers: { 'X-CSRF-Token': a.csrf } });
  assert.strictEqual(sinSesion.status, 403);
  const formularioSinToken = await fetch(`${base}/eco`, {
    method: 'POST',
    headers: { Cookie: a.cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'a=1',
  });
  assert.strictEqual(formularioSinToken.status, 403);
});

test('PUT, PATCH y DELETE sin token también se rechazan con 403 y GET no lo exige', async () => {
  const { base } = await levantar();
  const { cookie } = await iniciarSesion(base);
  for (const metodo of ['PUT', 'PATCH', 'DELETE']) {
    const respuesta = await fetch(`${base}/eco`, { method: metodo, headers: { Cookie: cookie } });
    assert.strictEqual(respuesta.status, 403, metodo);
  }
  assert.strictEqual((await fetch(`${base}/health`)).status, 200);
});

test('GET /csrf entrega el token de la sesión y exige sesión', async () => {
  const { base } = await levantar();
  const { cookie, csrf } = await iniciarSesion(base);
  const respuesta = await fetch(`${base}/csrf`, { headers: { Cookie: cookie } });
  assert.strictEqual(respuesta.status, 200);
  assert.deepStrictEqual(await respuesta.json(), { csrf });
  assert.strictEqual((await fetch(`${base}/csrf`)).status, 401);
});

test('POST /login valida el origen: cross-site se rechaza, mismo origen y clientes sin cabeceras se aceptan', async () => {
  const { base, puerto } = await levantar();
  const ajeno = await login(base, ESTUDIANTE, { Origin: 'http://evil.example' });
  assert.strictEqual(ajeno.status, 403);
  assert.deepStrictEqual(await ajeno.json(), { codigo: 'ORIGEN_NO_PERMITIDO' });
  assert.strictEqual((await login(base, ESTUDIANTE, { Origin: 'null' })).status, 403);
  assert.strictEqual((await login(base, ESTUDIANTE, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.strictEqual((await login(base, ESTUDIANTE, { 'Sec-Fetch-Site': 'same-site' })).status, 403);

  assert.strictEqual(
    (await login(base, ESTUDIANTE, { Origin: `http://127.0.0.1:${puerto}` })).status,
    200,
  );
  assert.strictEqual((await login(base, ESTUDIANTE, { 'Sec-Fetch-Site': 'same-origin' })).status, 200);
  assert.strictEqual((await login(base, ESTUDIANTE)).status, 200, 'cliente no navegador sin cabeceras');
});

test('las cabeceras de seguridad están presentes en todas las respuestas', async () => {
  const { base } = await levantar();
  const { cookie } = await iniciarSesion(base);
  const respuestas = [
    await fetch(`${base}/health`),
    await fetch(`${base}/no-existe`),
    await fetch(`${base}/me`),
    await fetch(`${base}/me`, { headers: { Cookie: cookie } }),
    await fetch(`${base}/logout`, { method: 'POST', headers: { Cookie: cookie } }),
    await login(base, { nombre_usuario: 'a', contrasena: 'x'.repeat(200 * 1024) }),
    await login(base, { nombre_usuario: 'a', contrasena: 'x' }),
  ];
  assert.deepStrictEqual(
    respuestas.map((r) => r.status),
    [200, 404, 401, 200, 403, 413, 401],
  );
  for (const respuesta of respuestas) {
    assert.strictEqual(respuesta.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(respuesta.headers.get('x-frame-options'), 'DENY');
    assert.strictEqual(respuesta.headers.get('referrer-policy'), 'no-referrer');
    const csp = respuesta.headers.get('content-security-policy');
    for (const directiva of ["default-src 'self'", "script-src 'self'", "style-src 'self'", "frame-ancestors 'none'"]) {
      assert.ok(csp.includes(directiva), `${directiva} en ${csp}`);
    }
    assert.ok(!csp.includes('unsafe-inline'));
  }
});

test('el lector de cuerpo compartido se aplica a /login con límite por defecto de 64 KiB y configurable', async () => {
  const { base } = await levantar();
  // 20 KiB superaba el límite local anterior (16 KiB) y ahora es válido.
  const mediano = await login(base, { nombre_usuario: 'estudiante', contrasena: 'x'.repeat(20 * 1024) });
  assert.strictEqual(mediano.status, 401);
  const enorme = await login(base, { nombre_usuario: 'estudiante', contrasena: 'x'.repeat(70 * 1024) });
  assert.strictEqual(enorme.status, 413);

  const pequeno = await levantar({ servidor: { limiteCuerpo: 1024 } });
  const sobre = await login(pequeno.base, { nombre_usuario: 'a', contrasena: 'x'.repeat(2048) });
  assert.strictEqual(sobre.status, 413);
  const dentro = await login(pequeno.base, ESTUDIANTE);
  assert.strictEqual(dentro.status, 200);
});

test('un manejador que no responde recibe 503 y la conexión se cierra', async () => {
  const { base, servidor } = await levantar({ servidor: { tiempos: { manejador: 150 } } });
  const respuesta = await fetch(`${base}/colgada`);
  assert.strictEqual(respuesta.status, 503);
  assert.deepStrictEqual(await respuesta.json(), { codigo: 'TIEMPO_AGOTADO' });
  assert.strictEqual(respuesta.headers.get('connection'), 'close');
  assert.strictEqual(servidor.servidor.listening, true);
});

test('los tiempos del servidor HTTP son inyectables y tienen valores por defecto acotados', async () => {
  const por_defecto = await levantar();
  const http = por_defecto.servidor.servidor;
  assert.ok(http.headersTimeout > 0 && http.headersTimeout <= http.requestTimeout);
  assert.ok(http.requestTimeout > 0 && http.requestTimeout <= 60_000);
  assert.ok(http.keepAliveTimeout > 0 && http.keepAliveTimeout <= 10_000);
  assert.ok(http.timeout > 0);

  const ajustado = await levantar({
    servidor: {
      tiempos: { headers: 1000, solicitud: 2000, keepAlive: 3000, socket: 4000, manejador: 5000 },
    },
  });
  const configurado = ajustado.servidor.servidor;
  assert.strictEqual(configurado.headersTimeout, 1000);
  assert.strictEqual(configurado.requestTimeout, 2000);
  assert.strictEqual(configurado.keepAliveTimeout, 3000);
  assert.strictEqual(configurado.timeout, 4000);
});

test('login_fallido guarda un nombre de usuario de máximo 64 caracteres y sin caracteres de control', async () => {
  const { base, db } = await levantar();
  const atacante = `  a\u0000b\u001b\n${'x'.repeat(100)}`;
  const respuesta = await login(base, { nombre_usuario: atacante, contrasena: 'x' });
  assert.strictEqual(respuesta.status, 401);
  const fila = db.prepare("SELECT actor FROM audit_log WHERE accion = 'login_fallido'").get();
  assert.strictEqual(fila.actor, `  ab${'x'.repeat(60)}`);
  assert.strictEqual(fila.actor.length, 64);
  assert.doesNotMatch(fila.actor, /[\u0000-\u001f\u007f-\u009f]/);

  const soloControl = await login(base, { nombre_usuario: '\u0000\u0007', contrasena: 'x' });
  assert.strictEqual(soloControl.status, 401);
  const filas = db.prepare("SELECT actor FROM audit_log WHERE accion = 'login_fallido' ORDER BY id").all();
  assert.strictEqual(filas[1].actor, 'anonimo');
});
