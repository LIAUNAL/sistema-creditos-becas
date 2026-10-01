'use strict';

const { calcularElegibilidad, ErrorConfiguracionInvalida } = require('../evaluacion-elegibilidad/calculoElegibilidad');

// Story 5.11 (P11): origen de la configuracion de elegibilidad. El plan no define donde vive (nota de
// la story); decision de esta slice: una fila por periodo en `configuracion_elegibilidad` (JSON) y, si
// el periodo no tiene fila, la constante DEFAULT_CONFIGURACION. No hay pantalla de administracion.
//
// SUPUESTO (a confirmar con negocio): estos valores son razonables pero no vienen de ningun documento.
//   - Escala de notas colombiana 0-5 (`promedioMaximo: 5`) y estratos 1-6.
//   - `ingresosReferencia`: 6.000.000 mensuales (COP); ingresos iguales o mayores aportan 0 al puntaje.
//   - Pesos 0.5 / 0.25 / 0.25: el merito academico pesa lo mismo que las dos condiciones socioeconomicas
//     juntas. Son potencias de dos, asi el puntaje es exacto en coma flotante (70 es exactamente 70).
//   - Umbrales: >= 70 elegible, >= 50 y < 70 limitrofe (va a comite en P12), < 50 no elegible.
const DEFAULT_CONFIGURACION = Object.freeze({
  pesos: Object.freeze({ promedio: 0.5, estrato: 0.25, ingresos: 0.25 }),
  escalas: Object.freeze({ promedioMaximo: 5, estratoMaximo: 6, ingresosReferencia: 6000000 }),
  umbrales: Object.freeze({ elegible: 70, limitrofe: 50 }),
});

/**
 * Lee la configuracion del periodo y la valida SIEMPRE (la guardada y la de por defecto). Una
 * configuracion ilegible o invalida lanza `ErrorConfiguracionInvalida` (codigo sin estado HTTP: 500):
 * nunca se toma una decision con umbrales dudosos.
 */
function obtenerConfiguracion(db, periodoAcademico) {
  const fila = db
    .prepare('SELECT configuracion FROM configuracion_elegibilidad WHERE periodo_academico = ?')
    .get(periodoAcademico);
  let configuracion = DEFAULT_CONFIGURACION;
  if (fila) {
    try {
      configuracion = JSON.parse(fila.configuracion);
    } catch {
      throw new ErrorConfiguracionInvalida('el JSON almacenado no se puede leer');
    }
  }
  // `calcularElegibilidad` valida la configuracion antes de mirar los datos del estudiante.
  calcularElegibilidad({}, configuracion);
  return configuracion;
}

module.exports = { DEFAULT_CONFIGURACION, obtenerConfiguracion };
