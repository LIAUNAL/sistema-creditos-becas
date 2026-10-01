'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { CLAVES, levantarAplicacion, crearUsuario, crearCliente, clienteConSesion } = require('./ayudaPruebasWeb');
const { DEFAULT_CONFIGURACION } = require('../app/configuracionElegibilidad');

// Story 5.11 (P11): solicitud de beca y elegibilidad automatica (API JSON). Cada prueba levanta su
// propia aplicacion (servidor real en puerto efimero + SQLite en memoria).

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

async function otroEstudiante(app) {
  await crearUsuario(app.db, 'estudiante2', 'estudiante', 'clave-estudiante-2');
  return clienteConSesion(app.base, 'estudiante2', 'clave-estudiante-2');
}

const RUTA = '/api/becas/solicitudes';
const json = (respuesta) => JSON.parse(respuesta.texto);

// Con la configuracion por defecto: promedio 4.5/5 (peso .5), estrato 2 (peso .25), ingresos 1.5M/6M (peso .25).
const ELEGIBLE = Object.freeze({ periodoAcademico: '2026-1', promedioAcumulado: 4.5, estrato: 2, ingresosHogar: 1500000 });
const NO_ELEGIBLE = Object.freeze({ periodoAcademico: '2026-1', promedioAcumulado: 2, estrato: 6, ingresosHogar: 5500000 });
const LIMITROFE = Object.freeze({ periodoAcademico: '2026-1', promedioAcumulado: 3.5, estrato: 4, ingresosHogar: 3000000 });

const aplicaciones = (db) => db.prepare('SELECT * FROM scholarship_applications ORDER BY creada_en, id').all();
const premios = (db) => db.prepare('SELECT * FROM scholarship_awards ORDER BY id').all();
const auditoriaDe = (db, accion) => db.prepare('SELECT * FROM audit_log WHERE accion = ? ORDER BY id').all(accion);
const idUsuario = (db, nombre) => String(db.prepare('SELECT id FROM usuarios WHERE nombre_usuario = ?').get(nombre).id);

// ---------------------------------------------------------------- Scenarios de la spec

test('Scenario: envia una solicitud de beca con promedioAcumulado -> se guarda y se ejecuta el calculo', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);

  const respuesta = await cliente.postJson(RUTA, ELEGIBLE);

  assert.strictEqual(respuesta.estado, 201, respuesta.texto);
  const cuerpo = json(respuesta);
  assert.strictEqual(cuerpo.clasificacion, 'elegible');
  assert.deepStrictEqual(cuerpo.camposFaltantes, []);
  const filas = aplicaciones(app.db);
  assert.strictEqual(filas.length, 1);
  assert.strictEqual(filas[0].id, cuerpo.id);
  assert.strictEqual(filas[0].estudiante_id, idUsuario(app.db, 'estudiante'));
  assert.strictEqual(filas[0].periodo_academico, '2026-1');
  assert.strictEqual(filas[0].promedio_acumulado, 4.5);
  assert.strictEqual(filas[0].estrato, 2);
  assert.strictEqual(filas[0].ingresos_hogar, 1500000);
  assert.strictEqual(filas[0].clasificacion, 'elegible');
  assert.strictEqual(filas[0].decision_automatica, 1);
  assert.ok(Math.abs(filas[0].puntaje - 83.75) < 1e-9, `puntaje ${filas[0].puntaje}`);
  assert.deepStrictEqual(JSON.parse(filas[0].campos_faltantes), []);
});

test('Scenario: resultado elegible -> una fila en scholarship_awards con el periodo de la solicitud', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);

  const { id } = json(await cliente.postJson(RUTA, { ...ELEGIBLE, periodoAcademico: '2026-2' }));

  const filas = premios(app.db);
  assert.strictEqual(filas.length, 1);
  assert.strictEqual(filas[0].application_id, id);
  assert.strictEqual(filas[0].estudiante_id, idUsuario(app.db, 'estudiante'));
  assert.strictEqual(filas[0].periodo_academico, '2026-2');
  assert.strictEqual(filas[0].origen, 'automatica');
  assert.ok(filas[0].otorgada_en);
});

