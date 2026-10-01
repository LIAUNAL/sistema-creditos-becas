'use strict';

// Para páginas renderizadas en servidor sin scripts ni estilos en línea.
const POLITICA_CONTENIDO = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const CABECERAS_SEGURIDAD = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': POLITICA_CONTENIDO,
});

/** Se aplica al inicio de cada petición: toda respuesta (incluidos errores) las lleva. */
function aplicarCabeceras(res) {
  for (const [nombre, valor] of Object.entries(CABECERAS_SEGURIDAD)) res.setHeader(nombre, valor);
}

module.exports = { aplicarCabeceras, CABECERAS_SEGURIDAD };
