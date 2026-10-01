'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  CLAVES,
  levantarAplicacion,
  crearUsuario,
  clienteConSesion,
  crearSolicitudEnviada,
} = require('./ayudaPruebasWeb');
const { crearUnidadDeTrabajo } = require('../infra/unidadDeTrabajo');
const { enTransaccion } = require('../infra/transaccion');
const { vistaDetalleAsesor } = require('./vistas');

// Story 5.14: ejecucion de un desembolso (P14). Servidor real en puerto efimero con SQLite en memoria.
async function entorno(t) {
  const app = await levantarAplicacion();
  t.after(app.cerrar);
  await crearUsuario(app.db, 'asesor2', 'asesor_financiero', 'clave-asesor-2');
  await crearUsuario(app.db, 'estudiante2', 'estudiante', 'clave-estudiante-2');
  return app;
}

const estudiante = (app) => clienteConSesion(app.base, 'estudiante', CLAVES.SEED_PASSWORD_ESTUDIANTE);
const otroEstudiante = (app) => clienteConSesion(app.base, 'estudiante2', 'clave-estudiante-2');
const asesor = (app) => clienteConSesion(app.base, 'asesor_financiero', CLAVES.SEED_PASSWORD_ASESOR_FINANCIERO);
const otroAsesor = (app) => clienteConSesion(app.base, 'asesor2', 'clave-asesor-2');
const direccion = (app) => clienteConSesion(app.base, 'direccion_academica', CLAVES.SEED_PASSWORD_DIRECCION_ACADEMICA);
const comite = (app) => clienteConSesion(app.base, 'comite_becas', CLAVES.SEED_PASSWORD_COMITE_BECAS);

const TERMINOS = Object.freeze({ monto: '1200000', numeroCuotas: '3', fechaPrimeraCuota: '2026-12-01' });
const rutaEjecutar = (id) => `/asesor/desembolsos/${id}/ejecutar`;

const filas = (db, sql, ...parametros) => db.prepare(sql).all(...parametros).map((f) => ({ ...f }));
const estadosDe = (db, solicitudId) =>
  filas(db, 'SELECT numero_cuota, estado, fecha_ejecucion FROM desembolsos WHERE solicitud_id = ? ORDER BY numero_cuota', solicitudId);
const avisos = (db) => filas(db, "SELECT * FROM notifications WHERE tipo = 'desembolso' ORDER BY id");
const auditorias = (db) => filas(db, "SELECT * FROM audit_log WHERE accion = 'ejecutar_desembolso' ORDER BY id");

// Solicitud enviada, reclamada y aprobada en 3 cuotas; devuelve ids y los clientes involucrados.
async function solicitudAprobada(app) {
  const alumno = await estudiante(app);
  const id = await crearSolicitudEnviada(alumno);
  const cliente = await asesor(app);
  await cliente.post(`/asesor/solicitudes/${id}/reclamar`);
  const aprobacion = await cliente.post(`/asesor/solicitudes/${id}/aprobar`, TERMINOS);
  assert.strictEqual(aprobacion.estado, 303);
  const cuotas = filas(app.db, 'SELECT id FROM desembolsos WHERE solicitud_id = ? ORDER BY numero_cuota', id).map((f) => f.id);
  return { id, alumno, cliente, cuotas };
}

function nadaEjecutado(app, id) {
  assert.deepStrictEqual(
    estadosDe(app.db, id).map((f) => [f.estado, f.fecha_ejecucion]),
    [['programado', null], ['programado', null], ['programado', null]],
  );
  assert.strictEqual(auditorias(app.db).length, 0);
  assert.strictEqual(avisos(app.db).length, 0);
}

// ---------------------------------------------------------------- Scenarios de la spec

