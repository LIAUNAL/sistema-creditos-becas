'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { CLAVES, levantarAplicacion, crearUsuario, crearCliente, clienteConSesion } = require('./ayudaPruebasWeb');
const { DEFAULT_CONFIGURACION } = require('../app/configuracionElegibilidad');
const { calcularElegibilidad } = require('../evaluacion-elegibilidad/calculoElegibilidad');
const { crearUnidadDeTrabajo } = require('../infra/unidadDeTrabajo');
const { ejecutarCasoDeUso } = require('../infra/casoDeUso');
const { crearRepositorioCasosComiteSqlite } = require('../infra/repositorios/repositorioCasosComiteSqlite');
const { crearRevisionComite } = require('../evaluacion-elegibilidad/revisionComite');

// Story 5.12 (P12): comite de becas, cola, decision y otorgamiento (API JSON + pagina minima /comite).
// Cada prueba levanta su propia aplicacion (servidor real en puerto efimero + SQLite en memoria).

async function entorno(t) {
  const app = await levantarAplicacion();
  t.after(app.cerrar);
  return app;
}

const estudiante = (app) => clienteConSesion(app.base, 'estudiante', CLAVES.SEED_PASSWORD_ESTUDIANTE);
const asesor = (app) => clienteConSesion(app.base, 'asesor_financiero', CLAVES.SEED_PASSWORD_ASESOR_FINANCIERO);
const comite = (app) => clienteConSesion(app.base, 'comite_becas', CLAVES.SEED_PASSWORD_COMITE_BECAS);
const direccion = (app) =>
  clienteConSesion(app.base, 'direccion_academica', CLAVES.SEED_PASSWORD_DIRECCION_ACADEMICA);

// Segundo integrante del comite. Se asigna a los casos que entren DESPUES de crearlo (regla Q5 por defecto).
async function integrante(app, nombre) {
  await crearUsuario(app.db, nombre, 'comite_becas', `clave-${nombre}`);
  return clienteConSesion(app.base, nombre, `clave-${nombre}`);
}

const RUTA_BECAS = '/api/becas/solicitudes';
const COLA = '/api/comite/cola';
const caso = (id) => `/api/comite/casos/${id}`;
const decision = (id) => `/api/comite/casos/${id}/decision`;
const json = (respuesta) => JSON.parse(respuesta.texto);

// Con la configuracion por defecto estos datos caen entre los umbrales 50 y 70 (limitrofe).
const LIMITROFE = Object.freeze({ periodoAcademico: '2026-2', promedioAcumulado: 3.5, estrato: 4, ingresosHogar: 3000000 });
const ELEGIBLE = Object.freeze({ periodoAcademico: '2026-1', promedioAcumulado: 4.5, estrato: 2, ingresosHogar: 1500000 });
const NO_ELEGIBLE = Object.freeze({ periodoAcademico: '2026-1', promedioAcumulado: 2, estrato: 6, ingresosHogar: 5500000 });
const INCOMPLETA = Object.freeze({ periodoAcademico: '2026-1', estrato: 3, ingresosHogar: 1000000 });
const PUNTAJE_LIMITROFE = calcularElegibilidad(
  { promedioAcumulado: 3.5, estrato: 4, ingresosHogar: 3000000 },
  DEFAULT_CONFIGURACION,
).puntaje;

const COMENTARIO = 'Cumple el perfil socioeconomico del programa';
const AHORA = '2026-05-04T12:30:00.000Z';

const casosComite = (db) => db.prepare('SELECT * FROM casos_comite ORDER BY rowid').all();
const premios = (db) => db.prepare('SELECT * FROM scholarship_awards ORDER BY id').all();
const auditoriaDe = (db, accion) => db.prepare('SELECT * FROM audit_log WHERE accion = ? ORDER BY id').all(accion);
const avisosComite = (db) => db.prepare("SELECT * FROM notifications WHERE tipo = 'caso_limitrofe' ORDER BY id").all();
const idUsuario = (db, nombre) => String(db.prepare('SELECT id FROM usuarios WHERE nombre_usuario = ?').get(nombre).id);