test('Scenario: solicitud sin promedioAcumulado -> datos_incompletos, sin decision automatica ni beca', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const { promedioAcumulado, ...sinPromedio } = ELEGIBLE;

  const respuesta = await cliente.postJson(RUTA, sinPromedio);

  assert.strictEqual(respuesta.estado, 201, respuesta.texto);
  const cuerpo = json(respuesta);
  assert.strictEqual(cuerpo.clasificacion, 'datos_incompletos');
  assert.deepStrictEqual(cuerpo.camposFaltantes, ['promedioAcumulado']);
  const [fila] = aplicaciones(app.db);
  assert.strictEqual(fila.clasificacion, 'datos_incompletos');
  assert.strictEqual(fila.puntaje, null);
  assert.strictEqual(fila.decision_automatica, 0);
  assert.deepStrictEqual(JSON.parse(fila.campos_faltantes), ['promedioAcumulado']);
  assert.strictEqual(premios(app.db).length, 0);
  assert.strictEqual(auditoriaDe(app.db, 'otorgar_beca_automatica').length, 0);
});

test('Scenario: un estudiante consulta la solicitud de beca de otro -> 404 (igual que una inexistente)', async (t) => {
  const app = await entorno(t);
  const propietario = await estudiante(app);
  const ajeno = await otroEstudiante(app);
  const { id } = json(await propietario.postJson(RUTA, ELEGIBLE));

  const denegada = await ajeno.get(`${RUTA}/${id}`);
  const inexistente = await ajeno.get(`${RUTA}/no-existe`);

  assert.ok([403, 404].includes(denegada.estado));
  assert.strictEqual(denegada.estado, 404);
  assert.strictEqual(denegada.texto, inexistente.texto, 'denegar == no encontrado');
  assert.strictEqual(inexistente.estado, 404);
});

// ---------------------------------------------------------------- Clasificaciones y premios

test('no_elegible y limitrofe guardan la solicitud sin beca (el comite entra en P12)', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);

  const noElegible = json(await cliente.postJson(RUTA, NO_ELEGIBLE));
  const limitrofe = json(await cliente.postJson(RUTA, { ...LIMITROFE, periodoAcademico: '2026-2' }));

  assert.strictEqual(noElegible.clasificacion, 'no_elegible');
  assert.strictEqual(limitrofe.clasificacion, 'limitrofe en revisión');
  const filas = Object.fromEntries(aplicaciones(app.db).map((f) => [f.id, f]));
  assert.strictEqual(filas[noElegible.id].clasificacion, 'no_elegible');
  assert.strictEqual(filas[limitrofe.id].clasificacion, 'limitrofe');
  assert.strictEqual(filas[limitrofe.id].decision_automatica, 1);
  assert.strictEqual(premios(app.db).length, 0);
  assert.strictEqual(app.db.prepare("SELECT COUNT(*) AS n FROM notifications").get().n, 0, 'no se notifica al estudiante');
});

test('umbrales de la configuracion real: justo en el umbral clasifica hacia arriba, un poco menos hacia abajo', async (t) => {
  const { umbrales } = DEFAULT_CONFIGURACION;
  assert.deepStrictEqual([umbrales.elegible, umbrales.limitrofe], [70, 50]);
  const app = await entorno(t);
  const cliente = await estudiante(app);
  // Con pesos .5/.25/.25, promedio 5 y estrato 6: puntaje = 50 + 25 * (1 - ingresos / 6.000.000).
  const casos = [
    { periodoAcademico: 'p1', promedioAcumulado: 5, estrato: 6, ingresosHogar: 1200000, esperado: 'elegible', puntaje: 70 },
    { periodoAcademico: 'p2', promedioAcumulado: 5, estrato: 6, ingresosHogar: 1200001, esperado: 'limitrofe', puntaje: null },
    { periodoAcademico: 'p3', promedioAcumulado: 5, estrato: 6, ingresosHogar: 6000000, esperado: 'limitrofe', puntaje: 50 },
    { periodoAcademico: 'p4', promedioAcumulado: 4.9, estrato: 6, ingresosHogar: 6000000, esperado: 'no_elegible', puntaje: null },
  ];

  for (const { esperado, puntaje, ...datos } of casos) {
    const respuesta = await cliente.postJson(RUTA, datos);
    assert.strictEqual(respuesta.estado, 201, respuesta.texto);
    const fila = app.db.prepare('SELECT clasificacion, puntaje FROM scholarship_applications WHERE id = ?').get(json(respuesta).id);
    assert.strictEqual(fila.clasificacion, esperado, `${datos.periodoAcademico}: puntaje ${fila.puntaje}`);
    if (puntaje !== null) assert.ok(Math.abs(fila.puntaje - puntaje) < 1e-9, `${datos.periodoAcademico}: ${fila.puntaje}`);
  }
  assert.deepStrictEqual(premios(app.db).map((p) => p.periodo_academico), ['p1']);
});

