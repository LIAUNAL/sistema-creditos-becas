'use strict';

const { ESTADO_DESEMBOLSO_PROGRAMADO } = require('./calendarioDesembolso');

/**
 * Story 3.3 (Epic 3: Desembolso y seguimiento)
 * "Marcado de desembolso vencido"
 *
 * Implementa los dos escenarios de la spec
 * openspec/changes/e3s3-marcado-de-desembolso-vencido/specs/desembolso-y-seguimiento/spec.md
 *
 *   1. Desembolso `programado` cuya fecha programada más el plazo de
 *      confirmación ya pasó sin confirmación -> pasa a `vencido` y se
 *      incluye en el conteo de mora del periodo.
 *   2. Desembolso confirmado (`ejecutado`) dentro del plazo -> permanece
 *      `ejecutado`.
 *
 * Opera sobre los desembolsos de `CalendarioDesembolso` (Story 3.1),
 * mutándolos como lo hace la Story 3.2. El plazo de confirmación es
 * configurable por tipo de crédito (`desembolso.tipoCredito`); por defecto
 * 15 días. "Hoy" viene del reloj inyectado.
 *
 * El periodo académico se lee de `desembolso.periodoAcademico` (o de
 * `opciones.periodoAcademico` al revisar, que se asigna al desembolso si
 * falta). Así los desembolsos conservan la forma `{ periodoAcademico, estado }`
 * que consume `calcularTasaMora` (Story 4.2).
 */

const ESTADO_DESEMBOLSO_VENCIDO = 'vencido';
const PLAZO_CONFIRMACION_DIAS_POR_DEFECTO = 15;

const FORMATO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Día UTC (número de días desde epoch) de una fecha ISO `YYYY-MM-DD`, o `undefined`. */
function diaDeFechaIso(texto) {
  const coincidencia = typeof texto === 'string' ? FORMATO_FECHA.exec(texto) : null;
  if (!coincidencia) return undefined;
  const [, anio, mes, dia] = coincidencia.map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  const valida =
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
  return valida ? fecha.getTime() / MS_POR_DIA : undefined;
}

/**
 * @param {object} [dependencias]
 * @param {function(): Date} [dependencias.reloj] fuente de "hoy"
 * @param {number} [dependencias.plazoConfirmacionDias] plazo por defecto
 * @param {Object<string, number>} [dependencias.plazosPorTipoCredito] plazo en días por `tipoCredito`
 */
function crearRevisionVencimientos({
  reloj = () => new Date(),
  plazoConfirmacionDias = PLAZO_CONFIRMACION_DIAS_POR_DEFECTO,
  plazosPorTipoCredito = {},
} = {}) {
  function plazoDe(desembolso) {
    return plazosPorTipoCredito[desembolso.tipoCredito] ?? plazoConfirmacionDias;
  }

  function estaVencido(desembolso, hoy) {
    if (desembolso?.estado !== ESTADO_DESEMBOLSO_PROGRAMADO) return false;
    const programado = diaDeFechaIso(desembolso.fecha);
    if (programado === undefined) return false;
    return hoy > programado + plazoDe(desembolso);
  }

  /** Conteo de desembolsos `vencido` por periodo académico (los sin periodo se omiten). */
  function contarMoraPorPeriodo(desembolsos, periodoAcademico) {
    const vencidos = desembolsos.filter(
      (desembolso) => desembolso.estado === ESTADO_DESEMBOLSO_VENCIDO && desembolso.periodoAcademico
    );
    if (periodoAcademico !== undefined) {
      return vencidos.filter((desembolso) => desembolso.periodoAcademico === periodoAcademico).length;
    }
    const conteo = {};
    for (const { periodoAcademico: periodo } of vencidos) {
      conteo[periodo] = (conteo[periodo] ?? 0) + 1;
    }
    return conteo;
  }

  /**
   * Revisión periódica: marca `vencido` (mutando el objeto) todo desembolso
   * `programado` cuya fecha + plazo ya pasó. Idempotente.
   *
   * @param {object[]} desembolsos
   * @param {object} [opciones]
   * @param {string} [opciones.periodoAcademico] periodo para los desembolsos que no lo traen
   * @returns {{marcados: object[], moraPorPeriodo: Object<string, number>}}
   */
  function revisar(desembolsos, opciones = {}) {
    const hoy = diaDeFechaIso(reloj().toISOString().slice(0, 10));
    const marcados = [];

    for (const desembolso of desembolsos) {
      if (!estaVencido(desembolso, hoy)) continue;
      desembolso.estado = ESTADO_DESEMBOLSO_VENCIDO;
      if (!desembolso.periodoAcademico && opciones.periodoAcademico) {
        desembolso.periodoAcademico = opciones.periodoAcademico;
      }
      marcados.push(desembolso);
    }

    return { marcados, moraPorPeriodo: contarMoraPorPeriodo(desembolsos) };
  }

  return { revisar, contarMoraPorPeriodo };
}

module.exports = {
  crearRevisionVencimientos,
  ESTADO_DESEMBOLSO_VENCIDO,
  PLAZO_CONFIRMACION_DIAS_POR_DEFECTO,
};