test('Scenario: el actor autorizado ejecuta -> estado ejecutado, se recarga igual desde SQLite en una unidad nueva y hay un aviso en el outbox', async (t) => {
  const app = await entorno(t);
  const { id, cliente, cuotas } = await solicitudAprobada(app);

  const respuesta = await cliente.post(rutaEjecutar(cuotas[0]));

  assert.strictEqual(respuesta.estado, 303);
  assert.strictEqual(respuesta.ubicacion, `/asesor/solicitudes/${id}`);
  const recargado = await crearUnidadDeTrabajo().correr(() => app.contexto.repositorios.calendario.obtenerPorId(cuotas[0]));
  assert.deepStrictEqual(recargado, {
    id: cuotas[0],
    solicitudId: id,
    numeroCuota: 1,
    fecha: '2026-12-01',
    monto: 400000,
    estado: 'ejecutado',
    fechaEjecucion: '2026-05-04',
    periodoAcademico: '2026-1',
    tipoCredito: 'credito',
  });
  const [aviso, ...resto] = avisos(app.db);
  assert.strictEqual(resto.length, 0);
  assert.strictEqual(aviso.destinatario_tipo, 'solicitud');
  assert.strictEqual(aviso.destinatario_id, id);
  assert.deepStrictEqual(JSON.parse(aviso.payload), {
    solicitudId: id,
    desembolsoId: cuotas[0],
    numeroCuota: 1,
    fecha: '2026-05-04',
    monto: 400000,
  });
});

test('Scenario: el estado ejecutado queda persistido (mutation persists): solo cambia la cuota ejecutada y sobrevive a una lectura nueva', async (t) => {
  const app = await entorno(t);
  const { id, cliente, cuotas } = await solicitudAprobada(app);

  await cliente.post(rutaEjecutar(cuotas[1]));

  assert.deepStrictEqual(
    estadosDe(app.db, id).map((f) => [f.numero_cuota, f.estado, f.fecha_ejecucion]),
    [[1, 'programado', null], [2, 'ejecutado', '2026-05-04'], [3, 'programado', null]],
  );
  const listado = await app.contexto.servicioDesembolsos.listarDesembolsosDeSolicitud(
    { id: 0, rol: 'estudiante', estudianteId: String(filas(app.db, "SELECT id FROM usuarios WHERE nombre_usuario = 'estudiante'")[0].id) },
    id,
  );
  assert.deepStrictEqual(listado.map((d) => d.estado), ['programado', 'ejecutado', 'programado']);
});

test('Scenario: si falla una de las escrituras (estado, auditoria u outbox) no se confirma ninguna', async (t) => {
  const variantes = [
    ['estado', "CREATE TRIGGER forzar BEFORE UPDATE ON desembolsos BEGIN SELECT RAISE(ABORT, 'fallo forzado'); END"],
    ['auditoria', "CREATE TRIGGER forzar BEFORE INSERT ON audit_log WHEN NEW.accion = 'ejecutar_desembolso' BEGIN SELECT RAISE(ABORT, 'fallo forzado'); END"],
    ['outbox', "CREATE TRIGGER forzar BEFORE INSERT ON notifications WHEN NEW.tipo = 'desembolso' BEGIN SELECT RAISE(ABORT, 'fallo forzado'); END"],
  ];
  for (const [nombre, trigger] of variantes) {
    await t.test(`falla ${nombre}`, async (st) => {
      const app = await entorno(st);
      const { id, cliente, cuotas } = await solicitudAprobada(app);
      app.db.exec(trigger);

      const respuesta = await cliente.post(rutaEjecutar(cuotas[0]));

      assert.strictEqual(respuesta.estado, 500);
      nadaEjecutado(app, id);
    });
  }
});

test('Scenario: otro asesor recibe 403; estudiante, comite y direccion 403; y un estudiante solo ve sus propios desembolsos', async (t) => {
  const app = await entorno(t);
  const { id, alumno, cuotas } = await solicitudAprobada(app);

  for (const [nombre, cliente] of [
    ['otro asesor', await otroAsesor(app)],
    ['estudiante', alumno],
    ['comite', await comite(app)],
    ['direccion', await direccion(app)],
  ]) {
    assert.strictEqual((await cliente.post(rutaEjecutar(cuotas[0]))).estado, 403, nombre);
  }
  nadaEjecutado(app, id);

  assert.strictEqual((await alumno.get(`/solicitudes/${id}`)).estado, 200);
  const ajeno = await (await otroEstudiante(app)).get(`/solicitudes/${id}`);
  assert.strictEqual(ajeno.estado, 404);
  assert.ok(!ajeno.texto.includes('2026-12-01'));
});