async function escalar(cliente, datos = {}) {
  const respuesta = await cliente.postJson(RUTA_BECAS, { ...LIMITROFE, ...datos });
  assert.strictEqual(respuesta.estado, 201, respuesta.texto);
  return json(respuesta).id;
}

// ---------------------------------------------------------------- Scenarios de la spec

test('Scenario: un caso limitrofe aparece en la cola de los integrantes asignados y se encola el aviso al comite', async (t) => {
  const app = await entorno(t);
  const primero = await comite(app);
  const segundo = await integrante(app, 'comite2');
  const id = await escalar(await estudiante(app));

  for (const miembro of [primero, segundo]) {
    const respuesta = await miembro.get(COLA);
    assert.strictEqual(respuesta.estado, 200, respuesta.texto);
    const cola = json(respuesta);
    assert.strictEqual(cola.length, 1);
    assert.strictEqual(cola[0].id, id);
    assert.strictEqual(cola[0].periodoAcademico, '2026-2');
    assert.ok(Math.abs(cola[0].puntaje - PUNTAJE_LIMITROFE) < 1e-9);
  }
  const avisos = avisosComite(app.db);
  assert.strictEqual(avisos.length, 1);
  assert.strictEqual(avisos[0].destinatario_tipo, 'rol');
  assert.strictEqual(avisos[0].destinatario_id, 'comite_becas');
  assert.strictEqual(avisos[0].entregada_en, null);
  assert.deepStrictEqual(JSON.parse(avisos[0].payload).idCaso, id);
  assert.ok(Math.abs(JSON.parse(avisos[0].payload).puntaje - PUNTAJE_LIMITROFE) < 1e-9);
  const [fila] = casosComite(app.db);
  assert.deepStrictEqual(
    [fila.id, fila.estudiante_id, fila.periodo_academico, fila.estado],
    [id, idUsuario(app.db, 'estudiante'), '2026-2', 'en_revision_comite'],
  );
});

test('Scenario: un integrante registra otorgada con comentario -> estado, audit_log y scholarship_awards', async (t) => {
  const app = await entorno(t);
  const miembro = await comite(app);
  const id = await escalar(await estudiante(app));

  const respuesta = await miembro.postJson(decision(id), { decision: 'otorgada', comentario: COMENTARIO });

  assert.strictEqual(respuesta.estado, 200, respuesta.texto);
  assert.deepStrictEqual(json(respuesta), { id, estado: 'otorgada', decision: 'otorgada', comentario: COMENTARIO });
  const [fila] = casosComite(app.db);
  assert.strictEqual(fila.estado, 'otorgada');
  const historial = JSON.parse(fila.historial);
  assert.deepStrictEqual(historial.at(-1), { tipo: 'decision_comite', fecha: AHORA, decision: 'otorgada', comentario: COMENTARIO });

  const [auditada] = auditoriaDe(app.db, 'decidir_caso_comite');
  assert.deepStrictEqual(
    [auditada.actor, auditada.rol, auditada.objetivo, auditada.fecha],
    ['comite_becas', 'comite_becas', `caso_comite:${id}`, AHORA],
  );
  const detalle = JSON.parse(auditada.detalle);
  assert.strictEqual(String(detalle.usuarioId), idUsuario(app.db, 'comite_becas'));
  assert.deepStrictEqual({ decision: detalle.decision, comentario: detalle.comentario }, { decision: 'otorgada', comentario: COMENTARIO });

  const [premio] = premios(app.db);
  assert.strictEqual(premios(app.db).length, 1);
  assert.deepStrictEqual(
    [premio.application_id, premio.estudiante_id, premio.periodo_academico, premio.origen, premio.otorgada_en],
    [id, idUsuario(app.db, 'estudiante'), '2026-2', 'comite', AHORA],
  );
  assert.deepStrictEqual(json(await miembro.get(COLA)), [], 'el caso decidido sale de la cola');
});

