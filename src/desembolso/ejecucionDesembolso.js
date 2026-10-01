'use strict';

const { ESTADO_DESEMBOLSO_PROGRAMADO } = require('./calendarioDesembolso');

/**
 * Story 3.2 (Epic 3: Desembolso y seguimiento)
 * "Notificación de desembolso al estudiante"
 *
 * Implementa los dos escenarios de la spec
 * openspec/changes/e3s2-notificacion-de-desembolso-al-estudiante/specs/desembolso-y-seguimiento/spec.md
 *
 *   1. Desembolso `programado` cuya fecha se ejecuta -> pasa a `ejecutado`
 *      y se notifica al estudiante con fecha y monto.
 *   2. Desembolso `ejecutado` -> el historial lo muestra con su fecha de
 *      ejecución y estado.
 *
 * Opera sobre los desembolsos que produce `CalendarioDesembolso` (Story 3.1).
 * La notificación es un puerto inyectado:
 * `notificador.notificarDesembolso({ solicitudId, desembolsoId, numeroCuota, fecha, monto })`,
 * que puede ser síncrono o asíncrono.
 */

const ESTADO_DESEMBOLSO_EJECUTADO = 'ejecutado';

class ErrorEjecucionDesembolso extends Error {
  constructor(codigo, motivo, desembolsoId) {
    super(`No se pudo ejecutar el desembolso: ${motivo}`);
    this.name = 'ErrorEjecucionDesembolso';
    this.codigo = codigo;
    this.desembolsoId = desembolsoId;
  }
}

/**
 * @param {object} dependencias
 * @param {{notificarDesembolso: function(object): (void|Promise<void>)}} dependencias.notificador
 * @param {function(): Date} [dependencias.reloj] fuente de la fecha de ejecución
 */
function crearEjecucionDesembolso({ notificador, reloj = () => new Date() } = {}) {
  if (!notificador || typeof notificador.notificarDesembolso !== 'function') {
    throw new TypeError('Se requiere un notificador con notificarDesembolso');
  }

  /**
   * Ejecuta un desembolso programado: lo marca `ejecutado` (mutando el
   * objeto del calendario) y notifica al estudiante con fecha y monto.
   * El estado se cambia antes de notificar: si la notificación falla el
   * error se propaga, pero el desembolso no vuelve a `programado`.
   *
   * @throws {ErrorEjecucionDesembolso} si el desembolso no está `programado`
   */
  async function ejecutar(desembolso) {
    if (desembolso?.estado !== ESTADO_DESEMBOLSO_PROGRAMADO) {
      throw new ErrorEjecucionDesembolso(
        'DESEMBOLSO_NO_PROGRAMADO',
        `el desembolso no está programado (estado "${desembolso?.estado}")`,
        desembolso?.id
      );
    }

    desembolso.estado = ESTADO_DESEMBOLSO_EJECUTADO;
    desembolso.fechaEjecucion = reloj().toISOString().slice(0, 10);

    await notificador.notificarDesembolso({
      solicitudId: desembolso.solicitudId,
      desembolsoId: desembolso.id,
      numeroCuota: desembolso.numeroCuota,
      fecha: desembolso.fechaEjecucion,
      monto: desembolso.monto,
    });

    return desembolso;
  }

  /** Vista del historial: fecha de ejecución y estado (`null` si aún no se ejecuta). */
  function consultarHistorial(desembolsos) {
    return desembolsos.map(({ id, numeroCuota, monto, estado, fechaEjecucion }) => ({
      id,
      numeroCuota,
      monto,
      estado,
      fechaEjecucion: fechaEjecucion ?? null,
    }));
  }

  return { ejecutar, consultarHistorial };
}

module.exports = {
  crearEjecucionDesembolso,
  ErrorEjecucionDesembolso,
  ESTADO_DESEMBOLSO_EJECUTADO,
};
