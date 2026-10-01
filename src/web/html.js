'use strict';

const ESCAPES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
});

/** Escapa un valor para insertarlo en contenido o en un atributo HTML. */
function escaparHtml(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/[&<>"']/g, (caracter) => ESCAPES[caracter]);
}

/** HTML ya confiable: `html` y `crudo` lo producen y no se vuelve a escapar. */
class HtmlConfiable {
  constructor(texto) {
    this.texto = texto;
  }

  toString() {
    return this.texto;
  }
}

/** Marca explícita de HTML confiable. Nunca usarla con datos de usuario. */
function crudo(texto) {
  return new HtmlConfiable(String(texto));
}

function convertir(valor) {
  if (valor instanceof HtmlConfiable) return valor.texto;
  if (Array.isArray(valor)) return valor.map(convertir).join('');
  return escaparHtml(valor);
}

/**
 * Plantilla etiquetada: html`<p>${valor}</p>`. Todo valor interpolado se
 * escapa salvo los resultados de `html` y de `crudo()`.
 */
function html(literales, ...valores) {
  let salida = literales[0];
  valores.forEach((valor, i) => {
    salida += convertir(valor) + literales[i + 1];
  });
  return new HtmlConfiable(salida);
}

module.exports = { escaparHtml, html, crudo };