test('Scenario: un integrante no asignado recibe 403 al decidir y no cambia nada', async (t) => {
  const app = await entorno(t);
  const id = await escalar(await estudiante(app));
  const tarde = await integrante(app, 'comite_tarde'); // creado despues del escalamiento: sin asignacion

  const respuesta = await tarde.postJson(decision(id), { decision: 'otorgada', comentario: COMENTARIO });

  assert.strictEqual(respuesta.estado, 403, respuesta.texto);
  assert.strictEqual(casosComite(app.db)[0].estado, 'en_revision_comite');
  assert.strictEqual(premios(app.db).length, 0);
  assert.strictEqual(auditoriaDe(app.db, 'decidir_caso_comite').length, 0);
});

test('Scenario: al recargar desde SQLite en una unidad de trabajo nueva persisten el estado y el comentario', async (t) => {
  const app = await entorno(t);
  const miembro = await comite(app);
  const id = await escalar(await estudiante(app));
  await miembro.postJson(decision(id), { decision: 'denegada', comentario: COMENTARIO });

  const repositorio = crearRepositorioCasosComiteSqlite({ db: app.db });
  const revision = crearRevisionComite({ notificador: { notificarCasoLimitrofe() {} }, repositorio });
  const recargado = crearUnidadDeTrabajo().correr(() => revision.obtenerCaso(id));

  assert.strictEqual(recargado.estado, 'denegada');
  assert.strictEqual(recargado.historial.at(-1).comentario, COMENTARIO);
  assert.ok(recargado.historial.at(-1).fecha instanceof Date);
  assert.strictEqual(recargado.historial.at(-1).fecha.toISOString(), AHORA);
  assert.deepStrictEqual(recargado.estudiante, { estudianteId: idUsuario(app.db, 'estudiante') });
  assert.strictEqual(recargado.periodoAcademico, '2026-2');
});

// ---------------------------------------------------------------- Escalamiento

test('los casos automaticos (elegible, no_elegible, datos_incompletos) no entran a la cola ni avisan al comite', async (t) => {
  const app = await entorno(t);
  const miembro = await comite(app);
  const alumno = await estudiante(app);

  for (const datos of [ELEGIBLE, { ...NO_ELEGIBLE, periodoAcademico: '2026-3' }, { ...INCOMPLETA, periodoAcademico: '2026-4' }]) {
    assert.strictEqual((await alumno.postJson(RUTA_BECAS, datos)).estado, 201);
  }

  assert.deepStrictEqual(json(await miembro.get(COLA)), []);
  assert.strictEqual(casosComite(app.db).length, 0);
  assert.strictEqual(avisosComite(app.db).length, 0);
  assert.strictEqual(auditoriaDe(app.db, 'escalar_a_comite').length, 0);
});

test('el escalamiento audita al sistema y asigna el caso a todo integrante activo del comite', async (t) => {
  const app = await entorno(t);
  await integrante(app, 'comite2');
  await crearUsuario(app.db, 'comite_baja', 'comite_becas', 'clave');
  app.db.prepare("UPDATE usuarios SET activo = 0 WHERE nombre_usuario = 'comite_baja'").run();
  const id = await escalar(await estudiante(app));

  const [entrada, ...resto] = auditoriaDe(app.db, 'escalar_a_comite');

  assert.strictEqual(resto.length, 0);
  assert.deepStrictEqual([entrada.actor, entrada.rol, entrada.objetivo, entrada.fecha], ['sistema', 'sistema', `caso_comite:${id}`, AHORA]);
  assert.ok(Math.abs(JSON.parse(entrada.detalle).puntaje - PUNTAJE_LIMITROFE) < 1e-9);
  assert.strictEqual(JSON.parse(entrada.detalle).periodoAcademico, '2026-2');
  const asignados = app.db
    .prepare("SELECT usuario_id FROM asignaciones WHERE tipo_recurso = 'caso_comite' AND recurso_id = ? ORDER BY usuario_id")
    .all(id)
    .map((f) => String(f.usuario_id));
  assert.deepStrictEqual(asignados, [idUsuario(app.db, 'comite_becas'), idUsuario(app.db, 'comite2')].sort());
});

