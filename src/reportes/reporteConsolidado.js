'use strict';

/**
 * Story 4.1 (Epic 4: Reportes para dirección académica)
 * "Reporte consolidado de créditos y becas por periodo"
 *
 * Implementa los dos escenarios de la spec
 * openspec/changes/e4s1-reporte-consolidado-de-creditos-y-becas-por-peri/specs/reportes-para-direccion-academica/spec.md
 *
 *   1. Periodo con créditos aprobados y becas otorgadas -> total de créditos
 *      aprobados, total de becas otorgadas y monto total desembolsado.
 *   2. Periodo sin ninguna solicitud -> reporte con todos los totales en
 *      cero, sin error.
 *
 * Nota técnica de la story: el reporte se calcula sobre datos consolidados
 * de las Epic 1, 2 y 3 (sin tabla de resumen). El módulo recibe esos datos
 * como objetos simples y no importa otras capacidades.
 */

const ESTADO_SOLICITUD_APROBADA = 'aprobada';
const ESTADO_BECA_OTORGADA = 'otorgada';
const ESTADO_DESEMBOLSO_EFECTUADO = 'desembolsado';

function aCentavos(monto) {
  return typeof monto === 'number' && Number.isFinite(monto) ? Math.round(monto * 100) : 0;
}

/**
 * Genera el reporte consolidado de un periodo académico.
 *
 * Los totales se cuentan por `periodoAcademico`. Un desembolso pertenece al
 * periodo de la solicitud a la que referencia (`solicitudId`).
 *
 * @param {string} periodoAcademico
 * @param {object} [datos]
 * @param {object[]} [datos.solicitudes] `{ id, periodoAcademico, estado }`
 * @param {object[]} [datos.becas] `{ periodoAcademico, estado }`
 * @param {object[]} [datos.desembolsos] `{ solicitudId, monto, estado }`
 * @returns {{periodoAcademico:string, totalCreditosAprobados:number, totalBecasOtorgadas:number, montoTotalDesembolsado:number}}
 */
function generarReporteConsolidado(periodoAcademico, datos = {}) {
  const { solicitudes = [], becas = [], desembolsos = [] } = datos;

  const solicitudesDelPeriodo = solicitudes.filter(
    (solicitud) => solicitud.periodoAcademico === periodoAcademico
  );
  const idsDelPeriodo = new Set(solicitudesDelPeriodo.map((solicitud) => solicitud.id));

  const totalCreditosAprobados = solicitudesDelPeriodo.filter(
    (solicitud) => solicitud.estado === ESTADO_SOLICITUD_APROBADA
  ).length;

  const totalBecasOtorgadas = becas.filter(
    (beca) => beca.periodoAcademico === periodoAcademico && beca.estado === ESTADO_BECA_OTORGADA
  ).length;

  const centavosDesembolsados = desembolsos
    .filter(
      (desembolso) =>
        desembolso.estado === ESTADO_DESEMBOLSO_EFECTUADO && idsDelPeriodo.has(desembolso.solicitudId)
    )
    .reduce((acumulado, desembolso) => acumulado + aCentavos(desembolso.monto), 0);

  return {
    periodoAcademico,
    totalCreditosAprobados,
    totalBecasOtorgadas,
    montoTotalDesembolsado: centavosDesembolsados / 100,
  };
}

module.exports = {
  generarReporteConsolidado,
  ESTADO_DESEMBOLSO_EFECTUADO,
};
