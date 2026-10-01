'use strict';

function responderJson(res, estado, cuerpo) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(estado, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto),
  });
  res.end(texto);
}

// Paginas HTML: sin cache (llevan datos de la sesion y el token CSRF).
function responderHtml(res, estado, pagina) {
  const texto = String(pagina);
  res.writeHead(estado, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto),
    'Cache-Control': 'no-store',
  });
  res.end(texto);
}

// Hoja de estilos estatica servida por una ruta explicita (sin servidor de archivos generico).
function responderCss(res, estado, texto) {
  res.writeHead(estado, {
    'Content-Type': 'text/css; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto),
    'Cache-Control': 'public, max-age=300',
  });
  res.end(texto);
}

// 303: el navegador repite la siguiente peticion como GET (patron post/redirect/get).
function redirigir(res, ubicacion) {
  res.writeHead(303, { Location: ubicacion, 'Content-Length': 0, 'Cache-Control': 'no-store' });
  res.end();
}

module.exports = { responderJson, responderHtml, responderCss, redirigir };