test('completar los datos de una solicitud incompleta que resulta limitrofe tambien la encola', async (t) => {
  const app = await entorno(t);
  const miembro = await comite(app);
  const alumno = await estudiante(app);
  const { id } = json(await alumno.postJson(RUTA_BECAS, { periodoAcademico: '2026-2', estrato: 4, ingresosHogar: 3000000 }));
  assert.deepStrictEqual(json(await miembro.get(COLA)), []);

  const completada = await alumno.postJson(`${RUTA_BECAS}/${id}/completar`, { promedioAcumulado: 3.5 });

  assert.strictEqual(completada.estado, 200, completada.texto);
  assert.deepStrictEqual(json(await miembro.get(COLA)).map((c) => c.id), [id]);
  assert.strictEqual(avisosComite(app.db).length, 1);
  assert.strictEqual(auditoriaDe(app.db, 'escalar_a_comite').length, 1);
});

test('procesar de nuevo el mismo caso no duplica la cola, el aviso, la asignacion ni la auditoria', async (t) => {
  const app = await entorno(t);
  const id = await escalar(await estudiante(app));
  const { revisionComite, colector } = app.contexto;

  for (let veces = 0; veces < 2; veces += 1) {
    await ejecutarCasoDeUso({
      db: app.db,
      colector,
      reloj: app.reloj,
      unidadDeTrabajo: crearUnidadDeTrabajo(),
      operacion: () =>
        revisionComite.procesarResultado(
          { id, estudiante: { estudianteId: 'x' }, periodoAcademico: '2026-2' },
          { clasificacion: 'limitrofe', decisionAutomatica: false, puntaje: PUNTAJE_LIMITROFE },
        ),
      persistir: () => {},
    });
  }

  assert.strictEqual(casosComite(app.db).length, 1);
  assert.strictEqual(avisosComite(app.db).length, 1);
  assert.strictEqual(auditoriaDe(app.db, 'escalar_a_comite').length, 1);
  assert.strictEqual(casosComite(app.db)[0].estudiante_id, idUsuario(app.db, 'estudiante'));
});

// ---------------------------------------------------------------- Decision

test('denegada actualiza el estado y la auditoria pero no crea beca', async (t) => {
  const app = await entorno(t);
  const miembro = await comite(app);
  const id = await escalar(await estudiante(app));

  const respuesta = await miembro.postJson(decision(id), { decision: 'denegada', comentario: 'Ingresos por encima del umbral' });

  assert.strictEqual(respuesta.estado, 200, respuesta.texto);
  assert.strictEqual(json(respuesta).estado, 'denegada');
  assert.strictEqual(casosComite(app.db)[0].estado, 'denegada');
  assert.strictEqual(premios(app.db).length, 0);
  assert.strictEqual(JSON.parse(auditoriaDe(app.db, 'decidir_caso_comite')[0].detalle).decision, 'denegada');
});

test('decidir dos veces el mismo caso -> 409 y no se duplica el premio ni la auditoria', async (t) => {
  const app = await entorno(t);
  const miembro = await comite(app);
  const otro = await integrante(app, 'comite2');
  const id = await escalar(await estudiante(app));
  await miembro.postJson(decision(id), { decision: 'otorgada', comentario: COMENTARIO });

  const repetida = await miembro.postJson(decision(id), { decision: 'otorgada', comentario: COMENTARIO });
  const contraria = await otro.postJson(decision(id), { decision: 'denegada', comentario: 'otra opinion' });

  assert.strictEqual(repetida.estado, 409, repetida.texto);
  assert.strictEqual(json(repetida).codigo, 'CASO_NO_EN_COLA');
  assert.strictEqual(contraria.estado, 409, contraria.texto);
  assert.strictEqual(casosComite(app.db)[0].estado, 'otorgada');
  assert.strictEqual(premios(app.db).length, 1);
  assert.strictEqual(auditoriaDe(app.db, 'decidir_caso_comite').length, 1);
});

