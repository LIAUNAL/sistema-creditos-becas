'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { ESTADOS_POR_CODIGO, mapearError } = require('./errores');

test('un codigo conocido se mapea a su estado HTTP y el cuerpo solo lleva el codigo', () => {
  const error = Object.assign(new Error('interno'), { codigo: 'SOLICITUD_EXISTENTE' });
  assert.deepStrictEqual(mapearError(error), {
    estado: 409,
    cuerpo: { codigo: 'SOLICITUD_EXISTENTE' },
  });
});

test('ESTADO_INVALIDO se mapea de forma conservadora a 409', () => {
  const error = Object.assign(new Error('x'), { codigo: 'ESTADO_INVALIDO' });
  assert.strictEqual(mapearError(error).estado, 409);
});

test('todos los codigos de la tabla producen un estado 4xx', () => {
  for (const [codigo, estado] of Object.entries(ESTADOS_POR_CODIGO)) {
    assert.ok(estado >= 400 && estado < 500, `${codigo} -> ${estado}`);
  }
});

test('un codigo desconocido responde 500 sin exponer mensaje ni traza', () => {
  const error = Object.assign(new Error('secreto'), { codigo: 'OTRO_CODIGO' });
  const resultado = mapearError(error);
  assert.strictEqual(resultado.estado, 500);
  assert.ok(!JSON.stringify(resultado).includes('secreto'));
});

test('un error sin codigo responde 500 con codigo generico', () => {
  const resultado = mapearError(new TypeError('boom'));
  assert.deepStrictEqual(resultado, { estado: 500, cuerpo: { codigo: 'ERROR_INTERNO' } });
});

test('un valor lanzado que no es un Error responde 500', () => {
  assert.strictEqual(mapearError(undefined).estado, 500);
  assert.strictEqual(mapearError('texto').estado, 500);
});

test('un error con estadoHttp propio de la capa web se respeta', () => {
  const error = Object.assign(new Error('x'), { estadoHttp: 404, codigo: 'RUTA_NO_ENCONTRADA' });
  assert.strictEqual(mapearError(error).estado, 404);
});
