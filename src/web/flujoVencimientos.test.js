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
const { crearUnidadDeTrabajo } = require('../infra/unidadDeTrabajo');

// Story 5.15 (P15): revision de vencidos (caso de uso + endpoint manual). Servidor real en puerto efimero,
// SQLite en memoria y reloj inyectado. Con el reloj en 2026-05-04 y el plazo de 15 dias, las cuotas del
// 2026-03-01 y el 2026-04-01 estan vencidas y la del 2026-05-01 (limite 2026-05-16) todavia no.

function relojMutable(inicial) {
  let ahora = new Date(inicial);
  return { ahora: () => new Date(ahora), fijar: (fecha) => { ahora = new Date(fecha); } };
}

async function entorno(t, opciones = {}) {
  const reloj = relojMutable('2026-05-04T12:30:00.000Z');
  const app = await levantarAplicacion({ reloj, ...opciones });
  t.after(app.cerrar);
  await crearUsuario(app.db, 'estudiante2', 'estudiante', 'clave-estudiante-2');
  return { ...app, reloj };
}

const estudiante = (app) => clienteConSesion(app.base, 'estudiante', CLAVES.SEED_PASSWORD_ESTUDIANTE);
const asesor = (app) => clienteConSesion(app.base, 'asesor_financiero', CLAVES.SEED_PASSWORD_ASESOR_FINANCIERO);
const direccion = (app) => clienteConSesion(app.base, 'direccion_academica', CLAVES.SEED_PASSWORD_DIRECCION_ACADEMICA);
const comite = (app) => clienteConSesion(app.base, 'comite_becas', CLAVES.SEED_PASSWORD_COMITE_BECAS);

const TERMINOS = Object.freeze({ monto: '1200000', numeroCuotas: '3', fechaPrimeraCuota: '2026-03-01' });
const RUTA_DIRECCION = '/direccion/vencimientos/revisar';
const RUTA_ASESOR = '/asesor/vencimientos/revisar';

const filas = (db, sql, ...parametros) => db.prepare(sql).all(...parametros).map((f) => ({ ...f }));
const estadosDe = (db, solicitudId) =>
  filas(db, 'SELECT numero_cuota, estado FROM desembolsos WHERE solicitud_id = ? ORDER BY numero_cuota', solicitudId).map(
    (f) => f.estado,
  );
const auditorias = (db) => filas(db, "SELECT * FROM audit_log WHERE accion = 'marcar_desembolso_vencido' ORDER BY id");
const avisos = (db) => filas(db, "SELECT * FROM notifications WHERE tipo = 'desembolso_vencido' ORDER BY id");

// Solicitud enviada, reclamada y aprobada con los terminos dados; devuelve ids y clientes.
async function solicitudAprobada(app, terminos = TERMINOS, datos = {}) {
  const alumno = await estudiante(app);
  const id = await crearSolicitudEnviada(alumno, datos);
  const cliente = await asesor(app);
  await cliente.post(`/asesor/solicitudes/${id}/reclamar`);
  const aprobacion = await cliente.post(`/asesor/solicitudes/${id}/aprobar`, terminos);
  assert.strictEqual(aprobacion.estado, 303);
  const cuotas = filas(app.db, 'SELECT id FROM desembolsos WHERE solicitud_id = ? ORDER BY numero_cuota', id).map((f) => f.id);
  return { id, alumno, cliente, cuotas };
}

function nadaCambio(app, id, esperado = ['programado', 'programado', 'programado']) {
  assert.deepStrictEqual(estadosDe(app.db, id), esperado);
  assert.strictEqual(auditorias(app.db).length, 0);
  assert.strictEqual(avisos(app.db).length, 0);
}

// ---------------------------------------------------------------- Scenarios de la spec

test('Scenario: un desembolso programado cuya fecha mas el plazo ya paso pasa a vencido y el estado persiste al recargar desde SQLite', async (t) => {
  const app = await entorno(t);
  const { id, cuotas } = await solicitudAprobada(app);
  const cliente = await direccion(app);

  const respuesta = await cliente.post(RUTA_DIRECCION);

  assert.strictEqual(respuesta.estado, 303);
  assert.strictEqual(respuesta.ubicacion, '/direccion?marcados=2');
  assert.deepStrictEqual(estadosDe(app.db, id), ['vencido', 'vencido', 'programado']);
  const recargado = await crearUnidadDeTrabajo().correr(() => app.contexto.repositorios.calendario.obtenerPorId(cuotas[0]));
  assert.deepStrictEqual(recargado, {
    id: cuotas[0],
    solicitudId: id,
    numeroCuota: 1,
    fecha: '2026-03-01',
    monto: 400000,
    estado: 'vencido',
    periodoAcademico: '2026-1',
    tipoCredito: 'credito',
  });
});

