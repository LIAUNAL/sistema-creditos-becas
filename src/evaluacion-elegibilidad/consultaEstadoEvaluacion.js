'use strict';

/**
 * Story 2.3 (Epic 2: Evaluación de elegibilidad para becas)
 * "Consulta del estado de evaluación por el estudiante"
 *
 * Implementa los dos escenarios de la spec
 * openspec/changes/e2s3-consulta-del-estado-de-evaluacion-por-el-estudia/specs/evaluacion-de-elegibilidad-para-becas/spec.md
 *
 *   1. Consulta de estado -> clasificación actual (`elegible`, `no_elegible`,
 *      `limitrofe en revisión` o `datos_incompletos`).
 *   2. Evaluación `datos_incompletos` -> datos académicos o socioeconómicos
 *      que faltan por registrar.
 *
 * Vista de solo lectura sobre las salidas de `calcularElegibilidad` (Story 2.1)
 * y, opcionalmente, del caso de `crearRevisionComite().obtenerCaso` (Story 2.2).
 * No expone el puntaje numérico interno ni modifica la evaluación.
 */

const { CLASIFICACIONES } = require('./calculoElegibilidad');
const { ESTADOS_CASO } = require('./revisionComite');

const ETIQUETAS_ESTADO = Object.freeze({
  ELEGIBLE: CLASIFICACIONES.ELEGIBLE,
  NO_ELEGIBLE: CLASIFICACIONES.NO_ELEGIBLE,
  LIMITROFE_EN_REVISION: 'limitrofe en revisión',
  DATOS_INCOMPLETOS: CLASIFICACIONES.DATOS_INCOMPLETOS,
});

const CATEGORIAS_DATO = Object.freeze({
  ACADEMICO: 'academico',
  SOCIOECONOMICO: 'socioeconomico',
});

const CATEGORIA_POR_CAMPO = Object.freeze({
  promedioAcumulado: CATEGORIAS_DATO.ACADEMICO,
  estrato: CATEGORIAS_DATO.SOCIOECONOMICO,
  ingresosHogar: CATEGORIAS_DATO.SOCIOECONOMICO,
});

class ErrorEvaluacionNoDisponible extends Error {
  constructor() {
    super('El estudiante no tiene una evaluación de beca en curso');
    this.name = 'ErrorEvaluacionNoDisponible';
    this.codigo = 'EVALUACION_NO_DISPONIBLE';
  }
}

class ErrorEvaluacionAjena extends Error {
  constructor() {
    super('La evaluación no pertenece al estudiante que consulta');
    this.name = 'ErrorEvaluacionAjena';
    this.codigo = 'EVALUACION_AJENA';
  }
}

function describirDatosFaltantes(camposFaltantes = []) {
  return camposFaltantes.map((campo) => ({ campo, categoria: CATEGORIA_POR_CAMPO[campo] }));
}

function ultimaDecision(caso) {
  const decisiones = (caso?.historial ?? []).filter((entrada) => entrada.decision);
  return decisiones[decisiones.length - 1];
}

function etiquetaDe(resultado, caso) {
  if (resultado.clasificacion !== CLASIFICACIONES.LIMITROFE) {
    return resultado.clasificacion;
  }
  return caso && caso.estado !== ESTADOS_CASO.EN_REVISION_COMITE
    ? caso.estado
    : ETIQUETAS_ESTADO.LIMITROFE_EN_REVISION;
}

/**
 * Devuelve al estudiante el estado de su evaluación.
 *
 * @param {object} consulta
 * @param {string} consulta.idEstudiante  estudiante que consulta
 * @param {{idEstudiante:string, resultado:object, caso?:object}} consulta.evaluacion
 *   `resultado`: salida de `calcularElegibilidad`; `caso`: salida de
 *   `obtenerCaso` del comité, si el caso fue enviado a revisión.
 * @returns {{clasificacion:string, datosFaltantes:{campo:string, categoria:string}[],
 *            decisionComite?:string, comentarioComite?:string}}
 * @throws {ErrorEvaluacionNoDisponible|ErrorEvaluacionAjena}
 */
function consultarEstadoEvaluacion({ idEstudiante, evaluacion } = {}) {
  if (!evaluacion || !evaluacion.resultado) {
    throw new ErrorEvaluacionNoDisponible();
  }
  if (evaluacion.idEstudiante !== idEstudiante) {
    throw new ErrorEvaluacionAjena();
  }

  const { resultado, caso } = evaluacion;
  const estado = {
    clasificacion: etiquetaDe(resultado, caso),
    datosFaltantes:
      resultado.clasificacion === CLASIFICACIONES.DATOS_INCOMPLETOS
        ? describirDatosFaltantes(resultado.camposFaltantes)
        : [],
  };

  const decision = resultado.clasificacion === CLASIFICACIONES.LIMITROFE ? ultimaDecision(caso) : undefined;
  if (decision) {
    estado.decisionComite = decision.decision;
    estado.comentarioComite = decision.comentario;
  }

  return estado;
}

module.exports = {
  consultarEstadoEvaluacion,
  ErrorEvaluacionNoDisponible,
  ErrorEvaluacionAjena,
  ETIQUETAS_ESTADO,
  CATEGORIAS_DATO,
};
