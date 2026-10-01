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

// Story 5.10: condiciones del credito y calendario de desembolso (P10).
// Servidor real en puerto efimero con SQLite en memoria.
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

const TERMINOS = Object.freeze({ monto: '1200000', numeroCuotas: '4', fechaPrimeraCuota: '2026-12-01' });
const ruta = (id) => `/asesor/solicitudes/${id}/aprobar`;

const cuenta = (db, tabla) => db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get().n;
const estadoEnBase = (db, id) => db.prepare('SELECT estado FROM solicitudes WHERE id = ?').get(id)?.estado;
const desembolsosDe = (db, id) =>
  db.prepare('SELECT * FROM desembolsos WHERE solicitud_id = ? ORDER BY numero_cuota').all(id).map((f) => ({ ...f }));
const erroresDeCalendario = (db) => db.prepare('SELECT * FROM calendar_errors ORDER BY id').all().map((f) => ({ ...f }));
const auditoriaAprobar = (db, id) =>
  db
    .prepare("SELECT * FROM audit_log WHERE accion = 'aprobar' AND objetivo = ? ORDER BY id")
    .all(`solicitud_credito:${id}`)
    .map((f) => ({ ...f, detalle: JSON.parse(f.detalle) }));
const avisosDecision = (db) => db.prepare("SELECT * FROM notifications WHERE tipo = 'decision' ORDER BY id").all();

// Un estudiante envia una solicitud y el asesor la reclama; devuelve { id, alumno, cliente }.
async function solicitudReclamada(app, datos = {}, quien = asesor) {
  const alumno = await estudiante(app);
  const id = await crearSolicitudEnviada(alumno, datos);
  const cliente = await quien(app);
  await cliente.post(`/asesor/solicitudes/${id}/reclamar`);
  return { id, alumno, cliente };
}

function nadaConfirmado(app, id) {
  assert.strictEqual(estadoEnBase(app.db, id), 'pendiente_revision');
  assert.strictEqual(desembolsosDe(app.db, id).length, 0);
  assert.strictEqual(cuenta(app.db, 'condiciones_credito'), 0);
  assert.strictEqual(auditoriaAprobar(app.db, id).length, 0);
  assert.strictEqual(avisosDecision(app.db).length, 0);
  assert.strictEqual(cuenta(app.db, 'decisiones_solicitud'), 0);
}

// ---------------------------------------------------------------- Scenarios de la spec

test('Scenario: la aprueba con monto, cuotas y fecha validos -> se guardan los terminos y hay un desembolso programado por cuota con periodo y tipo copiados', async (t) => {
  const app = await entorno(t);
  const { id, cliente } = await solicitudReclamada(app, { periodoAcademico: '2026-2' });

  const respuesta = await cliente.post(ruta(id), TERMINOS);

  assert.strictEqual(respuesta.estado, 303);
  assert.strictEqual(respuesta.ubicacion, '/asesor/cola');
  assert.strictEqual(estadoEnBase(app.db, id), 'aprobada');
  const condiciones = app.db.prepare('SELECT * FROM condiciones_credito WHERE solicitud_id = ?').all(id);
  assert.strictEqual(condiciones.length, 1);
  assert.strictEqual(condiciones[0].monto, 1200000);
  assert.strictEqual(condiciones[0].numero_cuotas, 4);
  assert.strictEqual(condiciones[0].fecha_primera_cuota, '2026-12-01');
  assert.strictEqual(condiciones[0].tipo_credito, 'credito');
  assert.strictEqual(condiciones[0].creada_en, '2026-05-04T12:30:00.000Z');
  const filas = desembolsosDe(app.db, id);
  assert.deepStrictEqual(
    filas.map((f) => [f.numero_cuota, f.fecha, f.monto, f.estado, f.fecha_ejecucion, f.periodo_academico, f.tipo_credito]),
    [
      [1, '2026-12-01', 300000, 'programado', null, '2026-2', 'credito'],
      [2, '2027-01-01', 300000, 'programado', null, '2026-2', 'credito'],
      [3, '2027-02-01', 300000, 'programado', null, '2026-2', 'credito'],
      [4, '2027-03-01', 300000, 'programado', null, '2026-2', 'credito'],
    ],
  );
});