// ---------------------------------------------------------------- Reglas adicionales

test('ejecutar dos veces da 409 y deja exactamente un aviso y una entrada de auditoria', async (t) => {
  const app = await entorno(t);
  const { id, cliente, cuotas } = await solicitudAprobada(app);
  await cliente.post(rutaEjecutar(cuotas[0]));

  const repetido = await cliente.post(rutaEjecutar(cuotas[0]));

  assert.strictEqual(repetido.estado, 409);
  assert.ok(repetido.texto.includes('role="alert"'));
  assert.strictEqual(avisos(app.db).length, 1);
  assert.strictEqual(auditorias(app.db).length, 1);
  assert.strictEqual(estadosDe(app.db, id)[0].estado, 'ejecutado');
});

test('ejecutar un desembolso vencido da 409, no lo cambia y no avisa', async (t) => {
  const app = await entorno(t);
  const { id, cliente, cuotas } = await solicitudAprobada(app);
  const unidad = crearUnidadDeTrabajo();
  await unidad.correr(() => {
    app.contexto.repositorios.calendario.obtenerPorId(cuotas[0]).estado = 'vencido';
  });
  enTransaccion(app.db, () => unidad.volcar(app.db));

  const respuesta = await cliente.post(rutaEjecutar(cuotas[0]));

  assert.strictEqual(respuesta.estado, 409);
  assert.strictEqual(estadosDe(app.db, id)[0].estado, 'vencido');
  assert.strictEqual(avisos(app.db).length, 0);
  assert.strictEqual(auditorias(app.db).length, 0);
});

test('la auditoria registra actor, rol, objetivo, fecha y detalle (NFR-001)', async (t) => {
  const app = await entorno(t);
  const { id, cliente, cuotas } = await solicitudAprobada(app);

  await cliente.post(rutaEjecutar(cuotas[2]));

  const [entrada, ...resto] = auditorias(app.db);
  assert.strictEqual(resto.length, 0);
  assert.strictEqual(entrada.actor, 'asesor_financiero');
  assert.strictEqual(entrada.rol, 'asesor_financiero');
  assert.strictEqual(entrada.objetivo, `desembolso:${cuotas[2]}`);
  assert.strictEqual(entrada.fecha, '2026-05-04T12:30:00.000Z');
  assert.deepStrictEqual(JSON.parse(entrada.detalle), { solicitudId: id, numeroCuota: 3, monto: 400000 });
});

test('un id inexistente da 404 sin reflejar el id en la pagina', async (t) => {
  const app = await entorno(t);
  await solicitudAprobada(app);
  const cliente = await asesor(app);

  const respuesta = await cliente.post(rutaEjecutar('%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E'));

  assert.strictEqual(respuesta.estado, 404);
  assert.ok(!respuesta.texto.includes('<script>alert(1)'));
});

test('ejecutar exige el token CSRF (403 sin el) y no cambia nada', async (t) => {
  const app = await entorno(t);
  const { id, cliente, cuotas } = await solicitudAprobada(app);

  const respuesta = await cliente.post(rutaEjecutar(cuotas[0]), {}, { conToken: false });

  assert.strictEqual(respuesta.estado, 403);
  nadaEjecutado(app, id);
});

// ---------------------------------------------------------------- Paginas

