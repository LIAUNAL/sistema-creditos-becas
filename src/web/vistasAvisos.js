'use strict';

const { html } = require('./html');
const { pagina, campoCsrf } = require('./vistas');
const { LIMITE_AVISOS } = require('../app/servicioAvisos');

// Story 5.16 (P16): bandeja de avisos. Un aviso sin leer se distingue con TEXTO ("No leído"), no solo con color,
// y ofrece un boton para marcarlo; el escape de todo valor lo hace la plantilla `html`.

const fechaDe = (iso) => String(iso).slice(0, 10);

function itemAviso(aviso, csrf) {
  return html`<li id="aviso-${aviso.id}" class="${aviso.leida ? 'aviso' : 'aviso aviso-no-leido'}">
<p><strong>${aviso.leida ? 'Leído' : 'No leído'}</strong>: ${aviso.mensaje}</p>
<p><time datetime="${aviso.creadaEn}">${fechaDe(aviso.creadaEn)}</time>${aviso.enlace ? html` · <a href="${aviso.enlace}">Ver detalle</a>` : ''}</p>
${aviso.leida ? '' : html`<form method="post" action="/avisos/${aviso.id}/leer">
${campoCsrf(csrf)}
<button type="submit" class="boton-secundario">Marcar como leído</button>
</form>`}
</li>`;
}

function vistaAvisos({ usuario, csrf, avisos }) {
  const contenido = avisos.length === 0
    ? html`<p>No tiene avisos.</p>`
    : html`<ul class="avisos">
${avisos.map((aviso) => itemAviso(aviso, csrf))}
</ul>
${avisos.length >= LIMITE_AVISOS ? html`<p>Se muestran los ${LIMITE_AVISOS} avisos más recientes.</p>` : ''}`;
  return pagina({
    titulo: 'Avisos',
    usuario,
    csrf,
    contenido: html`<h1>Avisos</h1>
${contenido}`,
  });
}

module.exports = { vistaAvisos };
