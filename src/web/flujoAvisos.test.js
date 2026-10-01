'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  CLAVES,
  levantarAplicacion,
  crearUsuario,
  clienteConSesion,
  crearCliente,
  crearSolicitudEnviada,
} = require('./ayudaPruebasWeb');

// Story 5.16 (P16): bandeja de avisos dentro de la aplicacion. Servidor real en puerto efimero, SQLite en memoria
// y avisos generados por los flujos reales (envio, decision, desembolso, vencido, caso limitrofe). La bandeja lee
// la tabla `notifications` directamente: no depende de `entregada_en` ni toca el estado de negocio.

const AHORA = '2026-05-04T12:30:00.000Z';

function relojMutable(inicial) {
  let ahora = new Date(inicial);
  return { ahora: () => new Date(ahora), fijar: (fecha) => { ahora = new Date(fecha); } };
}

async function entorno(t) {
  const reloj = relojMutable(AHORA);
  const app = await levantarAplicacion({ reloj });
  t.after(app.cerrar);
  await crearUsuario(app.db, 'estudiante2', 'estudiante', 'clave-estudiante-2');
  return { ...app, reloj };
}

const estudiante = (app) => clienteConSesion(app.base, 'estudiante', CLAVES.SEED_PASSWORD_ESTUDIANTE);
const estudiante2 = (app) => clienteConSesion(app.base, 'estudiante2', 'clave-estudiante-2');
const asesor = (app) => clienteConSesion(app.base, 'asesor_financiero', CLAVES.SEED_PASSWORD_ASESOR_FINANCIERO);
const comite = (app) => clienteConSesion(app.base, 'comite_becas', CLAVES.SEED_PASSWORD_COMITE_BECAS);
const direccion = (app) => clienteConSesion(app.base, 'direccion_academica', CLAVES.SEED_PASSWORD_DIRECCION_ACADEMICA);

const TERMINOS = Object.freeze({ monto: '1200000', numeroCuotas: '3', fechaPrimeraCuota: '2026-03-01' });
const LIMITROFE = Object.freeze({ periodoAcademico: '2026-2', promedioAcumulado: 3.5, estrato: 4, ingresosHogar: 3000000 });

const filas = (db, sql, ...parametros) => db.prepare(sql).all(...parametros).map((f) => ({ ...f }));
const avisosDe = (db, tipo) => filas(db, 'SELECT * FROM notifications WHERE tipo = ? ORDER BY id', tipo);
const idUsuario = (db, nombre) => String(db.prepare('SELECT id FROM usuarios WHERE nombre_usuario = ?').get(nombre).id);

// Copia de todas las tablas de negocio (todo salvo la bandeja y las sesiones) para comprobar que no cambian.
function instantaneaDeNegocio(db) {
  const tablas = filas(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .map((f) => f.name)
    .filter((nombre) => !['notifications', 'sesiones'].includes(nombre));
  return Object.fromEntries(tablas.map((nombre) => [nombre, filas(db, `SELECT * FROM ${nombre} ORDER BY rowid`)]));
}

function insertarAviso(db, { tipo = 'envio', destinatarioTipo = 'estudiante', destinatarioId, payload = {}, creadaEn = AHORA }) {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO notifications (tipo, destinatario_tipo, destinatario_id, payload, creada_en) VALUES (?, ?, ?, ?, ?)')
    .run(tipo, destinatarioTipo, String(destinatarioId), JSON.stringify(payload), creadaEn);
  return Number(lastInsertRowid);
}

// Ids de aviso en el orden en que aparecen en la pagina (cada item lleva id="aviso-N").
const idsEnPagina = (texto) => [...texto.matchAll(/id="aviso-(\d+)"/g)].map((m) => Number(m[1]));

async function solicitudAprobada(app, alumno) {
  const id = await crearSolicitudEnviada(alumno);
  const cliente = await asesor(app);
  await cliente.post(`/asesor/solicitudes/${id}/reclamar`);
  assert.strictEqual((await cliente.post(`/asesor/solicitudes/${id}/aprobar`, TERMINOS)).estado, 303);
  const cuotas = filas(app.db, 'SELECT id FROM desembolsos WHERE solicitud_id = ? ORDER BY numero_cuota', id).map((f) => f.id);
  return { id, cliente, cuotas };
}

// ---------------------------------------------------------------- Scenarios de la spec

test('Scenario: un usuario abre su bandeja y ve solo los avisos propios', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  const otro = await estudiante2(app);
  await crearSolicitudEnviada(alumno);
  await crearSolicitudEnviada(otro);
  const envios = avisosDe(app.db, 'envio');
  assert.strictEqual(envios.length, 2);
  const propio = envios.find((f) => f.destinatario_id === idUsuario(app.db, 'estudiante'));
  const ajeno = envios.find((f) => f.destinatario_id === idUsuario(app.db, 'estudiante2'));

  const mio = await alumno.get('/avisos');
  const suyo = await otro.get('/avisos');

  assert.strictEqual(mio.estado, 200);
  assert.deepStrictEqual(idsEnPagina(mio.texto), [propio.id]);
  assert.match(mio.texto, /Su solicitud de crédito fue enviada a revisión/);
  assert.deepStrictEqual(idsEnPagina(suyo.texto), [ajeno.id]);
});