test('Scenario: aprobar deja traza NFR-001 (actor, rol, accion, objetivo, fecha y terminos) y avisa al estudiante', async (t) => {
  const app = await entorno(t);
  const { id, cliente } = await solicitudReclamada(app);

  await cliente.post(ruta(id), TERMINOS);

  const [entrada, ...resto] = auditoriaAprobar(app.db, id);
  assert.strictEqual(resto.length, 0);
  assert.strictEqual(entrada.actor, 'asesor_financiero');
  assert.strictEqual(entrada.rol, 'asesor_financiero');
  assert.strictEqual(entrada.fecha, '2026-05-04T12:30:00.000Z');
  assert.deepStrictEqual(entrada.detalle, { monto: 1200000, numeroCuotas: 4, fechaPrimeraCuota: '2026-12-01' });
  const decision = app.db.prepare('SELECT * FROM decisiones_solicitud WHERE solicitud_id = ?').get(id);
  assert.strictEqual(decision.tipo, 'aprobada');
  const avisos = avisosDecision(app.db);
  assert.strictEqual(avisos.length, 1);
  assert.deepStrictEqual(JSON.parse(avisos[0].payload), {
    estudianteId: String(app.db.prepare("SELECT id FROM usuarios WHERE nombre_usuario = 'estudiante'").get().id),
    solicitudId: id,
    estado: 'aprobada',
  });
});

test('Scenario: una aprobacion con monto cero o invalido se rechaza, se registra en calendar_errors y no se crea nada', async (t) => {
  const app = await entorno(t);
  const { id, cliente } = await solicitudReclamada(app);
  const intentos = [
    [{ ...TERMINOS, monto: '0' }, 'MONTO_INVALIDO', 'monto'],
    [{ ...TERMINOS, monto: '-5' }, 'MONTO_INVALIDO', 'monto'],
    [{ ...TERMINOS, monto: 'abc' }, 'MONTO_INVALIDO', 'monto'],
    [{ ...TERMINOS, monto: '' }, 'MONTO_INVALIDO', 'monto'],
    [{ ...TERMINOS, numeroCuotas: '0' }, 'CUOTAS_INVALIDAS', 'numeroCuotas'],
    [{ ...TERMINOS, numeroCuotas: '2.5' }, 'CUOTAS_INVALIDAS', 'numeroCuotas'],
    [{ ...TERMINOS, numeroCuotas: '100000' }, 'CUOTAS_INVALIDAS', 'numeroCuotas'],
    [{ ...TERMINOS, fechaPrimeraCuota: 'manana' }, 'FECHA_INVALIDA', 'fechaPrimeraCuota'],
    [{ ...TERMINOS, fechaPrimeraCuota: '2026-02-30' }, 'FECHA_INVALIDA', 'fechaPrimeraCuota'],
    [{ ...TERMINOS, fechaPrimeraCuota: '' }, 'FECHA_INVALIDA', 'fechaPrimeraCuota'],
  ];

  for (const [campos, , campo] of intentos) {
    const respuesta = await cliente.post(ruta(id), campos);
    assert.strictEqual(respuesta.estado, 400, JSON.stringify(campos));
    assert.ok(respuesta.texto.includes('role="alert"'));
    assert.ok(respuesta.texto.includes(`href="#${campo}"`), `el resumen enlaza al campo ${campo}`);
    assert.ok(respuesta.texto.includes('No se pudo aprobar la solicitud'));
  }

  nadaConfirmado(app, id);
  const errores = erroresDeCalendario(app.db);
  assert.deepStrictEqual(errores.map((e) => e.codigo), intentos.map(([, codigo]) => codigo));
  for (const error of errores) {
    assert.strictEqual(error.solicitud_id, id);
    assert.strictEqual(error.registrado_en, '2026-05-04T12:30:00.000Z');
    assert.ok(error.mensaje.length > 0);
  }
});

test('Scenario: repetir la aprobacion da 409 y no duplica desembolsos, terminos, auditoria ni aviso', async (t) => {
  const app = await entorno(t);
  const { id, cliente } = await solicitudReclamada(app);
  await cliente.post(ruta(id), TERMINOS);

  const repetido = await cliente.post(ruta(id), { ...TERMINOS, numeroCuotas: '6' });

  assert.strictEqual(repetido.estado, 409);
  assert.strictEqual(desembolsosDe(app.db, id).length, 4);
  assert.strictEqual(cuenta(app.db, 'condiciones_credito'), 1);
  assert.strictEqual(auditoriaAprobar(app.db, id).length, 1);
  assert.strictEqual(avisosDecision(app.db).length, 1);
  assert.strictEqual(cuenta(app.db, 'calendar_errors'), 0);
});