for (const [descripcion, cuerpo] of [
  ['comentario vacio', { decision: 'otorgada', comentario: '' }],
  ['comentario solo con espacios', { decision: 'otorgada', comentario: '   ' }],
  ['sin comentario', { decision: 'denegada' }],
  ['decision desconocida', { decision: 'aplazada', comentario: COMENTARIO }],
  ['sin decision', { comentario: COMENTARIO }],
]) {
  test(`validacion: ${descripcion} -> 400 y el caso sigue en la cola`, async (t) => {
    const app = await entorno(t);
    const miembro = await comite(app);
    const id = await escalar(await estudiante(app));

    const respuesta = await miembro.postJson(decision(id), cuerpo);

    assert.strictEqual(respuesta.estado, 400, respuesta.texto);
    assert.strictEqual(json(respuesta).codigo, 'DECISION_INVALIDA');
    assert.strictEqual(casosComite(app.db)[0].estado, 'en_revision_comite');
    assert.deepStrictEqual(json(await miembro.get(COLA)).map((c) => c.id), [id]);
    assert.strictEqual(premios(app.db).length, 0);
    assert.strictEqual(auditoriaDe(app.db, 'decidir_caso_comite').length, 0);
  });
}

test('un caso que ya tiene beca no se otorga dos veces (409) y queda en la cola', async (t) => {
  const app = await entorno(t);
  const miembro = await comite(app);
  const id = await escalar(await estudiante(app));
  app.db
    .prepare("INSERT INTO scholarship_awards (id, application_id, estudiante_id, periodo_academico, origen, otorgada_en) VALUES ('previo', ?, 'x', '2026-2', 'automatica', ?)")
    .run(id, AHORA);

  const respuesta = await miembro.postJson(decision(id), { decision: 'otorgada', comentario: COMENTARIO });

  assert.strictEqual(respuesta.estado, 409, respuesta.texto);
  assert.strictEqual(json(respuesta).codigo, 'BECA_YA_OTORGADA');
  assert.strictEqual(casosComite(app.db)[0].estado, 'en_revision_comite');
  assert.strictEqual(premios(app.db).length, 1);
  assert.strictEqual(auditoriaDe(app.db, 'decidir_caso_comite').length, 0);
});

test('un caso inexistente o que no es del comite da 403 al decidir (nadie esta asignado) y 404 al abrirlo', async (t) => {
  const app = await entorno(t);
  const miembro = await comite(app);
  const { id } = json(await (await estudiante(app)).postJson(RUTA_BECAS, ELEGIBLE));

  for (const ajeno of [id, 'no-existe']) {
    assert.strictEqual((await miembro.postJson(decision(ajeno), { decision: 'otorgada', comentario: COMENTARIO })).estado, 403);
    assert.strictEqual((await miembro.get(caso(ajeno))).estado, 404);
  }
  assert.strictEqual(premios(app.db).length, 1, 'solo la beca automatica');
});

// ---------------------------------------------------------------- Lectura

test('el integrante asignado ve el puntaje y los datos socioeconomicos; el no asignado recibe 404 igual que un inexistente', async (t) => {
  const app = await entorno(t);
  const miembro = await comite(app);
  const id = await escalar(await estudiante(app));
  const tarde = await integrante(app, 'comite_tarde');

  const abierto = await miembro.get(caso(id));
  const denegado = await tarde.get(caso(id));
  const inexistente = await tarde.get(caso('no-existe'));

  assert.strictEqual(abierto.estado, 200, abierto.texto);
  const cuerpo = json(abierto);
  assert.strictEqual(cuerpo.id, id);
  assert.strictEqual(cuerpo.estado, 'en_revision_comite');
  assert.strictEqual(cuerpo.periodoAcademico, '2026-2');
  assert.ok(Math.abs(cuerpo.puntaje - PUNTAJE_LIMITROFE) < 1e-9);
  assert.deepStrictEqual(
    [cuerpo.promedioAcumulado, cuerpo.estrato, cuerpo.ingresosHogar],
    [LIMITROFE.promedioAcumulado, LIMITROFE.estrato, LIMITROFE.ingresosHogar],
  );
  assert.strictEqual(cuerpo.historial[0].tipo, 'ingreso_cola_comite');
  assert.strictEqual(denegado.estado, 404);
  assert.strictEqual(denegado.texto, inexistente.texto, 'denegar == no encontrado');
});

