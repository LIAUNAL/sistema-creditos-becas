'use strict';

const { html } = require('./html');
const { campoCsrf } = require('./vistas');

// Story 5.15 (P15): bloque de revision manual de vencidos, compartido por el inicio de direccion academica
// y la cola del asesor. Sin datos de las personas: solo cantidades y periodos academicos.

function mensajeDeResultado(marcados) {
  if (marcados === 0) return 'No hay desembolsos nuevos por marcar como vencidos.';
  if (marcados === 1) return 'Se marcó 1 desembolso como vencido.';
  return `Se marcaron ${marcados} desembolsos como vencidos.`;
}

// El resultado viaja en la URL tras el redireccionamiento (post/redirect/get): solo se acepta un entero
// no negativo; cualquier otro valor se ignora y no se refleja en la pagina.
function marcadosDeConsulta(valor) {
  return typeof valor === 'string' && /^\d{1,9}$/.test(valor) ? Number(valor) : null;
}

/**
 * @param {object} p
 * @param {string} p.csrf token CSRF de la sesion
 * @param {string} p.accion ruta del POST de la revision manual
 * @param {number|null} [p.marcados] resultado de la ultima revision (null: no mostrar)
 * @param {Object<string, number>|null} [p.moraPorPeriodo] conteo de vencidos por periodo (null: no mostrar)
 */
function bloqueVencimientos({ csrf, accion, marcados = null, moraPorPeriodo = null }) {
  const periodos = moraPorPeriodo ? Object.entries(moraPorPeriodo).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) : null;
  return html`<section aria-labelledby="titulo-vencimientos">
<h2 id="titulo-vencimientos">Revisión de desembolsos vencidos</h2>
<p>Un desembolso programado pasa a vencido cuando su fecha más el plazo de confirmación ya pasó. La revisión también corre sola una vez al día mientras el servidor está en marcha.</p>
${marcados === null ? '' : html`<p role="status">${mensajeDeResultado(marcados)}</p>`}
<form method="post" action="${accion}">
${campoCsrf(csrf)}
<button type="submit">Revisar vencimientos</button>
</form>
${periodos === null ? '' : periodos.length === 0
    ? html`<p>No hay desembolsos vencidos.</p>`
    : html`<table>
<caption>Desembolsos vencidos por periodo académico</caption>
<thead>
<tr><th scope="col">Periodo académico</th><th scope="col">Desembolsos vencidos</th></tr>
</thead>
<tbody>
${periodos.map(([periodo, cantidad]) => html`<tr>
<td>${periodo}</td>
<td>${cantidad}</td>
</tr>`)}
</tbody>
</table>`}
</section>`;
}

module.exports = { bloqueVencimientos, marcadosDeConsulta, mensajeDeResultado };