test('una solicitud con campos socioeconomicos faltantes tambien queda datos_incompletos y los lista', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);

  const respuesta = await cliente.postJson(RUTA, { periodoAcademico: '2026-1', promedioAcumulado: 4 });

  assert.strictEqual(respuesta.estado, 201, respuesta.texto);
  assert.deepStrictEqual(json(respuesta).camposFaltantes, ['estrato', 'ingresosHogar']);
  assert.strictEqual(premios(app.db).length, 0);
});

test('acepta un cuerpo de formulario (x-www-form-urlencoded) con CSRF en el campo _csrf', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);

  const respuesta = await cliente.post(RUTA, {
    periodoAcademico: '2026-1',
    promedioAcumulado: '4.5',
    estrato: '2',
    ingresosHogar: '1500000',
  });

  assert.strictEqual(respuesta.estado, 201, respuesta.texto);
  assert.strictEqual(json(respuesta).clasificacion, 'elegible');
});

// ---------------------------------------------------------------- Unicidad y validacion

test('una segunda solicitud para el mismo periodo -> 409 que apunta a la existente, sin cambiar nada', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const primera = json(await cliente.postJson(RUTA, NO_ELEGIBLE));

  const segunda = await cliente.postJson(RUTA, ELEGIBLE);

  assert.strictEqual(segunda.estado, 409, segunda.texto);
  assert.deepStrictEqual(json(segunda), { codigo: 'SOLICITUD_BECA_EXISTENTE', id: primera.id });
  assert.strictEqual(segunda.cabeceras.get('location'), `${RUTA}/${primera.id}`);
  assert.strictEqual(aplicaciones(app.db).length, 1);
  assert.strictEqual(aplicaciones(app.db)[0].clasificacion, 'no_elegible');
  assert.strictEqual(premios(app.db).length, 0);
  // Otro periodo y otro estudiante si pueden.
  assert.strictEqual((await cliente.postJson(RUTA, { ...ELEGIBLE, periodoAcademico: '2026-2' })).estado, 201);
  assert.strictEqual((await (await otroEstudiante(app)).postJson(RUTA, ELEGIBLE)).estado, 201);
});

for (const [descripcion, cambio] of [
  ['promedio no numerico', { promedioAcumulado: 'abc' }],
  ['promedio negativo', { promedioAcumulado: -1 }],
  ['promedio por encima de la escala', { promedioAcumulado: 5.1 }],
  ['estrato 7', { estrato: 7 }],
  ['estrato 0', { estrato: 0 }],
  ['estrato decimal', { estrato: 2.5 }],
  ['ingresos negativos', { ingresosHogar: -5 }],
  ['ingresos no numericos', { ingresosHogar: '12abc' }],
  ['sin periodo', { periodoAcademico: '' }],
  ['periodo demasiado largo', { periodoAcademico: 'x'.repeat(21) }],
]) {
  test(`validacion: ${descripcion} -> 400 sin guardar nada`, async (t) => {
    const app = await entorno(t);
    const cliente = await estudiante(app);

    const respuesta = await cliente.postJson(RUTA, { ...ELEGIBLE, ...cambio });

    assert.strictEqual(respuesta.estado, 400, respuesta.texto);
    assert.strictEqual(json(respuesta).codigo, 'DATOS_INVALIDOS');
    assert.strictEqual(aplicaciones(app.db).length, 0);
    assert.strictEqual(premios(app.db).length, 0);
    assert.strictEqual(auditoriaDe(app.db, 'presentar_solicitud_beca').length, 0);
  });
}