test('la cola solo muestra los casos asignados al integrante que siguen en revision', async (t) => {
  const app = await entorno(t);
  const miembro = await comite(app);
  const otro = await integrante(app, 'comite2');
  const alumno = await estudiante(app);
  const primero = await escalar(alumno, { periodoAcademico: '2026-2' });
  const segundo = await escalar(alumno, { periodoAcademico: '2026-3' });
  app.db
    .prepare("DELETE FROM asignaciones WHERE tipo_recurso = 'caso_comite' AND recurso_id = ? AND usuario_id = ?")
    .run(segundo, idUsuario(app.db, 'comite2'));
  const tardio = await integrante(app, 'comite_tarde');

  assert.deepStrictEqual(json(await miembro.get(COLA)).map((c) => c.id), [primero, segundo]);
  assert.deepStrictEqual(json(await otro.get(COLA)).map((c) => c.id), [primero]);
  assert.deepStrictEqual(json(await tardio.get(COLA)), []);

  await miembro.postJson(decision(primero), { decision: 'denegada', comentario: COMENTARIO });
  assert.deepStrictEqual(json(await miembro.get(COLA)).map((c) => c.id), [segundo]);
  assert.deepStrictEqual(json(await otro.get(COLA)), []);
});

test('tras la decision el estudiante ve su beca otorgada y el caso decidido sigue abierto para el comite', async (t) => {
  const app = await entorno(t);
  const miembro = await comite(app);
  const alumno = await estudiante(app);
  const id = await escalar(alumno);
  await miembro.postJson(decision(id), { decision: 'otorgada', comentario: COMENTARIO });

  const vistaEstudiante = json(await alumno.get(`${RUTA_BECAS}/${id}`));
  const vistaComite = json(await miembro.get(caso(id)));

  assert.strictEqual(vistaEstudiante.becaOtorgada, true);
  assert.ok(!JSON.stringify(vistaEstudiante).includes(COMENTARIO), 'el estudiante no ve el comentario del comite');
  assert.strictEqual(vistaComite.estado, 'otorgada');
  assert.strictEqual(vistaComite.historial.at(-1).comentario, COMENTARIO);
});

// ---------------------------------------------------------------- Atomicidad

test('decision, auditoria, beca y outbox se confirman juntos: si falla la auditoria no queda nada', async (t) => {
  const app = await entorno(t);
  const miembro = await comite(app);
  const id = await escalar(await estudiante(app));
  const avisosAntes = app.db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n;
  app.db.exec(`CREATE TRIGGER forzar_fallo BEFORE INSERT ON audit_log
    WHEN NEW.accion = 'decidir_caso_comite'
    BEGIN SELECT RAISE(ABORT, 'fallo forzado'); END`);

  const respuesta = await miembro.postJson(decision(id), { decision: 'otorgada', comentario: COMENTARIO });

  assert.strictEqual(respuesta.estado, 500, respuesta.texto);
  assert.strictEqual(casosComite(app.db)[0].estado, 'en_revision_comite');
  assert.strictEqual(premios(app.db).length, 0);
  assert.strictEqual(app.db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n, avisosAntes);
  app.db.exec('DROP TRIGGER forzar_fallo');
  assert.strictEqual((await miembro.postJson(decision(id), { decision: 'otorgada', comentario: COMENTARIO })).estado, 200);
});

test('si falla la auditoria del escalamiento no queda solicitud, caso, asignacion ni aviso', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  app.db.exec(`CREATE TRIGGER forzar_fallo BEFORE INSERT ON audit_log
    WHEN NEW.accion = 'escalar_a_comite'
    BEGIN SELECT RAISE(ABORT, 'fallo forzado'); END`);

  const respuesta = await alumno.postJson(RUTA_BECAS, LIMITROFE);

  assert.strictEqual(respuesta.estado, 500, respuesta.texto);
  assert.strictEqual(app.db.prepare('SELECT COUNT(*) AS n FROM scholarship_applications').get().n, 0);
  assert.strictEqual(casosComite(app.db).length, 0);
  assert.strictEqual(avisosComite(app.db).length, 0);
  assert.strictEqual(app.db.prepare("SELECT COUNT(*) AS n FROM asignaciones WHERE tipo_recurso = 'caso_comite'").get().n, 0);
});