test('Scenario: el usuario marca un aviso como leido: queda marcado y el estado de negocio no cambia', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  const { id, cuotas, cliente } = await solicitudAprobada(app, alumno);
  await cliente.post(`/asesor/desembolsos/${cuotas[0]}/ejecutar`);
  const [aviso, otroAviso] = filas(app.db, 'SELECT * FROM notifications WHERE destinatario_id IN (?, ?) ORDER BY id', idUsuario(app.db, 'estudiante'), id);
  assert.strictEqual(aviso.leida_en, null);
  const antes = instantaneaDeNegocio(app.db);
  app.reloj.fijar('2026-05-04T14:00:00.000Z');

  const respuesta = await alumno.post(`/avisos/${aviso.id}/leer`);

  assert.strictEqual(respuesta.estado, 303);
  assert.strictEqual(respuesta.ubicacion, '/avisos');
  const [leido] = filas(app.db, 'SELECT * FROM notifications WHERE id = ?', aviso.id);
  assert.strictEqual(leido.leida_en, '2026-05-04T14:00:00.000Z');
  assert.strictEqual(filas(app.db, 'SELECT * FROM notifications WHERE id = ?', otroAviso.id)[0].leida_en, null);
  assert.deepStrictEqual(instantaneaDeNegocio(app.db), antes);
});

test('Scenario: un usuario sin avisos abre la bandeja y ve una lista vacia sin error', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante2(app);

  const respuesta = await alumno.get('/avisos');

  assert.strictEqual(respuesta.estado, 200);
  assert.match(respuesta.texto, /No tiene avisos/);
  assert.doesNotMatch(respuesta.texto, /id="aviso-/);
  assert.match(respuesta.texto, /<h1>Avisos<\/h1>/);
});

// ---------------------------------------------------------------- Resolucion de destinatarios y mensajes

test('los avisos dirigidos a la solicitud llegan solo al estudiante dueno, con mensajes legibles', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  const otro = await estudiante2(app);
  await crearSolicitudEnviada(otro);
  const { cuotas, cliente } = await solicitudAprobada(app, alumno);
  await cliente.post(`/asesor/desembolsos/${cuotas[0]}/ejecutar`);
  const revision = await (await direccion(app)).post('/direccion/vencimientos/revisar');
  assert.strictEqual(revision.estado, 303);

  const mio = (await alumno.get('/avisos')).texto;
  const ajeno = (await otro.get('/avisos')).texto;

  assert.match(mio, /Su solicitud de crédito fue enviada a revisión/);
  assert.match(mio, /Su solicitud de crédito fue aprobada/);
  assert.match(mio, /Se ejecutó la cuota 1 de su crédito por \$400\.000 el 04\/05\/2026/);
  assert.match(mio, /La cuota 2 de su crédito está vencida/);
  assert.doesNotMatch(ajeno, /cuota/);
  assert.strictEqual(idsEnPagina(ajeno).length, 1);
});

test('el rechazo del asesor llega al estudiante como aviso de decision', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  const id = await crearSolicitudEnviada(alumno);
  const cliente = await asesor(app);
  await cliente.post(`/asesor/solicitudes/${id}/reclamar`);
  assert.strictEqual((await cliente.post(`/asesor/solicitudes/${id}/rechazar`, { motivo: 'Ingresos no soportados' })).estado, 303);

  const pagina = (await alumno.get('/avisos')).texto;

  assert.match(pagina, /Su solicitud de crédito fue rechazada/);
  assert.doesNotMatch(pagina, /Ingresos no soportados/);
  assert.match(pagina, new RegExp(`href="/solicitudes/${id}"`));
});