// ---------------------------------------------------------------- Lectura por el propietario

test('el propietario consulta su solicitud sin puntaje ni datos socioeconomicos', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const { id } = json(await cliente.postJson(RUTA, ELEGIBLE));

  const respuesta = await cliente.get(`${RUTA}/${id}`);

  assert.strictEqual(respuesta.estado, 200, respuesta.texto);
  const cuerpo = json(respuesta);
  assert.strictEqual(cuerpo.id, id);
  assert.strictEqual(cuerpo.periodoAcademico, '2026-1');
  assert.strictEqual(cuerpo.clasificacion, 'elegible');
  assert.strictEqual(cuerpo.becaOtorgada, true);
  for (const prohibido of ['puntaje', 'promedio', 'estrato', 'ingresos', '83.75', '1500000', 'decision', 'estudiante']) {
    assert.ok(!respuesta.texto.toLowerCase().includes(prohibido.toLowerCase()), `la respuesta expone ${prohibido}: ${respuesta.texto}`);
  }
  // La respuesta al presentar tampoco lleva el puntaje.
  const creada = await cliente.postJson(RUTA, { ...NO_ELEGIBLE, periodoAcademico: '2026-3' });
  assert.strictEqual(creada.estado, 201, creada.texto);
  assert.ok(!creada.texto.includes('puntaje'), creada.texto);
});

test('GET de una solicitud datos_incompletos lista los datos faltantes por categoria', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const { id } = json(await cliente.postJson(RUTA, { periodoAcademico: '2026-1', estrato: 3, ingresosHogar: 1000 }));

  const cuerpo = json(await cliente.get(`${RUTA}/${id}`));

  assert.strictEqual(cuerpo.clasificacion, 'datos_incompletos');
  assert.deepStrictEqual(cuerpo.camposFaltantes, ['promedioAcumulado']);
  assert.strictEqual(cuerpo.becaOtorgada, false);
});

// ---------------------------------------------------------------- Reevaluacion

test('completar los datos reevalua: la beca se otorga una sola vez y una solicitud decidida no se reabre', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const { promedioAcumulado, ...incompleta } = ELEGIBLE;
  const { id } = json(await cliente.postJson(RUTA, incompleta));

  const completada = await cliente.postJson(`${RUTA}/${id}/completar`, { promedioAcumulado: 4.5 });

  assert.strictEqual(completada.estado, 200, completada.texto);
  assert.strictEqual(json(completada).clasificacion, 'elegible');
  const [fila] = aplicaciones(app.db);
  assert.strictEqual(fila.clasificacion, 'elegible');
  assert.strictEqual(fila.promedio_acumulado, 4.5);
  assert.strictEqual(fila.decision_automatica, 1);
  assert.deepStrictEqual(JSON.parse(fila.campos_faltantes), []);
  assert.strictEqual(premios(app.db).length, 1);
  assert.strictEqual(premios(app.db)[0].periodo_academico, '2026-1');

  const repetida = await cliente.postJson(`${RUTA}/${id}/completar`, { promedioAcumulado: 1 });
  assert.strictEqual(repetida.estado, 409, repetida.texto);
  assert.strictEqual(json(repetida).codigo, 'SOLICITUD_BECA_DECIDIDA');
  assert.strictEqual(aplicaciones(app.db)[0].promedio_acumulado, 4.5, 'no se sobrescribe');
  assert.strictEqual(premios(app.db).length, 1);
  assert.strictEqual(auditoriaDe(app.db, 'otorgar_beca_automatica').length, 1);
  assert.strictEqual(auditoriaDe(app.db, 'completar_solicitud_beca').length, 1);
});

test('completar con datos que siguen incompletos mantiene datos_incompletos; con datos invalidos da 400', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const { id } = json(await cliente.postJson(RUTA, { periodoAcademico: '2026-1' }));

  const parcial = await cliente.postJson(`${RUTA}/${id}/completar`, { estrato: 3 });
  assert.strictEqual(parcial.estado, 200, parcial.texto);
  assert.deepStrictEqual(json(parcial).camposFaltantes, ['promedioAcumulado', 'ingresosHogar']);
  assert.strictEqual(aplicaciones(app.db)[0].estrato, 3);

  const invalida = await cliente.postJson(`${RUTA}/${id}/completar`, { promedioAcumulado: 9 });
  assert.strictEqual(invalida.estado, 400, invalida.texto);
  assert.strictEqual(aplicaciones(app.db)[0].promedio_acumulado, null);
  assert.strictEqual(premios(app.db).length, 0);
});

