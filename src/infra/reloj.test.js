'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { relojSistema, crearRelojFijo } = require('./reloj');

test('el reloj del sistema devuelve la fecha actual', () => {
  const antes = Date.now();
  const ahora = relojSistema.ahora();
  assert.ok(ahora instanceof Date);
  assert.ok(ahora.getTime() >= antes);
});

test('el reloj fijo devuelve siempre la fecha inyectada', () => {
  const reloj = crearRelojFijo(new Date('2026-01-02T03:04:05.000Z'));
  assert.strictEqual(reloj.ahora().toISOString(), '2026-01-02T03:04:05.000Z');
  assert.strictEqual(reloj.ahora().toISOString(), '2026-01-02T03:04:05.000Z');
});