test('el integrante del comite ve los avisos de casos limitrofes solo de los casos que tiene asignados', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  const primero = await comite(app);
  const primerCaso = (await alumno.postJson('/api/becas/solicitudes', LIMITROFE));
  const idPrimerCaso = JSON.parse(primerCaso.texto).id;
  await crearUsuario(app.db, 'comite2', 'comite_becas', 'clave-comite2');
  const segundo = await clienteConSesion(app.base, 'comite2', 'clave-comite2');
  const idSegundoCaso = JSON.parse((await alumno.postJson('/api/becas/solicitudes', { ...LIMITROFE, periodoAcademico: '2026-3' })).texto).id;
  assert.strictEqual(avisosDe(app.db, 'caso_limitrofe').length, 2);

  const delPrimero = (await primero.get('/avisos')).texto;
  const delSegundo = (await segundo.get('/avisos')).texto;

  assert.strictEqual(idsEnPagina(delPrimero).length, 2);
  assert.match(delPrimero, new RegExp(`href="/comite/casos/${idPrimerCaso}"`));
  assert.match(delPrimero, new RegExp(`href="/comite/casos/${idSegundoCaso}"`));
  assert.match(delPrimero, /Nuevo caso limítrofe para revisión del comité/);
  assert.strictEqual(idsEnPagina(delSegundo).length, 1);
  assert.match(delSegundo, new RegExp(`href="/comite/casos/${idSegundoCaso}"`));
  assert.doesNotMatch(delSegundo, new RegExp(idPrimerCaso));
});

test('asesor y direccion pueden abrir la bandeja y ven el estado vacio', async (t) => {
  const app = await entorno(t);
  await crearSolicitudEnviada(await estudiante(app));
  await (await estudiante(app)).postJson('/api/becas/solicitudes', LIMITROFE);
  for (const abrir of [asesor, direccion]) {
    const cliente = await abrir(app);
    const respuesta = await cliente.get('/avisos');
    assert.strictEqual(respuesta.estado, 200);
    assert.match(respuesta.texto, /No tiene avisos/);
    assert.strictEqual(idsEnPagina(respuesta.texto).length, 0);
    assert.doesNotMatch(respuesta.texto, /<a href="\/avisos">/);
  }
});

// ---------------------------------------------------------------- Privacidad (NFR-003)

test('el estudiante nunca ve el puntaje ni datos socioeconomicos en los avisos que se muestran', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  await alumno.postJson('/api/becas/solicitudes', LIMITROFE);
  await solicitudAprobada(app, alumno);
  const { puntaje } = JSON.parse(avisosDe(app.db, 'caso_limitrofe')[0].payload);
  assert.ok(Number.isFinite(puntaje));

  const pagina = (await alumno.get('/avisos')).texto;

  assert.doesNotMatch(pagina, /limítrofe/i);
  assert.doesNotMatch(pagina, new RegExp(String(puntaje).replace('.', '\\.')));
  assert.doesNotMatch(pagina, /puntaje|ingresos|estrato|promedio|3000000|1500000/i);
});

test('un aviso de caso limitrofe dirigido por error al estudiante no se lista, no se cuenta ni se puede leer', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  const idAlumno = idUsuario(app.db, 'estudiante');
  const payload = { idCaso: 'caso-x', puntaje: 61.7342, ingresosHogar: 987654 };
  const directo = insertarAviso(app.db, { tipo: 'caso_limitrofe', destinatarioTipo: 'estudiante', destinatarioId: idAlumno, payload });
  const porSolicitud = insertarAviso(app.db, { tipo: 'caso_limitrofe', destinatarioTipo: 'solicitud', destinatarioId: await crearSolicitudEnviada(alumno), payload });

  const pagina = (await alumno.get('/avisos')).texto;
  const lectura = await alumno.post(`/avisos/${directo}/leer`);

  assert.doesNotMatch(pagina, /61\.7342|987654|caso-x/);
  assert.ok(!idsEnPagina(pagina).includes(directo) && !idsEnPagina(pagina).includes(porSolicitud));
  assert.match(pagina, /Avisos \(1\)/);
  assert.strictEqual(lectura.estado, 404);
  assert.strictEqual(filas(app.db, 'SELECT leida_en FROM notifications WHERE id = ?', directo)[0].leida_en, null);
});