test('una solicitud ya clasificada (no_elegible) no se puede reevaluar; una ajena da 404', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const ajeno = await otroEstudiante(app);
  const { id } = json(await cliente.postJson(RUTA, NO_ELEGIBLE));

  const intento = await cliente.postJson(`${RUTA}/${id}/completar`, { promedioAcumulado: 5, estrato: 1, ingresosHogar: 0 });
  const ajena = await ajeno.postJson(`${RUTA}/${id}/completar`, { promedioAcumulado: 5 });

  assert.strictEqual(intento.estado, 409, intento.texto);
  assert.strictEqual(ajena.estado, 404, ajena.texto);
  assert.strictEqual(aplicaciones(app.db)[0].clasificacion, 'no_elegible');
  assert.strictEqual(premios(app.db).length, 0);
});

// ---------------------------------------------------------------- Auditoria y atomicidad

test('auditoria: el estudiante presenta la solicitud y el sistema otorga la beca con el puntaje en el detalle', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const { id } = json(await cliente.postJson(RUTA, ELEGIBLE));

  const [presentada] = auditoriaDe(app.db, 'presentar_solicitud_beca');
  const [otorgada] = auditoriaDe(app.db, 'otorgar_beca_automatica');

  assert.deepStrictEqual(
    [presentada.actor, presentada.rol, presentada.objetivo],
    ['estudiante', 'estudiante', `solicitud_beca:${id}`],
  );
  assert.deepStrictEqual(
    [otorgada.actor, otorgada.rol, otorgada.objetivo],
    ['sistema', 'sistema', `solicitud_beca:${id}`],
  );
  assert.ok(Math.abs(JSON.parse(otorgada.detalle).puntaje - 83.75) < 1e-9);
  assert.strictEqual(JSON.parse(otorgada.detalle).periodoAcademico, '2026-1');
});

test('solicitud, beca y auditoria se confirman juntas: si falla la auditoria de la beca no queda nada', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  app.db.exec(`CREATE TRIGGER forzar_fallo BEFORE INSERT ON audit_log
    WHEN NEW.accion = 'otorgar_beca_automatica'
    BEGIN SELECT RAISE(ABORT, 'fallo forzado'); END`);

  const respuesta = await cliente.postJson(RUTA, ELEGIBLE);

  assert.strictEqual(respuesta.estado, 500, respuesta.texto);
  assert.strictEqual(aplicaciones(app.db).length, 0);
  assert.strictEqual(premios(app.db).length, 0);
  assert.strictEqual(auditoriaDe(app.db, 'presentar_solicitud_beca').length, 0);
});

// ---------------------------------------------------------------- Configuracion

test('una configuracion almacenada invalida da 500 y no se toma ninguna decision', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const invalida = { ...DEFAULT_CONFIGURACION, pesos: { promedio: 0.9, estrato: 0.9, ingresos: 0.9 } };
  app.db
    .prepare('INSERT INTO configuracion_elegibilidad (periodo_academico, configuracion, actualizada_en) VALUES (?, ?, ?)')
    .run('2026-1', JSON.stringify(invalida), '2026-05-04T00:00:00.000Z');

  const respuesta = await cliente.postJson(RUTA, ELEGIBLE);

  assert.strictEqual(respuesta.estado, 500, respuesta.texto);
  assert.deepStrictEqual(json(respuesta), { codigo: 'ERROR_INTERNO' });
  assert.strictEqual(aplicaciones(app.db).length, 0);
  assert.strictEqual(premios(app.db).length, 0);
  // Otro periodo sigue usando el valor por defecto.
  assert.strictEqual((await cliente.postJson(RUTA, { ...ELEGIBLE, periodoAcademico: '2026-2' })).estado, 201);
});

