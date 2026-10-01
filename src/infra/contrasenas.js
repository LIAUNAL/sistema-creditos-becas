'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

// scrypt asincrono (no bloquea el event loop). Nunca usar la variante sincrona.
const scrypt = promisify(crypto.scrypt);

const PARAMETROS = Object.freeze({ N: 16384, r: 8, p: 1, keylen: 64 });
const LONGITUD_SAL = 16;
const LIMITE_N = 2 ** 20;

// Formato: scrypt$N=16384,r=8,p=1,keylen=64$<sal base64>$<hash base64>
async function hashearContrasena(contrasena) {
  const sal = crypto.randomBytes(LONGITUD_SAL);
  const { N, r, p, keylen } = PARAMETROS;
  const derivada = await scrypt(contrasena, sal, keylen, { N, r, p });
  return `scrypt$N=${N},r=${r},p=${p},keylen=${keylen}$${sal.toString('base64')}$${derivada.toString('base64')}`;
}

function leerParametros(texto) {
  const valores = {};
  for (const par of texto.split(',')) {
    const [clave, valor] = par.split('=');
    if (!/^\d+$/.test(valor ?? '')) return null;
    valores[clave] = Number(valor);
  }
  const { N, r, p, keylen } = valores;
  if (![N, r, p, keylen].every(Number.isInteger)) return null;
  if (N < 2 || N > LIMITE_N || (N & (N - 1)) !== 0) return null;
  if (r < 1 || r > 32 || p < 1 || p > 16 || keylen < 16 || keylen > 128) return null;
  return { N, r, p, keylen };
}

// Devuelve true/false; un hash con formato invalido es simplemente `false`.
async function verificarContrasena(contrasena, almacenado) {
  if (typeof contrasena !== 'string' || typeof almacenado !== 'string') return false;
  const partes = almacenado.split('$');
  if (partes.length !== 4 || partes[0] !== 'scrypt') return false;
  const parametros = leerParametros(partes[1]);
  if (!parametros) return false;
  const sal = Buffer.from(partes[2], 'base64');
  const esperado = Buffer.from(partes[3], 'base64');
  if (sal.length === 0 || esperado.length !== parametros.keylen) return false;
  const { N, r, p, keylen } = parametros;
  const obtenido = await scrypt(contrasena, sal, keylen, { N, r, p });
  return crypto.timingSafeEqual(obtenido, esperado);
}

module.exports = { hashearContrasena, verificarContrasena };