test('Scenario: un desembolso ejecutado permanece ejecutado', async (t) => {
  const app = await entorno(t);
  const { id, cliente: asesorCliente, cuotas } = await solicitudAprobada(app);
  assert.strictEqual((await asesorCliente.post(`/asesor/desembolsos/${cuotas[0]}/ejecutar`)).estado, 303);

  const respuesta = await (await direccion(app)).post(RUTA_DIRECCION);

  assert.strictEqual(respuesta.ubicacion, '/direccion?marcados=1');
  assert.deepStrictEqual(estadosDe(app.db, id), ['ejecutado', 'vencido', 'programado']);
  assert.deepStrictEqual(auditorias(app.db).map((a) => a.objetivo), [`desembolso:${cuotas[1]}`]);
});

test('Scenario: el estado, la auditoria y las filas de outbox se confirman juntos', async (t) => {
  const app = await entorno(t);
  const { id, cuotas } = await solicitudAprobada(app);

  await (await direccion(app)).post(RUTA_DIRECCION);

  assert.deepStrictEqual(estadosDe(app.db, id), ['vencido', 'vencido', 'programado']);
  const entradas = auditorias(app.db);
  assert.strictEqual(entradas.length, 2);
  assert.deepStrictEqual(
    entradas.map((e) => [e.actor, e.rol, e.objetivo, e.fecha, JSON.parse(e.detalle)]),
    [
      ['direccion_academica', 'direccion_academica', `desembolso:${cuotas[0]}`, '2026-05-04T12:30:00.000Z', { solicitudId: id, numeroCuota: 1, fecha: '2026-03-01' }],
      ['direccion_academica', 'direccion_academica', `desembolso:${cuotas[1]}`, '2026-05-04T12:30:00.000Z', { solicitudId: id, numeroCuota: 2, fecha: '2026-04-01' }],
    ],
  );
  const salida = avisos(app.db);
  assert.deepStrictEqual(
    salida.map((a) => [a.destinatario_tipo, a.destinatario_id, JSON.parse(a.payload)]),
    [
      ['solicitud', id, { solicitudId: id, desembolsoId: cuotas[0], numeroCuota: 1, fecha: '2026-03-01', monto: 400000 }],
      ['solicitud', id, { solicitudId: id, desembolsoId: cuotas[1], numeroCuota: 2, fecha: '2026-04-01', monto: 400000 }],
    ],
  );
});

test('Scenario: si falla una de las escrituras (estado, auditoria u outbox) no se confirma ninguna', async (t) => {
  const variantes = [
    ['estado', "CREATE TRIGGER forzar BEFORE UPDATE ON desembolsos BEGIN SELECT RAISE(ABORT, 'fallo forzado'); END"],
    ['auditoria', "CREATE TRIGGER forzar BEFORE INSERT ON audit_log WHEN NEW.accion = 'marcar_desembolso_vencido' BEGIN SELECT RAISE(ABORT, 'fallo forzado'); END"],
    ['outbox', "CREATE TRIGGER forzar BEFORE INSERT ON notifications WHEN NEW.tipo = 'desembolso_vencido' BEGIN SELECT RAISE(ABORT, 'fallo forzado'); END"],
  ];
  for (const [nombre, trigger] of variantes) {
    await t.test(`falla ${nombre}`, async (st) => {
      const app = await entorno(st);
      const { id } = await solicitudAprobada(app);
      const cliente = await direccion(app);
      app.db.exec(trigger);

      const respuesta = await cliente.post(RUTA_DIRECCION);

      assert.strictEqual(respuesta.estado, 500);
      nadaCambio(app, id);

      // Al quitar el fallo, la siguiente revision si marca (no quedo nada a medias).
      app.db.exec('DROP TRIGGER forzar');
      assert.strictEqual((await cliente.post(RUTA_DIRECCION)).ubicacion, '/direccion?marcados=2');
      assert.strictEqual(auditorias(app.db).length, 2);
      assert.strictEqual(avisos(app.db).length, 2);
    });
  }
});