test('Scenario: tras aprobar, el calendario se recarga desde SQLite con fecha, monto, periodo y tipo de credito', async (t) => {
  const app = await entorno(t);
  const { id, cliente } = await solicitudReclamada(app, { periodoAcademico: '2027-1' });
  await cliente.post(ruta(id), { monto: '1000.01', numeroCuotas: '3', fechaPrimeraCuota: '2026-12-31' });

  // El detalle del estudiante se arma en una unidad de trabajo nueva: todo viene de SQLite.
  const detalle = await (await estudiante(app)).get(`/solicitudes/${id}`);

  assert.strictEqual(detalle.estado, 200);
  const texto = detalle.texto;
  for (const esperado of ['2026-12-31', '2027-01-31', '2027-02-28', '333.33', '333.35']) {
    assert.ok(texto.includes(esperado), esperado);
  }
  const filas = desembolsosDe(app.db, id);
  assert.deepStrictEqual(filas.map((f) => [f.periodo_academico, f.tipo_credito]), Array(3).fill(['2027-1', 'credito']));
});

// ---------------------------------------------------------------- Montos, atomicidad y roles

test('las cuotas suman exactamente el monto aprobado (centavos), el residuo va a la ultima', async (t) => {
  const app = await entorno(t);
  const { id, cliente } = await solicitudReclamada(app);

  const respuesta = await cliente.post(ruta(id), { monto: '1000.01', numeroCuotas: '3', fechaPrimeraCuota: '2026-12-01' });

  assert.strictEqual(respuesta.estado, 303);
  const montos = desembolsosDe(app.db, id).map((f) => f.monto);
  assert.deepStrictEqual(montos, [333.33, 333.33, 333.35]);
  assert.strictEqual(montos.reduce((suma, m) => suma + Math.round(m * 100), 0), 100001);
});

test('el estudiante ve el calendario de su solicitud aprobada, solo lectura; una pendiente no lo muestra', async (t) => {
  const app = await entorno(t);
  const { id, alumno, cliente } = await solicitudReclamada(app);

  const antes = await alumno.get(`/solicitudes/${id}`);
  assert.ok(!antes.texto.includes('Calendario de desembolsos'));

  await cliente.post(ruta(id), TERMINOS);
  const despues = await alumno.get(`/solicitudes/${id}`);

  assert.strictEqual(despues.estado, 200);
  assert.ok(despues.texto.includes('Calendario de desembolsos'));
  assert.match(despues.texto, /<th scope="col">Cuota<\/th>/);
  for (const esperado of ['2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01', '300000.00', 'Programado']) {
    assert.ok(despues.texto.includes(esperado), esperado);
  }
  assert.strictEqual(despues.texto.match(/<td>Programado/g).length, 4);
  assert.ok(!/<form[^>]*aprobar/.test(despues.texto), 'el estudiante no puede ejecutar nada');
});

test('el calendario de otra persona no se revela: el detalle ajeno da 404 sin ningun dato del calendario', async (t) => {
  const app = await entorno(t);
  const { id, cliente } = await solicitudReclamada(app);
  await cliente.post(ruta(id), TERMINOS);

  const ajeno = await (await otroEstudiante(app)).get(`/solicitudes/${id}`);

  assert.strictEqual(ajeno.estado, 404);
  assert.ok(!ajeno.texto.includes('2026-12-01'));
  assert.ok(!ajeno.texto.includes('Calendario'));
});

test('otro asesor recibe 403 al aprobar y nada cambia; sin reclamar tambien 403; inexistente y borrador 404', async (t) => {
  const app = await entorno(t);
  const { id } = await solicitudReclamada(app);
  const intruso = await otroAsesor(app);

  assert.strictEqual((await intruso.post(ruta(id), TERMINOS)).estado, 403);
  nadaConfirmado(app, id);

  const libre = await crearSolicitudEnviada(await estudiante(app), { periodoAcademico: '2026-2' });
  assert.strictEqual((await (await asesor(app)).post(ruta(libre), TERMINOS)).estado, 403);
  assert.strictEqual(estadoEnBase(app.db, libre), 'pendiente_revision');

  assert.strictEqual((await intruso.post(ruta('no-existe'), TERMINOS)).estado, 404);
  assert.strictEqual(cuenta(app.db, 'desembolsos'), 0);
  assert.strictEqual(cuenta(app.db, 'calendar_errors'), 0);
});

