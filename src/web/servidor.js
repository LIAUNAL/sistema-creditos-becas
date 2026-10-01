'use strict';

const http = require('node:http');
const { crearRouter } = require('./router');
const { mapearError } = require('./errores');
const { responderJson } = require('./respuestas');
const { errorHttp } = require('./guardias');
const { aplicarCabeceras } = require('./cabeceras');
const { leerCuerpo, LIMITE_CUERPO_POR_DEFECTO } = require('./cuerpo');
const { crearCsrf } = require('./csrf');

const METODOS_QUE_CAMBIAN_ESTADO = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Rutas sin sesión previa: no pueden llevar token CSRF y se protegen con la
// validación de origen.
const RUTAS_SIN_SESION = Object.freeze(['/login']);

const TIEMPOS_POR_DEFECTO = Object.freeze({
  headers: 15_000, // recibir las cabeceras (Node exige headers <= solicitud)
  solicitud: 30_000, // recibir la petición completa
  keepAlive: 5_000, // conexión ociosa entre peticiones
  socket: 60_000, // inactividad máxima de un socket
  manejador: 20_000, // tiempo máximo para responder una petición
  revision: 1_000, // cada cuánto Node revisa los plazos anteriores
});

/**
 * Validación de origen para peticiones sin sesión (login).
 * - `Sec-Fetch-Site` (lo envían los navegadores modernos): solo `same-origin`
 *   o `none` (acción directa del usuario).
 * - Si no está, `Origin` debe coincidir con `Host`.
 * - Sin ninguna de las dos se acepta: un navegador siempre envía al menos una
 *   en un POST entre sitios, así que la ausencia indica un cliente que no es
 *   navegador (curl, scripts, pruebas), que no está expuesto a CSRF.
 */
function origenPermitido(req) {
  const sitio = req.headers['sec-fetch-site'];
  if (sitio !== undefined) return sitio === 'same-origin' || sitio === 'none';
  const origen = req.headers.origin;
  if (origen === undefined) return true;
  try {
    return new URL(origen).host === req.headers.host;
  } catch {
    return false;
  }
}

/**
 * Crea el servidor HTTP sin ponerlo a escuchar.
 * `rutas` es una lista de `[metodo, patron, manejador]`; el manejador recibe
 * `{ req, res, params, url, leerCuerpo }` y devuelve el cuerpo JSON (200) o
 * responde él mismo. `leerCuerpo()` aplica el límite compartido.
 *
 * Seguridad (P4):
 * - cabeceras de seguridad en toda respuesta;
 * - CSRF en POST/PUT/PATCH/DELETE: token ligado a la sesión (`obtenerIdSesion`)
 *   en `x-csrf-token` o en el campo `_csrf`. Sin `obtenerIdSesion` todo cambio
 *   de estado (salvo las rutas sin sesión) se rechaza;
 * - límite de cuerpo (`limiteCuerpo`, 64 KiB por defecto);
 * - plazo por petición (`tiempos.manejador`).
 */
function crearServidor({
  rutas = [],
  csrf = crearCsrf(),
  obtenerIdSesion = () => null,
  limiteCuerpo = LIMITE_CUERPO_POR_DEFECTO,
  tiempos = {},
  rutasSinSesion = RUTAS_SIN_SESION,
} = {}) {
  const plazos = { ...TIEMPOS_POR_DEFECTO, ...tiempos };
  const router = crearRouter();
  router.agregar('GET', '/health', () => ({ estado: 'ok' }));
  for (const [metodo, patron, manejador] of rutas) {
    router.agregar(metodo, patron, manejador);
  }

  async function verificarCsrf(req, url) {
    if (!METODOS_QUE_CAMBIAN_ESTADO.has(req.method)) return;
    if (rutasSinSesion.includes(url.pathname)) {
      if (!origenPermitido(req)) throw errorHttp(403, 'ORIGEN_NO_PERMITIDO');
      return;
    }
    const idSesion = obtenerIdSesion(req);
    if (!idSesion) throw errorHttp(403, 'CSRF_INVALIDO');
    let token = req.headers['x-csrf-token'];
    if (token === undefined) {
      const tipo = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (tipo === 'application/x-www-form-urlencoded') {
        token = (await leerCuerpo(req, { limite: limiteCuerpo }))._csrf;
      }
    }
    if (!csrf.verificar(idSesion, token)) throw errorHttp(403, 'CSRF_INVALIDO');
  }

  // Responde 408 (cuerpo sin completar) o 503 y cierra la conexión.
  function agotarTiempo(req, res) {
    if (res.writableEnded) return;
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const lenta = !req.complete;
    res.setHeader('Connection', 'close');
    res.once('finish', () => req.socket.destroy());
    responderJson(res, lenta ? 408 : 503, { codigo: lenta ? 'SOLICITUD_LENTA' : 'TIEMPO_AGOTADO' });
  }

  const servidor = http.createServer(
    {
      headersTimeout: Math.min(plazos.headers, plazos.solicitud),
      requestTimeout: plazos.solicitud,
      keepAliveTimeout: plazos.keepAlive,
      connectionsCheckingInterval: plazos.revision,
    },
    async (req, res) => {
      aplicarCabeceras(res);
      const temporizador = setTimeout(() => agotarTiempo(req, res), plazos.manejador);
      res.once('close', () => clearTimeout(temporizador));
      try {
        const url = new URL(req.url, 'http://localhost');
        const resuelto = router.resolver(req.method, url.pathname);
        if (!resuelto) {
          responderJson(res, 404, { codigo: 'RUTA_NO_ENCONTRADA' });
          return;
        }
        await verificarCsrf(req, url);
        const resultado = await resuelto.manejador({
          req,
          res,
          params: resuelto.params,
          url,
          leerCuerpo: () => leerCuerpo(req, { limite: limiteCuerpo }),
        });
        if (!res.writableEnded && !res.headersSent) {
          responderJson(res, 200, resultado === undefined ? {} : resultado);
        }
      } catch (error) {
        if (res.headersSent || res.writableEnded) {
          if (!res.writableEnded) res.destroy();
          return;
        }
        if (error?.cerrarConexion) res.setHeader('Connection', 'close');
        const { estado, cuerpo } = mapearError(error);
        responderJson(res, estado, cuerpo);
      }
    },
  );
  servidor.setTimeout(plazos.socket);
  return servidor;
}

/**
 * Inicia el servidor. `puerto: 0` usa un puerto efímero.
 * Devuelve `{ servidor, puerto, cerrar }`; `cerrar()` resuelve cuando todas
 * las conexiones se cerraron. Las demás opciones son las de `crearServidor`.
 */
function iniciarServidor({ puerto = 0, host = '127.0.0.1', ...opciones } = {}) {
  const servidor = crearServidor(opciones);
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

module.exports = { crearServidor, iniciarServidor, origenPermitido };
