'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { calcularElegibilidad } = require('./calculoElegibilidad');
const {
  crearRevisionComite,
  ErrorDecisionInvalida,
  ErrorCasoNoEnCola,
  ESTADOS_CASO,
  DECISIONES,
} = require('./revisionComite');

const configuracion = {
  pesos: { promedio: 0.5, estrato: 0.25, ingresos: 0.25 },
  escalas: { promedioMaximo: 5, estratoMaximo: 6, ingresosReferencia: 4000000 },
  umbrales: { elegible: 70, limitrofe: 50 },
};

// Puntajes: 88.75 (elegible), 57.5 (limitrofe), 0 (no_elegible)
const ESTUDIANTES = {
  elegible: { promedioAcumulado: 4.5, estrato: 1, ingresosHogar: 1000000 },
  limitrofe: { promedioAcumulado: 3.5, estrato: 4, ingresosHogar: 2000000 },
  noElegible: { promedioAcumulado: 0, estrato: 6, ingresosHogar: 4000000 },
};

function caso(id, estudiante) {
  return { id, estudiante };
}

function crearNotificadorEspia() {
  const llamadas = [];
  return {
    llamadas,
    async notificarCasoLimitrofe(notificacion) {
      llamadas.push(notificacion);
    },
  };
}

function crearRevision(overrides = {}) {
  const notificador = crearNotificadorEspia();
  const revision = crearRevisionComite({
    notificador,
    reloj: () => new Date('2026-10-01T10:00:00.000Z'),
    ...overrides,
  });
  return { revision, notificador };
}

test('Criterio 1: un caso limitrofe entra a la cola del comité y el comité es notificado', async () => {
  const { revision, notificador } = crearRevision();
  const resultado = calcularElegibilidad(ESTUDIANTES.limitrofe, configuracion);
  assert.equal(resultado.clasificacion, 'limitrofe');

  const salida = await revision.procesarResultado(caso('C-1', ESTUDIANTES.limitrofe), resultado);

  assert.equal(salida.enColaComite, true);
  assert.equal(salida.estado, ESTADOS_CASO.EN_REVISION_COMITE);
  assert.deepEqual(
    revision.listarCola().map((c) => c.id),
    ['C-1']
  );
  assert.equal(notificador.llamadas.length, 1);
  assert.equal(notificador.llamadas[0].idCaso, 'C-1');
  assert.equal(notificador.llamadas[0].puntaje, resultado.puntaje);
});

test('Criterio 1: no duplica en la cola ni vuelve a notificar un caso ya encolado', async () => {
  const { revision, notificador } = crearRevision();
  const resultado = calcularElegibilidad(ESTUDIANTES.limitrofe, configuracion);

  await revision.procesarResultado(caso('C-1', ESTUDIANTES.limitrofe), resultado);
  await revision.procesarResultado(caso('C-1', ESTUDIANTES.limitrofe), resultado);

  assert.equal(revision.listarCola().length, 1);
  assert.equal(notificador.llamadas.length, 1);
});

test('Criterio 2: la decisión del comité actualiza el estado y conserva el comentario en el historial', async () => {
  const { revision } = crearRevision();
  const resultado = calcularElegibilidad(ESTUDIANTES.limitrofe, configuracion);
  await revision.procesarResultado(caso('C-1', ESTUDIANTES.limitrofe), resultado);

  const actualizado = revision.registrarDecision('C-1', {
    decision: DECISIONES.OTORGADA,
    comentario: 'Situación familiar justifica la beca',
  });

  assert.equal(actualizado.estado, 'otorgada');
  assert.equal(revision.obtenerCaso('C-1').estado, 'otorgada');
  const ultimo = actualizado.historial[actualizado.historial.length - 1];
  assert.equal(ultimo.tipo, 'decision_comite');
  assert.equal(ultimo.decision, 'otorgada');
  assert.equal(ultimo.comentario, 'Situación familiar justifica la beca');
  assert.equal(ultimo.fecha.toISOString(), '2026-10-01T10:00:00.000Z');
  assert.deepEqual(revision.listarCola(), []);
});

test('Criterio 2: una decisión denegada también actualiza el estado', async () => {
  const { revision } = crearRevision();
  await revision.procesarResultado(
    caso('C-1', ESTUDIANTES.limitrofe),
    calcularElegibilidad(ESTUDIANTES.limitrofe, configuracion)
  );

  const actualizado = revision.registrarDecision('C-1', {
    decision: 'denegada',
    comentario: 'No cumple requisitos adicionales',
  });

  assert.equal(actualizado.estado, 'denegada');
});

test('Criterio 2: rechaza decisiones inválidas o sin comentario y deja el caso en la cola', async () => {
  const { revision } = crearRevision();
  await revision.procesarResultado(
    caso('C-1', ESTUDIANTES.limitrofe),
    calcularElegibilidad(ESTUDIANTES.limitrofe, configuracion)
  );

  assert.throws(
    () => revision.registrarDecision('C-1', { decision: 'quizas', comentario: 'x' }),
    ErrorDecisionInvalida
  );
  assert.throws(
    () => revision.registrarDecision('C-1', { decision: 'otorgada', comentario: '  ' }),
    ErrorDecisionInvalida
  );
  assert.equal(revision.obtenerCaso('C-1').estado, ESTADOS_CASO.EN_REVISION_COMITE);
  assert.equal(revision.listarCola().length, 1);
});

test('Criterio 2: rechaza decisión sobre un caso que no está en la cola', async () => {
  const { revision } = crearRevision();

  assert.throws(
    () => revision.registrarDecision('NO-EXISTE', { decision: 'otorgada', comentario: 'x' }),
    ErrorCasoNoEnCola
  );
});

test('Criterio 3: un caso elegible o no_elegible no entra a la cola y la decisión queda automática', async () => {
  const { revision, notificador } = crearRevision();

  const salidaElegible = await revision.procesarResultado(
    caso('C-2', ESTUDIANTES.elegible),
    calcularElegibilidad(ESTUDIANTES.elegible, configuracion)
  );
  const salidaNoElegible = await revision.procesarResultado(
    caso('C-3', ESTUDIANTES.noElegible),
    calcularElegibilidad(ESTUDIANTES.noElegible, configuracion)
  );

  assert.equal(salidaElegible.enColaComite, false);
  assert.equal(salidaElegible.decisionAutomatica, true);
  assert.equal(salidaElegible.estado, 'elegible');
  assert.equal(salidaNoElegible.enColaComite, false);
  assert.equal(salidaNoElegible.decisionAutomatica, true);
  assert.equal(salidaNoElegible.estado, 'no_elegible');
  assert.deepEqual(revision.listarCola(), []);
  assert.equal(notificador.llamadas.length, 0);
});

test('Criterio 3: un caso con datos incompletos no entra a la cola ni genera decisión automática', async () => {
  const { revision, notificador } = crearRevision();
  const incompleto = { estrato: 2, ingresosHogar: 1000000 };

  const salida = await revision.procesarResultado(
    caso('C-4', incompleto),
    calcularElegibilidad(incompleto, configuracion)
  );

  assert.equal(salida.enColaComite, false);
  assert.equal(salida.decisionAutomatica, false);
  assert.deepEqual(revision.listarCola(), []);
  assert.equal(notificador.llamadas.length, 0);
});

test('requiere un notificador inyectado', () => {
  assert.throws(() => crearRevisionComite({}), TypeError);
});
