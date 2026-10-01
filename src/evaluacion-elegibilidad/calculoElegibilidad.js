'use strict';

/**
 * Story 2.1 (Epic 2: Evaluación de elegibilidad para becas)
 * "Cálculo de puntaje de elegibilidad de beca"
 *
 * Implementa los dos escenarios de la spec
 * openspec/changes/e2s1-calculo-de-puntaje-de-elegibilidad-de-beca/specs/evaluacion-de-elegibilidad-para-becas/spec.md
 *
 *   1. Promedio acumulado, estrato e ingresos registrados -> puntaje numérico
 *      y clasificación `elegible`, `no_elegible` o `limitrofe` según los
 *      umbrales configurados.
 *   2. Sin promedio académico -> `datos_incompletos`, sin decisión automática.
 *
 * Los pesos, las escalas de normalización y los umbrales son entradas
 * (`configuracion`); ninguno está fijado en la lógica.
 */

const CAMPOS_REQUERIDOS = ['promedioAcumulado', 'estrato', 'ingresosHogar'];

const CLASIFICACIONES = Object.freeze({
  ELEGIBLE: 'elegible',
  NO_ELEGIBLE: 'no_elegible',
  LIMITROFE: 'limitrofe',
  DATOS_INCOMPLETOS: 'datos_incompletos',
});

const TOLERANCIA_PESOS = 1e-9;

class ErrorConfiguracionInvalida extends Error {
  constructor(motivo) {
    super(`Configuración de elegibilidad inválida: ${motivo}`);
    this.name = 'ErrorConfiguracionInvalida';
    this.codigo = 'CONFIGURACION_INVALIDA';
  }
}

function esVacio(valor) {
  return valor === undefined || valor === null || valor === '';
}

function esNumeroFinito(valor) {
  return typeof valor === 'number' && Number.isFinite(valor);
}

function acotar01(valor) {
  return Math.min(1, Math.max(0, valor));
}

function validarConfiguracion(configuracion) {
  const { pesos, escalas, umbrales } = configuracion ?? {};

  if (!pesos || !escalas || !umbrales) {
    throw new ErrorConfiguracionInvalida('se requieren pesos, escalas y umbrales');
  }

  const valoresPesos = [pesos.promedio, pesos.estrato, pesos.ingresos];
  if (!valoresPesos.every((p) => esNumeroFinito(p) && p >= 0)) {
    throw new ErrorConfiguracionInvalida('los pesos deben ser números no negativos');
  }
  const sumaPesos = valoresPesos.reduce((a, b) => a + b, 0);
  if (Math.abs(sumaPesos - 1) > TOLERANCIA_PESOS) {
    throw new ErrorConfiguracionInvalida('los pesos deben sumar 1');
  }

  const { promedioMaximo, estratoMaximo, ingresosReferencia } = escalas;
  if (!esNumeroFinito(promedioMaximo) || promedioMaximo <= 0) {
    throw new ErrorConfiguracionInvalida('promedioMaximo debe ser un número positivo');
  }
  if (!esNumeroFinito(estratoMaximo) || estratoMaximo <= 1) {
    throw new ErrorConfiguracionInvalida('estratoMaximo debe ser un número mayor que 1');
  }
  if (!esNumeroFinito(ingresosReferencia) || ingresosReferencia <= 0) {
    throw new ErrorConfiguracionInvalida('ingresosReferencia debe ser un número positivo');
  }

  if (!esNumeroFinito(umbrales.elegible) || !esNumeroFinito(umbrales.limitrofe)) {
    throw new ErrorConfiguracionInvalida('los umbrales deben ser números');
  }
  if (umbrales.limitrofe > umbrales.elegible) {
    throw new ErrorConfiguracionInvalida('el umbral limitrofe no puede superar al elegible');
  }
}

function clasificar(puntaje, umbrales) {
  if (puntaje >= umbrales.elegible) return CLASIFICACIONES.ELEGIBLE;
  if (puntaje >= umbrales.limitrofe) return CLASIFICACIONES.LIMITROFE;
  return CLASIFICACIONES.NO_ELEGIBLE;
}

/**
 * Calcula el puntaje (0-100) y la clasificación de elegibilidad de beca.
 *
 * Cada componente se normaliza a [0, 1] y se pondera:
 *   promedio : promedioAcumulado / promedioMaximo           (mayor es mejor)
 *   estrato  : (estratoMaximo - estrato) / (estratoMaximo - 1)  (menor estrato es mejor)
 *   ingresos : 1 - ingresosHogar / ingresosReferencia       (menores ingresos es mejor)
 *
 * @param {object} estudiante
 * @param {number} estudiante.promedioAcumulado
 * @param {number} estudiante.estrato
 * @param {number} estudiante.ingresosHogar
 * @param {object} configuracion
 * @param {{promedio:number, estrato:number, ingresos:number}} configuracion.pesos  suman 1
 * @param {{promedioMaximo:number, estratoMaximo:number, ingresosReferencia:number}} configuracion.escalas
 * @param {{elegible:number, limitrofe:number}} configuracion.umbrales
 * @returns {{puntaje:number|null, clasificacion:string, decisionAutomatica:boolean, camposFaltantes:string[]}}
 * @throws {ErrorConfiguracionInvalida}
 */
function calcularElegibilidad(estudiante = {}, configuracion) {
  validarConfiguracion(configuracion);

  const camposFaltantes = CAMPOS_REQUERIDOS.filter((campo) => esVacio(estudiante[campo]));
  if (camposFaltantes.length > 0) {
    return {
      puntaje: null,
      clasificacion: CLASIFICACIONES.DATOS_INCOMPLETOS,
      decisionAutomatica: false,
      camposFaltantes,
    };
  }

  const { pesos, escalas, umbrales } = configuracion;

  const componentePromedio = acotar01(estudiante.promedioAcumulado / escalas.promedioMaximo);
  const componenteEstrato = acotar01(
    (escalas.estratoMaximo - estudiante.estrato) / (escalas.estratoMaximo - 1)
  );
  const componenteIngresos = acotar01(1 - estudiante.ingresosHogar / escalas.ingresosReferencia);

  const puntaje =
    100 *
    (pesos.promedio * componentePromedio +
      pesos.estrato * componenteEstrato +
      pesos.ingresos * componenteIngresos);

  return {
    puntaje,
    clasificacion: clasificar(puntaje, umbrales),
    decisionAutomatica: true,
    camposFaltantes: [],
  };
}

module.exports = {
  calcularElegibilidad,
  ErrorConfiguracionInvalida,
  CLASIFICACIONES,
  CAMPOS_REQUERIDOS,
};
