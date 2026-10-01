'use strict';

/**
 * Política única de cookies: HttpOnly, SameSite=Lax y Path=/ siempre.
 * `Secure` se agrega cuando la petición llega por HTTPS, cuando el proxy de
 * confianza (TRUST_PROXY=1) declara `X-Forwarded-Proto: https`, o cuando se
 * fuerza con COOKIE_SECURE=1. Sin TRUST_PROXY el encabezado X-Forwarded-Proto
 * se ignora porque el cliente podría falsearlo.
 */
function crearPoliticaCookies({ entorno = process.env } = {}) {
  const confiarEnProxy = entorno.TRUST_PROXY === '1';
  const forzarSecure = entorno.COOKIE_SECURE === '1';

  function esHttps(req) {
    if (req.socket?.encrypted) return true;
    if (!confiarEnProxy) return false;
    const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim().toLowerCase();
    return proto === 'https';
  }

  function serializar(req, nombre, valor, maxAgeSegundos) {
    const atributos = [`${nombre}=${valor}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSegundos}`];
    if (forzarSecure || esHttps(req)) atributos.push('Secure');
    return atributos.join('; ');
  }

  return { serializar, esHttps };
}

module.exports = { crearPoliticaCookies };