test('con confirmarSiError por defecto, una operacion que lanza tras mutar el caso conserva el cambio y el aviso', async (t) => {
  const app = await entorno(t);
  const id = await escalar(await estudiante(app));
  const { revisionComite, colector } = app.contexto;

  await assert.rejects(
    ejecutarCasoDeUso({
      db: app.db,
      colector,
      reloj: app.reloj,
      unidadDeTrabajo: crearUnidadDeTrabajo(),
      operacion: async () => {
        revisionComite.registrarDecision(id, { decision: 'denegada', comentario: 'decidida y luego fallo' });
        throw new Error('fallo posterior');
      },
      persistir: () => {},
    }),
    /fallo posterior/,
  );

  assert.strictEqual(casosComite(app.db)[0].estado, 'denegada');
});

// ---------------------------------------------------------------- Seguridad y acceso

test('sin sesion -> 401; estudiante, asesor y direccion reciben 403 en la cola, el detalle y la decision', async (t) => {
  const app = await entorno(t);
  const id = await escalar(await estudiante(app));
  const anonimo = crearCliente(app.base);
  assert.strictEqual((await anonimo.get(COLA)).estado, 401);
  assert.strictEqual((await anonimo.get(caso(id))).estado, 401);

  for (const abrir of [estudiante, asesor, direccion]) {
    const cliente = await abrir(app);
    assert.strictEqual((await cliente.get(COLA)).estado, 403);
    assert.strictEqual((await cliente.get(caso(id))).estado, 403);
    assert.strictEqual((await cliente.postJson(decision(id), { decision: 'otorgada', comentario: COMENTARIO })).estado, 403);
    assert.strictEqual((await cliente.get('/comite')).estado, 403);
  }
  assert.strictEqual(casosComite(app.db)[0].estado, 'en_revision_comite');
  assert.strictEqual(premios(app.db).length, 0);
});

test('sin token CSRF la decision se rechaza con 403 y no cambia nada', async (t) => {
  const app = await entorno(t);
  const miembro = await comite(app);
  const id = await escalar(await estudiante(app));

  const respuesta = await miembro.postJson(decision(id), { decision: 'otorgada', comentario: COMENTARIO }, { conToken: false });

  assert.strictEqual(respuesta.estado, 403, respuesta.texto);
  assert.strictEqual(json(respuesta).codigo, 'CSRF_INVALIDO');
  assert.strictEqual(casosComite(app.db)[0].estado, 'en_revision_comite');
});

// ---------------------------------------------------------------- Aterrizaje del comite

test('el login por formulario del comite aterriza en /comite y la raiz tambien lo redirige alli', async (t) => {
  const app = await entorno(t);
  const cliente = crearCliente(app.base);

  const login = await cliente.iniciarSesion('comite_becas', CLAVES.SEED_PASSWORD_COMITE_BECAS);

  assert.strictEqual(login.estado, 303);
  assert.strictEqual(login.ubicacion, '/comite');
  assert.strictEqual((await cliente.get('/')).ubicacion, '/comite');
  assert.strictEqual((await cliente.get('/login')).ubicacion, '/comite');
});

test('/comite lista la cola del integrante en una pagina accesible con enlace al caso', async (t) => {
  const app = await entorno(t);
  const miembro = await comite(app);
  const vacia = await miembro.get('/comite');
  assert.strictEqual(vacia.estado, 200, vacia.texto);
  assert.ok(vacia.texto.includes('<html lang="es">'));
  assert.ok(vacia.texto.includes('<h1>'));
  assert.ok(vacia.texto.includes('No hay casos'));

  const id = await escalar(await estudiante(app));
  const pagina = await miembro.get('/comite');

  assert.strictEqual(pagina.estado, 200, pagina.texto);
  assert.ok(pagina.texto.includes('2026-2'));
  assert.ok(pagina.texto.includes(`href="/api/comite/casos/${id}"`));
  assert.ok(pagina.texto.includes('<caption>'));
  assert.ok(pagina.texto.includes('action="/logout"'));
});

test('/comite sin sesion redirige a /login', async (t) => {
  const app = await entorno(t);

  const respuesta = await crearCliente(app.base).get('/comite');

  assert.strictEqual(respuesta.estado, 303);
  assert.strictEqual(respuesta.ubicacion, '/login');
});
