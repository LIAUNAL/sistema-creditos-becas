'use strict';

const crypto = require('node:crypto');

const LONGITUD_MINIMA_SECRETO = 16;

/**
 * Tokens CSRF ligados a la sesión: HMAC-SHA256(secreto, idSesion).
 *
 * El secreto sale de CSRF_SECRET. Si falta se genera uno aleatorio por
 * proceso: vale solo para una instancia y los tokens emitidos dejan de ser
 * válidos al reiniciar (aceptado: las sesiones también viven en una instancia).
 */
function crearCsrf({ secreto = process.env.CSRF_SECRET } = {}) {
  if (secreto !== undefined && secreto !== '' && String(secreto).length < LONGITUD_MINIMA_SECRETO) {
    throw new Error(`CSRF_SECRET debe tener al menos ${LONGITUD_MINIMA_SECRETO} caracteres`);
  }
  const clave = secreto ? Buffer.from(String(secreto)) : crypto.randomBytes(32);
  const usaSecretoAleatorio = !secreto;

  const generar = (idSesion) => crypto.createHmac('sha256', clave).update(String(idSesion)).digest('hex');

  function verificar(idSesion, presentado) {
    if (typeof idSesion !== 'string' || idSesion === '' || typeof presentado !== 'string') return false;
    const esperado = Buffer.from(generar(idSesion));
    const recibido = Buffer.from(presentado);
    return recibido.length === esperado.length && crypto.timingSafeEqual(recibido, esperado);
  }

  return { generar, verificar, usaSecretoAleatorio };
}

module.exports = { crearCsrf };