// ---------------------------------------------------------------- Marcar como leido

test('marcar como leido el aviso de otro usuario da 404 y no lo cambia', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  await crearSolicitudEnviada(alumno);
  const [aviso] = avisosDe(app.db, 'envio');

  for (const abrir of [estudiante2, asesor, comite, direccion]) {
    const respuesta = await (await abrir(app)).post(`/avisos/${aviso.id}/leer`);
    assert.strictEqual(respuesta.estado, 404);
  }

  assert.strictEqual(filas(app.db, 'SELECT leida_en FROM notifications WHERE id = ?', aviso.id)[0].leida_en, null);
});

test('marcar un aviso inexistente o con id no numerico da 404', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);

  assert.strictEqual((await alumno.post('/avisos/9999/leer')).estado, 404);
  assert.strictEqual((await alumno.post('/avisos/abc/leer')).estado, 404);
  assert.strictEqual((await alumno.post('/avisos/1;DROP/leer')).estado, 404);
});

test('marcar como leido es idempotente: repetirlo conserva la primera fecha de lectura', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  await crearSolicitudEnviada(alumno);
  const [aviso] = avisosDe(app.db, 'envio');
  app.reloj.fijar('2026-05-04T14:00:00.000Z');
  assert.strictEqual((await alumno.post(`/avisos/${aviso.id}/leer`)).estado, 303);
  app.reloj.fijar('2026-05-04T16:00:00.000Z');

  const segunda = await alumno.post(`/avisos/${aviso.id}/leer`);

  assert.strictEqual(segunda.estado, 303);
  assert.strictEqual(filas(app.db, 'SELECT leida_en FROM notifications WHERE id = ?', aviso.id)[0].leida_en, '2026-05-04T14:00:00.000Z');
});

test('la bandeja no depende de la entrega: un aviso sin entregar y uno entregado se muestran igual', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  const a = insertarAviso(app.db, { destinatarioId: idUsuario(app.db, 'estudiante'), payload: { solicitudId: 's1' } });
  const b = insertarAviso(app.db, { destinatarioId: idUsuario(app.db, 'estudiante'), payload: { solicitudId: 's2' } });
  app.db.prepare('UPDATE notifications SET entregada_en = ? WHERE id = ?').run(AHORA, b);

  assert.deepStrictEqual(idsEnPagina((await alumno.get('/avisos')).texto), [b, a]);
});

test('el formulario de marcar como leido exige el token CSRF', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  await crearSolicitudEnviada(alumno);
  const [aviso] = avisosDe(app.db, 'envio');
  const pagina = (await alumno.get('/avisos')).texto;

  const sinToken = await alumno.post(`/avisos/${aviso.id}/leer`, {}, { conToken: false });

  assert.match(pagina, /<form method="post" action="\/avisos\/\d+\/leer">\s*<input type="hidden" name="_csrf" value="[^"]+">/);
  assert.strictEqual(sinToken.estado, 403);
  assert.strictEqual(filas(app.db, 'SELECT leida_en FROM notifications WHERE id = ?', aviso.id)[0].leida_en, null);
});

test('un usuario anonimo es redirigido a /login y no puede marcar avisos', async (t) => {
  const app = await entorno(t);
  await crearSolicitudEnviada(await estudiante(app));
  const [aviso] = avisosDe(app.db, 'envio');
  const anonimo = crearCliente(app.base);

  const lista = await anonimo.get('/avisos');
  const marca = await anonimo.post(`/avisos/${aviso.id}/leer`, {}, { conToken: false });

  assert.strictEqual(lista.estado, 303);
  assert.strictEqual(lista.ubicacion, '/login');
  assert.ok([401, 403].includes(marca.estado), `estado ${marca.estado}`);
  assert.strictEqual(filas(app.db, 'SELECT leida_en FROM notifications WHERE id = ?', aviso.id)[0].leida_en, null);
});

// ---------------------------------------------------------------- Contador en la navegacion

