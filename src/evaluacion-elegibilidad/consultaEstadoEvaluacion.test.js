'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { calcularElegibilidad } = require('./calculoElegibilidad');
const { crearRevisionComite } = require('./revisionComite');
const {
  consultarEstadoEvaluacion,
  ErrorEvaluacionNoDisponible,
  ErrorEvaluacionAjena,
  ETIQUETAS_ESTADO,
  CATEGORIAS_DATO,
} = require('./consultaEstadoEvaluacion');

const configuracion = {
  pesos: { promedio: 0.5, estrato: 0.25, ingresos: 0.25 },
  escalas: { promedioMaximo: 5, estratoMaximo: 6, ingresosReferencia: 10_000_000 },
  umbrales: { elegible: 70, limitrofe: 50 },
};

function evaluar(estudiante) {
  return calcularElegibilidad(estudiante, configuracion);
}

const estudianteElegible = { promedioAcumulado: 5, estrato: 1, ingresosHogar: 0 };
const estudianteNoElegible = { promedioAcumulado: 0, estrato: 6, ingresosHogar: 10_000_000 };
// 100 * (0.5*0.6 + 0.25*0.8 + 0.25*0.6) = 65 -> limitrofe
const estudianteLimitrofe = { promedioAcumulado: 3, estrato: 2.0, ingresosHogar: 4_000_000 };

function crearComite() {
  return crearRevisionComite({ notificador: { notificarCasoLimitrofe() {} } });
}

// Scenario: Consulta su estado
test('Consulta su estado: muestra `elegible` para una evaluación elegible', () => {
  const resultado = evaluar(estudianteElegible);
  assert.equal(resultado.clasificacion, 'elegible');

  const estado = consultarEstadoEvaluacion({ idEstudiante: 'e1', evaluacion: { idEstudiante: 'e1', resultado } });

  assert.equal(estado.clasificacion, 'elegible');
  assert.deepEqual(estado.datosFaltantes, []);
});

test('Consulta su estado: muestra `no_elegible` para una evaluación no elegible', () => {
  const resultado = evaluar(estudianteNoElegible);
  const estado = consultarEstadoEvaluacion({ idEstudiante: 'e1', evaluacion: { idEstudiante: 'e1', resultado } });

  assert.equal(estado.clasificacion, 'no_elegible');
});

test('Consulta su estado: muestra `limitrofe en revisión` para un caso en cola del comité', async () => {
  const resultado = evaluar(estudianteLimitrofe);
  assert.equal(resultado.clasificacion, 'limitrofe');
  const comite = crearComite();
  await comite.procesarResultado({ id: 'c1', estudiante: 'e1' }, resultado);

  const estado = consultarEstadoEvaluacion({
    idEstudiante: 'e1',
    evaluacion: { idEstudiante: 'e1', resultado, caso: comite.obtenerCaso('c1') },
  });

  assert.equal(estado.clasificacion, 'limitrofe en revisión');
  assert.equal(estado.clasificacion, ETIQUETAS_ESTADO.LIMITROFE_EN_REVISION);
});

test('Consulta su estado: un resultado `limitrofe` sin registro de comité se muestra `limitrofe en revisión`', () => {
  const resultado = evaluar(estudianteLimitrofe);
  const estado = consultarEstadoEvaluacion({ idEstudiante: 'e1', evaluacion: { idEstudiante: 'e1', resultado } });

  assert.equal(estado.clasificacion, 'limitrofe en revisión');
});

test('Consulta su estado: muestra `datos_incompletos` cuando falta información', () => {
  const resultado = evaluar({ estrato: 2, ingresosHogar: 1_000_000 });
  const estado = consultarEstadoEvaluacion({ idEstudiante: 'e1', evaluacion: { idEstudiante: 'e1', resultado } });

  assert.equal(estado.clasificacion, 'datos_incompletos');
});

test('Consulta su estado: tras la decisión del comité muestra `otorgada` o `denegada` con el comentario', async () => {
  const resultado = evaluar(estudianteLimitrofe);
  const comite = crearComite();
  await comite.procesarResultado({ id: 'c1', estudiante: 'e1' }, resultado);
  comite.registrarDecision('c1', { decision: 'otorgada', comentario: 'Mérito académico' });

  const estado = consultarEstadoEvaluacion({
    idEstudiante: 'e1',
    evaluacion: { idEstudiante: 'e1', resultado, caso: comite.obtenerCaso('c1') },
  });

  assert.equal(estado.clasificacion, 'otorgada');
  assert.equal(estado.decisionComite, 'otorgada');
  assert.equal(estado.comentarioComite, 'Mérito académico');
});

test('Consulta su estado: no expone el puntaje numérico interno', () => {
  const resultado = evaluar(estudianteElegible);
  const estado = consultarEstadoEvaluacion({ idEstudiante: 'e1', evaluacion: { idEstudiante: 'e1', resultado } });

  assert.equal('puntaje' in estado, false);
  assert.equal(JSON.stringify(estado).includes(String(resultado.puntaje)), false);
});

test('Consulta su estado: es de solo lectura y no muta la evaluación', () => {
  const resultado = Object.freeze({ ...evaluar({ estrato: 2 }), camposFaltantes: Object.freeze(['promedioAcumulado', 'ingresosHogar']) });
  const evaluacion = Object.freeze({ idEstudiante: 'e1', resultado });
  const copia = JSON.stringify(evaluacion);

  consultarEstadoEvaluacion({ idEstudiante: 'e1', evaluacion });

  assert.equal(JSON.stringify(evaluacion), copia);
});

// Scenario: El estudiante consulta su estado
test('El estudiante consulta su estado: indica los datos académicos y socioeconómicos faltantes', () => {
  const resultado = evaluar({});
  const estado = consultarEstadoEvaluacion({ idEstudiante: 'e1', evaluacion: { idEstudiante: 'e1', resultado } });

  assert.equal(estado.clasificacion, 'datos_incompletos');
  assert.deepEqual(estado.datosFaltantes, [
    { campo: 'promedioAcumulado', categoria: CATEGORIAS_DATO.ACADEMICO },
    { campo: 'estrato', categoria: CATEGORIAS_DATO.SOCIOECONOMICO },
    { campo: 'ingresosHogar', categoria: CATEGORIAS_DATO.SOCIOECONOMICO },
  ]);
});

test('El estudiante consulta su estado: lista solo el dato que falta', () => {
  const resultado = evaluar({ estrato: 3, ingresosHogar: 2_000_000 });
  const estado = consultarEstadoEvaluacion({ idEstudiante: 'e1', evaluacion: { idEstudiante: 'e1', resultado } });

  assert.deepEqual(estado.datosFaltantes, [
    { campo: 'promedioAcumulado', categoria: 'academico' },
  ]);
});

// Casos de borde del acceso
test('rechaza una evaluación que pertenece a otro estudiante', () => {
  const resultado = evaluar(estudianteElegible);
  assert.throws(
    () => consultarEstadoEvaluacion({ idEstudiante: 'e2', evaluacion: { idEstudiante: 'e1', resultado } }),
    ErrorEvaluacionAjena
  );
});

test('informa cuando el estudiante no tiene evaluación', () => {
  assert.throws(() => consultarEstadoEvaluacion({ idEstudiante: 'e1' }), ErrorEvaluacionNoDisponible);
  assert.throws(
    () => consultarEstadoEvaluacion({ idEstudiante: 'e1', evaluacion: { idEstudiante: 'e1' } }),
    ErrorEvaluacionNoDisponible
  );
});
