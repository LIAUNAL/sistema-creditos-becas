'use strict';

/**
 * Story 1.3 (Epic 1: Solicitud de crédito)
 * "Revisión y decisión del asesor financiero"
 *
 * Extiende el registro (Story 1.1) y el envío (Story 1.2) sin modificarlos.
 *
 *   1. El asesor aprueba una solicitud en `pendiente_revision` -> estado
 *      `aprobada`, se registran asesor y fecha, y se notifica al estudiante.
 *   2. El asesor rechaza sin motivo -> se bloquea la acción y se exige un
 *      motivo; la solicitud no cambia.
 *   3. Solicitud rechazada -> el historial muestra asesor, fecha y motivo.
 *
 * La notificación es un puerto inyectado:
 * `notificador.notificarDecision(notificacion)`.
 */

const { crearRepositorioDecisionesEnMemoria } = require('./repositoriosEnMemoria');

const ESTADO_PENDIENTE_REVISION = 'pendiente_revision';
const ESTADO_APROBADA = 'aprobada';
const ESTADO_RECHAZADA = 'rechazada';

class ErrorMotivoRechazoRequerido extends Error {
  constructor() {
    super('Debe registrar un motivo para rechazar la solicitud');
    this.name = 'ErrorMotivoRechazoRequerido';
    this.codigo = 'MOTIVO_RECHAZO_REQUERIDO';
  }
}

class ErrorAsesorRequerido extends Error {
  constructor() {
    super('Debe indicar el asesor financiero que decide la solicitud');
    this.name = 'ErrorAsesorRequerido';
    this.codigo = 'ASESOR_REQUERIDO';
  }
}

class ErrorSolicitudNoEnRevision extends Error {
  constructor(solicitudId, estado) {
    super(
      estado === undefined
        ? `La solicitud ${solicitudId} no existe`
        : `La solicitud ${solicitudId} está en estado "${estado}"; solo se decide en "${ESTADO_PENDIENTE_REVISION}"`
    );
    this.name = 'ErrorSolicitudNoEnRevision';
    this.codigo = 'SOLICITUD_NO_EN_REVISION';
    this.solicitudId = solicitudId;
    this.estado = estado;
  }
}

class DecisionAsesorFinanciero {
  /**
   * @param {object} dependencias
   * @param {import('./registroSolicitudCredito').RegistroSolicitudCredito} dependencias.registro
   * @param {{ notificarDecision: (notificacion: object) => void }} dependencias.notificador puerto de notificación
   * @param {function(): Date} [dependencias.reloj]
   */
  constructor({ registro, notificador, reloj = () => new Date(), repositorio }) {
    if (!notificador || typeof notificador.notificarDecision !== 'function') {
      throw new TypeError('Se requiere un notificador con notificarDecision');
    }
    this.registro = registro;
    this._notificador = notificador;
    this._reloj = reloj;
    this._repositorio = repositorio ?? crearRepositorioDecisionesEnMemoria();
  }

  _solicitudEnRevision(solicitudId) {
    const solicitud = this.registro.obtener(solicitudId);
    if (!solicitud) throw new ErrorSolicitudNoEnRevision(solicitudId, undefined);
    if (solicitud.estado !== ESTADO_PENDIENTE_REVISION) {
      throw new ErrorSolicitudNoEnRevision(solicitudId, solicitud.estado);
    }
    return solicitud;
  }

  _decidir(solicitud, estado, decision) {
    solicitud.estado = estado;
    this._repositorio.guardarDecision(solicitud.id, decision);
    this._notificador.notificarDecision({
      estudianteId: solicitud.estudianteId,
      solicitudId: solicitud.id,
      estado,
    });
    return { ...solicitud, decision: { ...decision } };
  }

  /**
   * @returns {object} la solicitud en estado `aprobada` con su decisión
   * @throws {ErrorSolicitudNoEnRevision|ErrorAsesorRequerido}
   */
  aprobar(solicitudId, { asesorId } = {}) {
    const solicitud = this._solicitudEnRevision(solicitudId);
    if (!asesorId) throw new ErrorAsesorRequerido();

    return this._decidir(solicitud, ESTADO_APROBADA, {
      tipo: ESTADO_APROBADA,
      asesorId,
      fecha: this._reloj(),
    });
  }

  /**
   * @returns {object} la solicitud en estado `rechazada` con su decisión
   * @throws {ErrorSolicitudNoEnRevision|ErrorAsesorRequerido|ErrorMotivoRechazoRequerido}
   */
  rechazar(solicitudId, { asesorId, motivo } = {}) {
    const solicitud = this._solicitudEnRevision(solicitudId);
    if (!asesorId) throw new ErrorAsesorRequerido();
    if (typeof motivo !== 'string' || motivo.trim() === '') {
      throw new ErrorMotivoRechazoRequerido();
    }

    return this._decidir(solicitud, ESTADO_RECHAZADA, {
      tipo: ESTADO_RECHAZADA,
      asesorId,
      fecha: this._reloj(),
      motivo,
    });
  }

  /**
   * Historial de la decisión: asesor, fecha y, si fue rechazo, el motivo.
   * @returns {{solicitudId: string, estado: string, decision: object}|undefined}
   *   `undefined` si la solicitud aún no tiene decisión.
   */
  consultarHistorial(solicitudId) {
    const decision = this._repositorio.obtenerDecision(solicitudId);
    if (!decision) return undefined;
    return {
      solicitudId,
      estado: this.registro.obtener(solicitudId).estado,
      decision: { ...decision },
    };
  }
}

module.exports = {
  DecisionAsesorFinanciero,
  ErrorMotivoRechazoRequerido,
  ErrorAsesorRequerido,
  ErrorSolicitudNoEnRevision,
  ESTADO_APROBADA,
  ESTADO_RECHAZADA,
};