test('la navegacion de estudiantes y comite muestra el contador de avisos sin leer y baja al leerlos', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  await crearSolicitudEnviada(alumno);
  const propios = filas(app.db, 'SELECT id FROM notifications WHERE destinatario_id = ? ORDER BY id', idUsuario(app.db, 'estudiante'));
  assert.strictEqual(propios.length, 1);
  const nuevo = insertarAviso(app.db, { destinatarioId: idUsuario(app.db, 'estudiante'), payload: { solicitudId: 's1' } });

  const antes = (await alumno.get('/solicitudes')).texto;
  await alumno.post(`/avisos/${nuevo}/leer`);
  const despues = (await alumno.get('/avisos')).texto;
  await alumno.post(`/avisos/${propios[0].id}/leer`);
  const sinPendientes = (await alumno.get('/avisos')).texto;

  assert.match(antes, /<a href="\/avisos">Avisos \(2\)<\/a>/);
  assert.match(despues, /<a href="\/avisos">Avisos \(1\)<\/a>/);
  assert.match(sinPendientes, /<a href="\/avisos">Avisos<\/a>/);

  const miembro = await comite(app);
  await alumno.postJson('/api/becas/solicitudes', LIMITROFE);
  assert.match((await miembro.get('/comite')).texto, /<a href="\/avisos">Avisos \(1\)<\/a>/);
  assert.doesNotMatch((await (await asesor(app)).get('/asesor/cola')).texto, /\/avisos/);
});

test('el contador de la sesion de otro estudiante no incluye avisos ajenos', async (t) => {
  const app = await entorno(t);
  await crearSolicitudEnviada(await estudiante(app));

  const otro = (await (await estudiante2(app)).get('/solicitudes')).texto;

  assert.match(otro, /<a href="\/avisos">Avisos<\/a>/);
});

// ---------------------------------------------------------------- Presentacion

test('los avisos se ordenan del mas reciente al mas antiguo y la bandeja muestra a lo sumo 50', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  const ids = [];
  for (let i = 0; i < 55; i += 1) {
    ids.push(insertarAviso(app.db, { destinatarioId: idUsuario(app.db, 'estudiante'), payload: { solicitudId: `s${i}` } }));
  }

  const respuesta = await alumno.get('/avisos');

  assert.deepStrictEqual(idsEnPagina(respuesta.texto), ids.slice(5).reverse());
  assert.match(respuesta.texto, /Avisos \(55\)/);
  assert.match(respuesta.texto, /50 avisos más recientes/);
});

test('un aviso no leido se distingue con texto y ofrece marcarlo; uno leido no', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  const leido = insertarAviso(app.db, { destinatarioId: idUsuario(app.db, 'estudiante'), payload: { solicitudId: 's1' } });
  const sinLeer = insertarAviso(app.db, { destinatarioId: idUsuario(app.db, 'estudiante'), payload: { solicitudId: 's2' } });
  await alumno.post(`/avisos/${leido}/leer`);

  const pagina = (await alumno.get('/avisos')).texto;
  const bloque = (id) => new RegExp(`<li[^>]*id="aviso-${id}"[\\s\\S]*?</li>`).exec(pagina)[0];

  assert.match(bloque(sinLeer), /No leído/);
  assert.match(bloque(sinLeer), /Marcar como leído/);
  assert.match(bloque(leido), /Leído/);
  assert.doesNotMatch(bloque(leido), /No leído|Marcar como leído/);
});

test('el contenido de los avisos se escapa y el enlace codifica el identificador', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  insertarAviso(app.db, {
    tipo: 'decision',
    destinatarioId: idUsuario(app.db, 'estudiante'),
    payload: { solicitudId: '"><script>alert(1)</script>', estado: '<img src=x onerror=alert(1)>' },
  });

  const pagina = (await alumno.get('/avisos')).texto;

  assert.doesNotMatch(pagina, /<script>alert|<img src=x/);
  assert.match(pagina, /href="\/solicitudes\/%22%3E%3Cscript%3Ealert\(1\)%3C%2Fscript%3E"/);
});

test('cada pagina de avisos lleva idioma, titulo y la region principal accesible', async (t) => {
  const app = await entorno(t);
  const pagina = (await (await estudiante2(app)).get('/avisos')).texto;

  assert.match(pagina, /<html lang="es">/);
  assert.match(pagina, /<title>Avisos - Créditos y becas<\/title>/);
  assert.match(pagina, /<main id="contenido"/);
  assert.doesNotMatch(pagina, /<script|style=/);
});
