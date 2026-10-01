'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { hashearContrasena, verificarContrasena } = require('./contrasenas');

test('hashear devuelve una cadena autodescriptiva sin la contraseña en claro', async () => {
  const hash = await hashearContrasena('secreta-123');
  const partes = hash.split('$');
  assert.strictEqual(partes[0], 'scrypt');
  assert.match(partes[1], /^N=\d+,r=\d+,p=\d+,keylen=\d+$/);
  assert.ok(partes[2].length > 0 && partes[3].length > 0);
  assert.ok(!hash.includes('secreta-123'));
});

test('la misma contraseña produce hashes distintos (sal aleatoria)', async () => {
  const a = await hashearContrasena('secreta-123');
  const b = await hashearContrasena('secreta-123');
  assert.notStrictEqual(a, b);
});

test('verificar acepta la contraseña correcta y rechaza la incorrecta', async () => {
  const hash = await hashearContrasena('secreta-123');
  assert.strictEqual(await verificarContrasena('secreta-123', hash), true);
  assert.strictEqual(await verificarContrasena('otra', hash), false);
});

test('verificar rechaza formatos de hash inválidos sin lanzar', async () => {
  assert.strictEqual(await verificarContrasena('x', 'basura'), false);
  assert.strictEqual(await verificarContrasena('x', 'bcrypt$a$b$c'), false);
  assert.strictEqual(await verificarContrasena('x', 'scrypt$N=1,r=1,p=1,keylen=0$AA$AA'), false);
});

test('el módulo usa scrypt asíncrono y nunca scryptSync', () => {
  const fuente = fs.readFileSync(path.join(__dirname, 'contrasenas.js'), 'utf8');
  assert.ok(!fuente.includes('scryptSync'));
  assert.ok(fuente.includes('timingSafeEqual'));
});
