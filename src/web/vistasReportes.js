'use strict';

const { html } = require('./html');
const { pagina, resumen, campoDeTexto, campoCsrf } = require('./vistas');

// Story 5.17 (P17): reporte consolidado, alerta de mora y umbral por periodo. Solo muestra agregados, el
// periodo, la tasa y el umbral: nunca datos socioeconomicos ni identificadores de estudiantes (NFR-003).
// Todo valor interpolado pasa por la plantilla `html`, que lo escapa. Sin scripts ni estilos en linea.

// Pesos colombianos con punto de miles: 1200000 -> "$1.200.000".
function montoLegible(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '$0';
  return `$${Math.round(numero).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

// Fraccion -> porcentaje con una cifra decimal y coma: 0.6667 -> "66,7 %", 0.1 -> "10 %".
function porcentajeLegible(fraccion) {
  const valor = Math.round(Number(fraccion) * 1000) / 10;
  return `${String(valor).replace('.', ',')} %`;
}

const plural = (cantidad, singular, pluralTexto) => (cantidad === 1 ? singular : pluralTexto);

function selectorDePeriodo({ periodo, periodos }) {
  // Un periodo consultado sin datos tambien se ofrece, para poder volver a verlo.
  const opciones = periodo !== null && !periodos.includes(periodo) ? [periodo, ...periodos] : periodos;
  return html`<form method="get" action="/direccion/reportes">
<div class="campo">
<label for="periodo">Periodo académico</label>
<select id="periodo" name="periodo">
${opciones.map((opcion) => html`<option value="${opcion}"${opcion === periodo ? html` selected` : ''}>${opcion}</option>`)}
</select>
</div>
<button type="submit">Ver reporte</button>
</form>`;
}

function seccionReporte({ reporte }) {
  return html`<section aria-labelledby="titulo-reporte">
<h2 id="titulo-reporte">Reporte consolidado</h2>
<dl class="datos">
<dt>Periodo académico</dt><dd>${reporte.periodoAcademico}</dd>
<dt>Créditos aprobados</dt><dd>${reporte.totalCreditosAprobados}</dd>
<dt>Becas otorgadas</dt><dd>${reporte.totalBecasOtorgadas}</dd>
<dt>Becas automáticas</dt><dd>${reporte.becasAutomaticas}</dd>
<dt>Becas por comité</dt><dd>${reporte.becasComite}</dd>
<dt>Monto total desembolsado</dt><dd>${montoLegible(reporte.montoTotalDesembolsado)}</dd>
</dl>
</section>`;
}

function seccionMora({ mora }) {
  const { alerta, sinPeriodo } = mora;
  return html`<section aria-labelledby="titulo-mora">
<h2 id="titulo-mora">Alerta de mora</h2>
${alerta
    ? html`<div id="alerta-mora" class="resumen-errores" role="alert">
<p><strong>Alerta de mora en el periodo ${alerta.periodoAcademico}:</strong> la tasa de mora es ${porcentajeLegible(alerta.tasaMora)} y supera el umbral configurado de ${porcentajeLegible(alerta.umbral)}.</p>
</div>`
    : html`<p>Sin alerta de mora para este periodo.</p>`}
<dl class="datos">
<dt>Tasa de mora calculada</dt><dd>${porcentajeLegible(mora.tasaMora)}</dd>
<dt>Umbral de mora vigente</dt><dd>${porcentajeLegible(mora.umbral)}</dd>
</dl>
<p>${mora.origenUmbral === 'configurado'
    ? 'El umbral fue configurado para este periodo.'
    : 'Este periodo no tiene umbral propio: se usa el umbral por defecto.'}</p>
${sinPeriodo > 0
    ? html`<p>${sinPeriodo} ${plural(sinPeriodo, 'desembolso sin periodo académico no se incluye', 'desembolsos sin periodo académico no se incluyen')} en la tasa de mora.</p>`
    : ''}
</section>`;
}

function formularioUmbral({ periodo, csrf, valores, errores }) {
  return html`<section aria-labelledby="titulo-umbral">
<h2 id="titulo-umbral">Umbral de mora del periodo</h2>
<form method="post" action="/direccion/reportes/umbral">
${campoCsrf(csrf)}
<input type="hidden" name="periodo" value="${periodo}">
${campoDeTexto({
    id: 'umbral',
    etiqueta: 'Umbral de mora (fracción entre 0 y 1)',
    ayuda: 'Por ejemplo 0.10 equivale a 10 %. La alerta se muestra solo cuando la tasa lo supera.',
    modo: 'decimal',
    valores,
    errores,
  })}
<button type="submit">Guardar umbral</button>
</form>
</section>`;
}

/**
 * @param {object} p
 * @param {string|null} p.periodo periodo consultado (null: no hay ningun periodo con datos)
 * @param {string[]} p.periodos periodos con datos, el mas reciente primero
 * @param {object|null} p.reporte salida de `servicioReportes.generarReporte`
 * @param {object|null} p.mora salida de `servicioReportes.evaluarAlertaMora`
 */
function vistaReportes({ usuario, csrf, periodo, periodos, reporte, mora, valores = {}, errores = {}, resumenErrores = null }) {
  const sinPeriodo = periodo === null;
  const contenido = sinPeriodo
    ? (periodos.length === 0 ? html`<p>Aún no hay periodos con datos para reportar.</p>` : '')
    : html`${seccionReporte({ reporte })}
${seccionMora({ mora })}
${formularioUmbral({ periodo, csrf, valores, errores })}`;
  return pagina({
    titulo: 'Reportes de dirección académica',
    usuario,
    csrf,
    contenido: html`<h1>Reportes de dirección académica</h1>
${resumenErrores ? resumen(resumenErrores.titulo, resumenErrores.elementos) : ''}
${sinPeriodo && periodos.length === 0 ? '' : selectorDePeriodo({ periodo, periodos })}
${contenido}
<p><a href="/direccion">Volver al inicio</a></p>`,
  });
}

module.exports = { vistaReportes, montoLegible, porcentajeLegible };
