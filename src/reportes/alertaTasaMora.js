'use strict';

/**
 * Story 4.2 (Epic 4: Reportes para dirección académica)
 * "Alerta de tasa de mora sobre el umbral definido"
 *
 * Implementa los dos escenarios de la spec
 * openspec/changes/e4s2-alerta-de-tasa-de-mora-sobre-el-umbral-definido/specs/reportes-para-direccion-academica/spec.md
 *
 *   1. Tasa de mora del periodo por encima del umbral -> alerta con periodo,
 *      tasa calculada y umbral configurado.
 *   2. Tasa de mora por debajo del umbral -> ninguna alerta.
 *
 * Nota técnica de la story: la tasa de mora es la cantidad de desembolsos
 * `vencido` sobre el total de desembolsos `programado` + `ejecutado` +
 * `vencido` del periodo. El módulo recibe los datos como objetos simples y no
 * importa otras capacidades.
 */

const ESTADO_DESEMBOLSO_VENCIDO = 'vencido';
const ESTADOS_DESEMBOLSO_CONSIDERADOS = ['programado', 'ejecutado', ESTADO_DESEMBOLSO_VENCIDO];

/**
 * Calcula la tasa de mora de un periodo (fracción entre 0 y 1).
 * Sin desembolsos considerados en el periodo la tasa es 0.
 *
 * @param {string} periodoAcademico
 * @param {object} [datos]
 * @param {object[]} [datos.desembolsos] `{ periodoAcademico, estado }`
 * @returns {number}
 */
function calcularTasaMora(periodoAcademico, datos = {}) {
  const { desembolsos = [] } = datos;

  const considerados = desembolsos.filter(
    (desembolso) =>
      desembolso.periodoAcademico === periodoAcademico &&
      ESTADOS_DESEMBOLSO_CONSIDERADOS.includes(desembolso.estado)
  );
  if (considerados.length === 0) {
    return 0;
  }

  const vencidos = considerados.filter((desembolso) => desembolso.estado === ESTADO_DESEMBOLSO_VENCIDO);
  return vencidos.length / considerados.length;
}

/**
 * Recalcula la tasa de mora del periodo y genera una alerta solo si supera
 * estrictamente el umbral configurado.
 *
 * @param {string} periodoAcademico
 * @param {number} umbral fracción entre 0 y 1 (p. ej. 0.1 = 10 %)
 * @param {object} [datos] ver `calcularTasaMora`
 * @returns {{periodoAcademico:string, tasaMora:number, umbral:number}|null}
 */
function generarAlertaTasaMora(periodoAcademico, umbral, datos = {}) {
  if (typeof umbral !== 'number' || !Number.isFinite(umbral)) {
    throw new TypeError('El umbral de mora debe ser un número finito');
  }

  const tasaMora = calcularTasaMora(periodoAcademico, datos);
  if (tasaMora <= umbral) {
    return null;
  }

  return { periodoAcademico, tasaMora, umbral };
}

module.exports = {
  generarAlertaTasaMora,
  calcularTasaMora,
  ESTADO_DESEMBOLSO_VENCIDO,
};