test('estudiante, comite y direccion reciben 403 en la ruta de aprobar y no cambia nada', async (t) => {
  const app = await entorno(t);
  const { id } = await solicitudReclamada(app);

  for (const [nombre, cliente] of [
    ['estudiante', await estudiante(app)],
    ['comite', await comite(app)],
    ['direccion', await direccion(app)],
  ]) {
    assert.strictEqual((await cliente.post(ruta(id), TERMINOS)).estado, 403, nombre);
  }
  nadaConfirmado(app, id);
});

test('aprobar exige el token CSRF (403 sin el) y no cambia nada', async (t) => {
  const app = await entorno(t);
  const { id, cliente } = await solicitudReclamada(app);

  const sinToken = await cliente.post(ruta(id), TERMINOS, { conToken: false });

  assert.strictEqual(sinToken.estado, 403);
  nadaConfirmado(app, id);
  assert.strictEqual(cuenta(app.db, 'calendar_errors'), 0);
});

// ---------------------------------------------------------------- Paginas

test('el detalle del asesor asignado ofrece aprobar (campos rotulados, fecha, CSRF) junto a rechazar, y deja de ofrecerlo al decidir', async (t) => {
  const app = await entorno(t);
  const { id, cliente } = await solicitudReclamada(app);

  const detalle = await cliente.get(`/asesor/solicitudes/${id}`);

  assert.strictEqual(detalle.estado, 200);
  const texto = detalle.texto;
  assert.match(texto, new RegExp(`<form method="post" action="${ruta(id)}">`));
  assert.match(texto, new RegExp(`action="/asesor/solicitudes/${id}/rechazar"`));
  for (const campo of ['monto', 'numeroCuotas', 'fechaPrimeraCuota']) {
    assert.match(texto, new RegExp(`<label for="${campo}">`));
    assert.match(texto, new RegExp(`<input id="${campo}" name="${campo}" [^>]*required`));
  }
  assert.match(texto, /<input id="fechaPrimeraCuota" name="fechaPrimeraCuota" type="date"/);
  assert.match(texto, /<input type="hidden" name="_csrf" value="[0-9a-f]{64}">/);
  assert.ok(!/<script|style=/.test(texto));

  await cliente.post(ruta(id), TERMINOS);
  const aprobada = await cliente.get(`/asesor/solicitudes/${id}`);
  assert.ok(!aprobada.texto.includes(`action="${ruta(id)}"`));
  assert.ok(!/action="[^"]*\/rechazar"/.test(aprobada.texto));
});

test('los valores invalidos se muestran escapados en el formulario y el error se asocia al campo', async (t) => {
  const app = await entorno(t);
  const { id, cliente } = await solicitudReclamada(app);

  const respuesta = await cliente.post(ruta(id), { ...TERMINOS, monto: '"><script>alert(1)</script>' });

  assert.strictEqual(respuesta.estado, 400);
  assert.ok(!respuesta.texto.includes('<script>alert(1)'));
  assert.ok(respuesta.texto.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.match(respuesta.texto, /<input id="monto" name="monto" [^>]*aria-invalid="true"/);
  assert.match(respuesta.texto, /id="monto-error"/);
  // Los demas valores del intento se conservan.
  assert.match(respuesta.texto, /id="numeroCuotas"[^>]*value="4"/);
  nadaConfirmado(app, id);
});

test('rechazar sigue funcionando y no genera calendario', async (t) => {
  const app = await entorno(t);
  const { id, cliente } = await solicitudReclamada(app);

  const respuesta = await cliente.post(`/asesor/solicitudes/${id}/rechazar`, { motivo: 'Ingresos no soportados' });

  assert.strictEqual(respuesta.estado, 303);
  assert.strictEqual(estadoEnBase(app.db, id), 'rechazada');
  assert.strictEqual(cuenta(app.db, 'desembolsos'), 0);
  assert.strictEqual(auditoriaAprobar(app.db, id).length, 0);
});