test('Scenario: direccion y asesor invocan el endpoint manual y corre la revision; estudiante y comite reciben 403', async (t) => {
  const app = await entorno(t);
  const { id } = await solicitudAprobada(app);

  for (const [nombre, cliente, ruta] of [
    ['estudiante en direccion', await estudiante(app), RUTA_DIRECCION],
    ['estudiante en asesor', await estudiante(app), RUTA_ASESOR],
    ['comite en direccion', await comite(app), RUTA_DIRECCION],
    ['comite en asesor', await comite(app), RUTA_ASESOR],
    ['asesor en la ruta de direccion', await asesor(app), RUTA_DIRECCION],
    ['direccion en la ruta del asesor', await direccion(app), RUTA_ASESOR],
  ]) {
    assert.strictEqual((await cliente.post(ruta)).estado, 403, nombre);
  }
  nadaCambio(app, id);

  const porAsesor = await (await asesor(app)).post(RUTA_ASESOR);
  assert.strictEqual(porAsesor.estado, 303);
  assert.strictEqual(porAsesor.ubicacion, '/asesor/cola?marcados=2');
  assert.deepStrictEqual(estadosDe(app.db, id), ['vencido', 'vencido', 'programado']);
  assert.deepStrictEqual([...new Set(auditorias(app.db).map((a) => `${a.actor}/${a.rol}`))], ['asesor_financiero/asesor_financiero']);

  // Sin sesion no se revisa nada: no llega al caso de uso.
  const anterior = auditorias(app.db).length;
  const sinSesion = await crearCliente(app.base).post(RUTA_DIRECCION, {}, { conToken: false });
  assert.notStrictEqual(sinSesion.estado, 200);
  assert.strictEqual(auditorias(app.db).length, anterior);
});

test('el endpoint exige el token CSRF (403 sin el) y no cambia nada', async (t) => {
  const app = await entorno(t);
  const { id } = await solicitudAprobada(app);

  for (const [cliente, ruta] of [[await direccion(app), RUTA_DIRECCION], [await asesor(app), RUTA_ASESOR]]) {
    assert.strictEqual((await cliente.post(ruta, {}, { conToken: false })).estado, 403);
  }
  nadaCambio(app, id);
});

// ---------------------------------------------------------------- Reglas adicionales

test('limite del plazo: el ultimo dia de la ventana sigue programado y un dia despues pasa a vencido', async (t) => {
  const app = await entorno(t);
  const { id } = await solicitudAprobada(app, { monto: '100000', numeroCuotas: '1', fechaPrimeraCuota: '2026-05-01' });
  const servicio = app.contexto.servicioVencimientos;

  app.reloj.fijar('2026-05-16T23:59:59.000Z');
  assert.strictEqual((await servicio.revisarVencimientos()).marcados, 0);
  assert.deepStrictEqual(estadosDe(app.db, id), ['programado']);

  app.reloj.fijar('2026-05-17T00:00:00.000Z');
  const resultado = await servicio.revisarVencimientos();
  assert.strictEqual(resultado.marcados, 1);
  assert.deepStrictEqual(estadosDe(app.db, id), ['vencido']);
});

test('el plazo por defecto es de 15 dias y se puede cambiar por tipo de credito y en general', async (t) => {
  const porTipo = await entorno(t, { vencimientos: { plazosPorTipoCredito: { credito: 100 } } });
  const a = await solicitudAprobada(porTipo);
  assert.strictEqual((await porTipo.contexto.servicioVencimientos.revisarVencimientos()).marcados, 0);
  assert.deepStrictEqual(estadosDe(porTipo.db, a.id), ['programado', 'programado', 'programado']);

  const corto = await entorno(t, { vencimientos: { plazosPorTipoCredito: { credito: 1 } } });
  const b = await solicitudAprobada(corto);
  assert.strictEqual((await corto.contexto.servicioVencimientos.revisarVencimientos()).marcados, 3);
  assert.deepStrictEqual(estadosDe(corto.db, b.id), ['vencido', 'vencido', 'vencido']);

  const general = await entorno(t, { vencimientos: { plazoConfirmacionDias: 70 } });
  const c = await solicitudAprobada(general);
  assert.strictEqual((await general.contexto.servicioVencimientos.revisarVencimientos()).marcados, 0);
  assert.deepStrictEqual(estadosDe(general.db, c.id), ['programado', 'programado', 'programado']);
});

