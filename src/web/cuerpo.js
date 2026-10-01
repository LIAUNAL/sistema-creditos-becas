'use strict';

const { errorHttp } = require('./guardias');

const LIMITE_CUERPO_POR_DEFECTO = 64 * 1024; // 64 KiB

// Cada petición se lee una sola vez: el CSRF y el manejador comparten el resultado.
const leidos = new WeakMap();

function cuerpoDemasiadoGrande() {
  const error = errorHttp(413, 'CUERPO_DEMASIADO_GRANDE');
  error.cerrarConexion = true;
  return error;
}

function interpretar(texto, tipo) {
  try {
    if (tipo === 'application/json') return JSON.parse(texto);
    if (tipo === 'application/x-www-form-urlencoded') return Object.fromEntries(new URLSearchParams(texto));
  } catch {
    // cae al error común
  }
  throw errorHttp(400, 'FORMATO_INVALIDO');
}

/**
 * Lee y decodifica el cuerpo (JSON o x-www-form-urlencoded) con un máximo.
 * Si el máximo se supera rechaza con 413 sin seguir leyendo: el error lleva
 * `cerrarConexion` para que el servidor responda `Connection: close`.
 */
function leerCuerpo(req, { limite = LIMITE_CUERPO_POR_DEFECTO } = {}) {
  if (leidos.has(req)) return leidos.get(req);
  const promesa = new Promise((resolver, rechazar) => {
    const declarado = Number.parseInt(req.headers['content-length'] ?? '', 10);
    if (Number.isFinite(declarado) && declarado > limite) {
      req.pause();
      rechazar(cuerpoDemasiadoGrande());
      return;
    }
    const trozos = [];
    let total = 0;
    let terminado = false;
    const abandonar = (error) => {
      terminado = true;
      trozos.length = 0;
      req.removeAllListeners('data');
      req.pause();
      rechazar(error);
    };
    req.on('data', (trozo) => {
      if (terminado) return;
      total += trozo.length;
      if (total > limite) {
        abandonar(cuerpoDemasiadoGrande());
        return;
      }
      trozos.push(trozo);
    });
    req.on('end', () => {
      if (terminado) return;
      terminado = true;
      const tipo = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      try {
        resolver(interpretar(Buffer.concat(trozos).toString('utf8'), tipo));
      } catch (error) {
        rechazar(error);
      }
    });
    req.on('error', (error) => {
      if (!terminado) rechazar(error);
    });
  });
  leidos.set(req, promesa);
  // Evita "unhandled rejection" si nadie espera este resultado (p. ej. cuerpo ignorado).
  promesa.catch(() => {});
  return promesa;
}

module.exports = { leerCuerpo, LIMITE_CUERPO_POR_DEFECTO };
