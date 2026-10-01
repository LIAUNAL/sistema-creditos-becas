'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { crearRouter } = require('./router');

test('resuelve por método y ruta exacta', () => {
  const router = crearRouter();
  const manejador = () => {};
  router.agregar('GET', '/health', manejador);
  assert.deepStrictEqual(router.resolver('GET', '/health'), { manejador, params: {} });
  assert.strictEqual(router.resolver('POST', '/health'), null);
  assert.strictEqual(router.resolver('GET', '/otra'), null);
});

test('extrae parámetros de ruta y los decodifica', () => {
  const router = crearRouter();
  const manejador = () => {};
  router.agregar('GET', '/solicitudes/:id/documentos/:doc', manejador);
  const resuelto = router.resolver('GET', '/solicitudes/42/documentos/a%20b');
  assert.strictEqual(resuelto.manejador, manejador);
  assert.deepStrictEqual(resuelto.params, { id: '42', doc: 'a b' });
});

test('un parámetro no cruza segmentos ni coincide vacío', () => {
  const router = crearRouter();
  router.agregar('GET', '/solicitudes/:id', () => {});
  assert.strictEqual(router.resolver('GET', '/solicitudes/1/2'), null);
  assert.strictEqual(router.resolver('GET', '/solicitudes/'), null);
});

test('la barra final se tolera', () => {
  const router = crearRouter();
  router.agregar('GET', '/health', () => {});
  assert.ok(router.resolver('GET', '/health/'));
});

test('una codificación porcentual inválida no resuelve la ruta', () => {
  const router = crearRouter();
  router.agregar('GET', '/x/:id', () => {});
  assert.strictEqual(router.resolver('GET', '/x/%E0%A4%A'), null);
});
