'use strict';

/**
 * Story 2.2 (Epic 2: Evaluación de elegibilidad para becas)
 * "Revisión de casos limítrofes por el comité de becas"
 *
 * Implementa los tres escenarios de la spec
 * openspec/changes/e2s2-revision-de-casos-limitrofes-por-el-comite-de-be/specs/evaluacion-de-elegibilidad-para-becas/spec.md
 *
 *   1. Caso `limitrofe` -> entra a la cola del comité y se notifica al comité.
 *   2. Decisión final del comité (`otorgada` o `denegada`) con comentario ->
 *      se actualiza el estado y el comentario queda en el historial.
 *   3. Caso `elegible` o `no_elegible` -> no entra a la cola; decisión automática.
 *
 * Consume el resultado de `calcularElegibilidad` (Story 2.1). La notificación
 * es un puerto inyectado: `notificador.notificarCasoLimitrofe(notificacion)`.
 *
 * Story 5.12: la persistencia de los casos es otro puerto opcional (`repositorio`, ver
 * repositorioCasosComiteEnMemoria.js). Por defecto es en memoria y el comportamiento no cambia.
 */

const { CLASIFICACIONES } = require('./calculoElegibilidad');
const { crearRepositorioCasosComiteEnMemoria } = require('./repositorioCasosComiteEnMemoria');

const DECISIONES = Object.freeze({
  OTORGADA: 'otorgada',
  DENEGADA: 'denegada',
});

const ESTADOS_CASO = Object.freeze({
  EN_REVISION_COMITE: 'en_revision_comite',
  OTORGADA: DECISIONES.OTORGADA,
  DENEGADA: DECISIONES.DENEGADA,
});

const TIPOS_HISTORIAL = Object.freeze({
  INGRESO_COLA: 'ingreso_cola_comite',
  DECISION_COMITE: 'decision_comite',
});

class ErrorDecisionInvalida extends Error {
  constructor(motivo) {
    super(`Decisión del comité inválida: ${motivo}`);
    this.name = 'ErrorDecisionInvalida';
    this.codigo = 'DECISION_INVALIDA';
  }
}

class ErrorCasoNoEnCola extends Error {
  constructor(idCaso) {
    super(`El caso ${idCaso} no está en la cola de revisión del comité`);
    this.name = 'ErrorCasoNoEnCola';
    this.codigo = 'CASO_NO_EN_COLA';
  }
}

function copiarCaso(registro) {
  return { ...registro, historial: registro.historial.map((entrada) => ({ ...entrada })) };
}

/**
 * @param {object} dependencias
 * @param {{notificarCasoLimitrofe: function(object): (void|Promise<void>)}} dependencias.notificador
 * @param {function(): Date} [dependencias.reloj]
 * @param {{guardarCaso: function, obtenerCaso: function, listarPorEstado: function}} [dependencias.repositorio]
 *   Puerto de persistencia de los casos; por defecto, en memoria.
 */
function crearRevisionComite({
  notificador,
  reloj = () => new Date(),
  repositorio = crearRepositorioCasosComiteEnMemoria(),
} = {}) {
  if (!notificador || typeof notificador.notificarCasoLimitrofe !== 'function') {
    throw new TypeError('Se requiere un notificador con notificarCasoLimitrofe');
  }

  /**
   * Aplica el resultado de `calcularElegibilidad` a un caso.
   * @returns {Promise<{idCaso:string, estado:string, enColaComite:boolean, decisionAutomatica:boolean}>}
   */
  async function procesarResultado(caso, resultado) {
    const { clasificacion, decisionAutomatica, puntaje } = resultado;

    if (clasificacion !== CLASIFICACIONES.LIMITROFE) {
      return {
        idCaso: caso.id,
        estado: clasificacion,
        enColaComite: false,
        decisionAutomatica,
      };
    }

    const existente = repositorio.obtenerCaso(caso.id);
    if (existente) {
      return {
        idCaso: caso.id,
        estado: existente.estado,
        enColaComite: existente.estado === ESTADOS_CASO.EN_REVISION_COMITE,
        decisionAutomatica: false,
      };
    }

    repositorio.guardarCaso({
      id: caso.id,
      estudiante: caso.estudiante,
      // Opcional: el puente de la aplicacion informa el periodo de la solicitud para persistirlo.
      ...(caso.periodoAcademico === undefined ? {} : { periodoAcademico: caso.periodoAcademico }),
      puntaje,
      estado: ESTADOS_CASO.EN_REVISION_COMITE,
      historial: [{ tipo: TIPOS_HISTORIAL.INGRESO_COLA, fecha: reloj(), puntaje }],
    });

    await notificador.notificarCasoLimitrofe({ idCaso: caso.id, puntaje });

    return {
      idCaso: caso.id,
      estado: ESTADOS_CASO.EN_REVISION_COMITE,
      enColaComite: true,
      decisionAutomatica: false,
    };
  }

  /**
   * Registra la decisión final del comité sobre un caso de la cola.
   * @throws {ErrorCasoNoEnCola|ErrorDecisionInvalida}
   */
  function registrarDecision(idCaso, { decision, comentario } = {}) {
    const registro = repositorio.obtenerCaso(idCaso);
    if (!registro || registro.estado !== ESTADOS_CASO.EN_REVISION_COMITE) {
      throw new ErrorCasoNoEnCola(idCaso);
    }
    if (!Object.values(DECISIONES).includes(decision)) {
      throw new ErrorDecisionInvalida('la decisión debe ser otorgada o denegada');
    }
    if (typeof comentario !== 'string' || comentario.trim() === '') {
      throw new ErrorDecisionInvalida('el comentario del comité es obligatorio');
    }

    registro.estado = decision;
    registro.historial.push({
      tipo: TIPOS_HISTORIAL.DECISION_COMITE,
      fecha: reloj(),
      decision,
      comentario,
    });
    return copiarCaso(registro);
  }

  function listarCola() {
    return repositorio.listarPorEstado(ESTADOS_CASO.EN_REVISION_COMITE).map(copiarCaso);
  }

  function obtenerCaso(idCaso) {
    const registro = repositorio.obtenerCaso(idCaso);
    return registro ? copiarCaso(registro) : undefined;
  }

  return { procesarResultado, registrarDecision, listarCola, obtenerCaso };
}

module.exports = {
  crearRevisionComite,
  ErrorDecisionInvalida,
  ErrorCasoNoEnCola,
  ESTADOS_CASO,
  DECISIONES,
  TIPOS_HISTORIAL,
};