test('un JSON ilegible en la configuracion tambien es un fallo del servidor', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  app.db
    .prepare('INSERT INTO configuracion_elegibilidad (periodo_academico, configuracion, actualizada_en) VALUES (?, ?, ?)')
    .run('2026-1', '{no es json', '2026-05-04T00:00:00.000Z');

  const respuesta = await cliente.postJson(RUTA, ELEGIBLE);

  assert.strictEqual(respuesta.estado, 500, respuesta.texto);
  assert.strictEqual(aplicaciones(app.db).length, 0);
});

test('una configuracion valida almacenada para el periodo reemplaza a la de por defecto', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const estricta = { ...DEFAULT_CONFIGURACION, umbrales: { elegible: 90, limitrofe: 80 } };
  app.db
    .prepare('INSERT INTO configuracion_elegibilidad (periodo_academico, configuracion, actualizada_en) VALUES (?, ?, ?)')
    .run('2026-1', JSON.stringify(estricta), '2026-05-04T00:00:00.000Z');

  const respuesta = await cliente.postJson(RUTA, ELEGIBLE); // 83.75

  assert.strictEqual(respuesta.estado, 201, respuesta.texto);
  assert.strictEqual(aplicaciones(app.db)[0].clasificacion, 'limitrofe');
  assert.strictEqual(premios(app.db).length, 0);
});

test('el promedio se valida contra la escala de la configuracion del periodo', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const escalaCien = { ...DEFAULT_CONFIGURACION, escalas: { ...DEFAULT_CONFIGURACION.escalas, promedioMaximo: 100 } };
  app.db
    .prepare('INSERT INTO configuracion_elegibilidad (periodo_academico, configuracion, actualizada_en) VALUES (?, ?, ?)')
    .run('2026-1', JSON.stringify(escalaCien), '2026-05-04T00:00:00.000Z');

  assert.strictEqual((await cliente.postJson(RUTA, { ...ELEGIBLE, promedioAcumulado: 90 })).estado, 201);
  assert.strictEqual((await cliente.postJson(RUTA, { ...ELEGIBLE, periodoAcademico: '2026-2', promedioAcumulado: 90 })).estado, 400);
});

// ---------------------------------------------------------------- Seguridad

test('sin token CSRF el POST se rechaza con 403 y no guarda nada', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);

  const respuesta = await cliente.postJson(RUTA, ELEGIBLE, { conToken: false });

  assert.strictEqual(respuesta.estado, 403, respuesta.texto);
  assert.strictEqual(json(respuesta).codigo, 'CSRF_INVALIDO');
  assert.strictEqual(aplicaciones(app.db).length, 0);
});

test('sin sesion -> 401; otros roles -> 403 al presentar y al consultar', async (t) => {
  const app = await entorno(t);
  const propietario = await estudiante(app);
  const { id } = json(await propietario.postJson(RUTA, ELEGIBLE));

  const anonimo = await crearCliente(app.base).get(`${RUTA}/${id}`);
  assert.strictEqual(anonimo.estado, 401);

  for (const abrir of [asesor, comite, direccion]) {
    const cliente = await abrir(app);
    assert.strictEqual((await cliente.postJson(RUTA, { ...ELEGIBLE, periodoAcademico: '2027-1' })).estado, 403);
    assert.strictEqual((await cliente.get(`${RUTA}/${id}`)).estado, 403);
    assert.strictEqual((await cliente.postJson(`${RUTA}/${id}/completar`, {})).estado, 403);
  }
  assert.strictEqual(aplicaciones(app.db).length, 1);
});

test('migracion 007: la base impide dos premios por solicitud y origenes desconocidos', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const { id } = json(await cliente.postJson(RUTA, ELEGIBLE));
  const insertar = (origen, aplicacion = id, premio = 'otro') =>
    app.db
      .prepare("INSERT INTO scholarship_awards (id, application_id, estudiante_id, periodo_academico, origen, otorgada_en) VALUES (?, ?, 'x', '2026-1', ?, 'ahora')")
      .run(premio, aplicacion, origen);
  assert.throws(() => insertar('comite'), /UNIQUE/);
  assert.throws(() => insertar('manual', 'otra-solicitud'), /CHECK|FOREIGN/);
  assert.strictEqual(premios(app.db).length, 1);
});