test('la revision es idempotente: la segunda corrida no marca nada ni duplica auditoria ni outbox', async (t) => {
  const app = await entorno(t);
  const { id } = await solicitudAprobada(app);
  const cliente = await direccion(app);
  await cliente.post(RUTA_DIRECCION);

  const segunda = await cliente.post(RUTA_DIRECCION);

  assert.strictEqual(segunda.ubicacion, '/direccion?marcados=0');
  assert.deepStrictEqual(estadosDe(app.db, id), ['vencido', 'vencido', 'programado']);
  assert.strictEqual(auditorias(app.db).length, 2);
  assert.strictEqual(avisos(app.db).length, 2);
});

test('el resultado del servicio trae marcados y el conteo de mora por periodo; el temporizador audita como `sistema`', async (t) => {
  const app = await entorno(t);
  await solicitudAprobada(app, TERMINOS, { periodoAcademico: '2026-1' });
  await solicitudAprobada(app, { monto: '100000', numeroCuotas: '1', fechaPrimeraCuota: '2026-02-01' }, { periodoAcademico: '2026-2' });

  const resultado = await app.contexto.servicioVencimientos.revisarVencimientos();

  assert.deepStrictEqual(resultado, { marcados: 3, moraPorPeriodo: { '2026-1': 2, '2026-2': 1 } });
  assert.deepStrictEqual(await app.contexto.servicioVencimientos.consultarMora(), { '2026-1': 2, '2026-2': 1 });
  assert.deepStrictEqual([...new Set(auditorias(app.db).map((a) => `${a.actor}/${a.rol}`))], ['sistema/sistema']);
});

test('sin desembolsos que revisar: marcados 0, sin escrituras', async (t) => {
  const app = await entorno(t);
  assert.deepStrictEqual(await app.contexto.servicioVencimientos.revisarVencimientos(), { marcados: 0, moraPorPeriodo: {} });
  assert.strictEqual(auditorias(app.db).length + avisos(app.db).length, 0);
});

// ---------------------------------------------------------------- Pagina de direccion

test('la pagina de direccion tiene el formulario con CSRF, muestra el resultado y la mora por periodo, sin datos socioeconomicos', async (t) => {
  const app = await entorno(t);
  await solicitudAprobada(app);
  const cliente = await direccion(app);

  const antes = await cliente.get('/direccion');
  assert.strictEqual(antes.estado, 200);
  assert.match(antes.texto, new RegExp(`<form method="post" action="${RUTA_DIRECCION}"`));
  assert.match(antes.texto, /<input type="hidden" name="_csrf" value="[0-9a-f]{64}">/);
  assert.ok(antes.texto.includes('Revisar vencimientos'));
  assert.ok(!antes.texto.includes('Se marcaron'));

  const redireccion = await cliente.post(RUTA_DIRECCION);
  const despues = await cliente.get(redireccion.ubicacion);

  assert.strictEqual(despues.estado, 200);
  assert.ok(despues.texto.includes('Se marcaron 2 desembolsos como vencidos.'));
  assert.match(despues.texto, /<th scope="col">Periodo académico<\/th>\s*<th scope="col">Desembolsos vencidos<\/th>/);
  assert.match(despues.texto, /<td>2026-1<\/td>\s*<td>2<\/td>/);
  assert.ok(!/ingresos|estrato|dependientes|acudiente/i.test(despues.texto));
  assert.ok(!/<script|style=/.test(despues.texto));
});

test('el parametro marcados solo acepta enteros: un valor malicioso no se refleja', async (t) => {
  const app = await entorno(t);
  const cliente = await direccion(app);

  const respuesta = await cliente.get('/direccion?marcados=%3Cscript%3Ealert(1)%3C%2Fscript%3E');

  assert.strictEqual(respuesta.estado, 200);
  assert.ok(!respuesta.texto.includes('alert(1)'));
  assert.ok(!respuesta.texto.includes('Se marcaron'));
  assert.ok((await cliente.get('/direccion?marcados=1')).texto.includes('Se marcó 1 desembolso como vencido.'));
  assert.ok((await cliente.get('/direccion?marcados=0')).texto.includes('No hay desembolsos nuevos por marcar como vencidos.'));
});

test('la cola del asesor tiene el formulario con CSRF y muestra el resultado de la revision', async (t) => {
  const app = await entorno(t);
  await solicitudAprobada(app);
  const cliente = await asesor(app);

  const cola = await cliente.get('/asesor/cola');
  assert.match(cola.texto, new RegExp(`<form method="post" action="${RUTA_ASESOR}"`));

  const redireccion = await cliente.post(RUTA_ASESOR);
  const despues = await cliente.get(redireccion.ubicacion);
  assert.ok(despues.texto.includes('Se marcaron 2 desembolsos como vencidos.'));
});