test('el detalle del asesor asignado muestra el calendario con el boton solo en las cuotas programadas y la fecha en las ejecutadas', async (t) => {
  const app = await entorno(t);
  const { id, cliente, cuotas } = await solicitudAprobada(app);

  const antes = await cliente.get(`/asesor/solicitudes/${id}`);
  assert.strictEqual(antes.estado, 200);
  assert.ok(antes.texto.includes('Calendario de desembolsos'));
  for (const cuota of cuotas) {
    assert.match(antes.texto, new RegExp(`<form method="post" action="${rutaEjecutar(cuota)}">`));
  }
  assert.strictEqual(antes.texto.match(/Ejecutar desembolso/g).length, 3);
  assert.match(antes.texto, /<input type="hidden" name="_csrf" value="[0-9a-f]{64}">/);
  assert.ok(!/<script|style=/.test(antes.texto));

  await cliente.post(rutaEjecutar(cuotas[0]));
  const despues = await cliente.get(`/asesor/solicitudes/${id}`);

  assert.ok(!despues.texto.includes(`action="${rutaEjecutar(cuotas[0])}"`));
  assert.ok(despues.texto.includes(`action="${rutaEjecutar(cuotas[1])}"`));
  assert.strictEqual(despues.texto.match(/Ejecutar desembolso/g).length, 2);
  assert.ok(despues.texto.includes('<time datetime="2026-05-04">2026-05-04</time>'));
});

test('una solicitud pendiente no muestra calendario ni boton; otro asesor no ve el calendario de una solicitud ajena', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  const pendiente = await crearSolicitudEnviada(alumno);
  const cliente = await asesor(app);
  await cliente.post(`/asesor/solicitudes/${pendiente}/reclamar`);

  const detalle = await cliente.get(`/asesor/solicitudes/${pendiente}`);
  assert.ok(!detalle.texto.includes('Calendario de desembolsos'));
  assert.ok(!detalle.texto.includes('Ejecutar desembolso'));
});

test('el detalle de otro asesor sobre una solicitud aprobada ajena da 404 sin datos del calendario', async (t) => {
  const app = await entorno(t);
  const { id } = await solicitudAprobada(app);

  const ajeno = await (await otroAsesor(app)).get(`/asesor/solicitudes/${id}`);

  assert.strictEqual(ajeno.estado, 404);
  assert.ok(!ajeno.texto.includes('Ejecutar desembolso'));
  assert.ok(!ajeno.texto.includes('2026-12-01'));
});

test('el estudiante ve la fecha de ejecucion y el estado de cada cuota, solo lectura', async (t) => {
  const app = await entorno(t);
  const { id, alumno, cliente, cuotas } = await solicitudAprobada(app);
  await cliente.post(rutaEjecutar(cuotas[0]));

  const detalle = await alumno.get(`/solicitudes/${id}`);

  assert.strictEqual(detalle.estado, 200);
  assert.match(detalle.texto, /<th scope="col">Fecha de ejecución<\/th>/);
  assert.match(detalle.texto, /<td>Ejecutado \(<code>ejecutado<\/code>\)<\/td>\s*<td><time datetime="2026-05-04">2026-05-04<\/time><\/td>/);
  assert.strictEqual(detalle.texto.match(/<td>Programado/g).length, 2);
  assert.strictEqual(detalle.texto.match(/Sin ejecutar/g).length, 2);
  assert.ok(!detalle.texto.includes('Ejecutar desembolso'));
  assert.ok(!detalle.texto.includes('/ejecutar'));
});

test('la vista escapa los valores del calendario (el id de un desembolso no puede inyectar HTML)', () => {
  const pagina = String(vistaDetalleAsesor({
    usuario: { rol: 'asesor_financiero', nombre_usuario: 'asesor' },
    csrf: 'a'.repeat(64),
    detalle: {
      solicitud: { id: 's1', periodoAcademico: '2026-1', estado: 'aprobada', creadaEn: '2026-05-04T00:00:00.000Z' },
      documentos: [],
      decision: null,
      desembolsos: [
        { id: '"><script>alert(1)</script>', numeroCuota: 1, fecha: '2026-12-01', monto: 10, estado: 'programado', fechaEjecucion: null },
      ],
    },
  }));

  assert.ok(!pagina.includes('<script>alert(1)'));
  assert.ok(pagina.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});
