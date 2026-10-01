'use strict';

const http = require('node:http');
const { crearRouter } = require('./router');
const { mapearError } = require('./errores');
const { responderJson } = require('./respuestas');

/**
 * Crea el servidor HTTP sin ponerlo a escuchar.
 * `rutas` es una lista de `[metodo, patron, manejador]`; el manejador recibe
 * `{ req, res, params, url }` y devuelve el cuerpo JSON (200) o responde él mismo.
 */
function crearServidor({ rutas = [] } = {}) {
  const router = crearRouter();
  router.agregar('GET', '/health', () => ({ estado: 'ok' }));
  for (const [metodo, patron, manejador] of rutas) {
    router.agregar(metodo, patron, manejador);
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const resuelto = router.resolver(req.method, url.pathname);
      if (!resuelto) {
        responderJson(res, 404, { codigo: 'RUTA_NO_ENCONTRADA' });
        return;
      }
      const resultado = await resuelto.manejador({ req, res, params: resuelto.params, url });
      if (!res.writableEnded && !res.headersSent) {
        responderJson(res, 200, resultado === undefined ? {} : resultado);
      }
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const { estado, cuerpo } = mapearError(error);
      responderJson(res, estado, cuerpo);
    }
  });
}

/**
 * Inicia el servidor. `puerto: 0` usa un puerto efímero.
 * Devuelve `{ servidor, puerto, cerrar }`; `cerrar()` resuelve cuando todas
 * las conexiones se cerraron.
 */
function iniciarServidor({ puerto = 0, host = '127.0.0.1', rutas = [] } = {}) {
  const servidor = crearServidor({ rutas });
  return new Promise((resolver, rechazar) => {
    servidor.once('error', rechazar);
    servidor.listen(puerto, host, () => {
      servidor.removeListener('error', rechazar);
      resolver({
        servidor,
        puerto: servidor.address().port,
        cerrar: () =>
          new Promise((resuelto, fallo) => {
            servidor.close((error) => (error ? fallo(error) : resuelto()));
            servidor.closeIdleConnections();
            servidor.closeAllConnections();
          }),
      });
    });
  });
}

module.exports = { crearServidor, iniciarServidor };
