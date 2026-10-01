'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { iniciarServidor } = require('./servidor');

class ErrorDeModulo extends Error {
  constructor() {
    super('detalle interno sensible');
    this.codigo = 'CAMPOS_FALTANTES';
  }
}

let servidor;
let base;

test.before(async () => {
  servidor = await iniciarServidor({
    puerto: 0,
    rutas: [
      [
        'GET',
        '/falla',
        () => {
          throw new ErrorDeModulo();
        },
      ],
      ['GET', '/eco/:id', ({ params }) => ({ id: params.id })],
    ],
  });
  base = `http://127.0.0.1:${servidor.puerto}`;
});

test.after(async () => {
  await servidor.cerrar();
});

test('GET /health responde 200 con estado ok', async () => {
  const respuesta = await fetch(`${base}/health`);
  assert.strictEqual(respuesta.status, 200);
  assert.match(respuesta.headers.get('content-type'), /application\/json/);
  assert.deepStrictEqual(await respuesta.json(), { estado: 'ok' });
});

test('un error de módulo con .codigo responde el estado mapeado y no expone la traza', async () => {
  const respuesta = await fetch(`${base}/falla`);
  const texto = await respuesta.text();
  assert.strictEqual(respuesta.status, 400);
  assert.deepStrictEqual(JSON.parse(texto), { codigo: 'CAMPOS_FALTANTES' });
  assert.ok(!texto.includes('detalle interno sensible'));
  assert.ok(!texto.includes('at '));
  assert.ok(!texto.includes('servidor.test.js'));
});

test('una ruta inexistente responde 404', async () => {
  const respuesta = await fetch(`${base}/no-existe`);
  assert.strictEqual(respuesta.status, 404);
  assert.deepStrictEqual(await respuesta.json(), { codigo: 'RUTA_NO_ENCONTRADA' });
});

test('un método no registrado sobre una ruta existente responde 404', async () => {
  const respuesta = await fetch(`${base}/health`, { method: 'POST' });
  assert.strictEqual(respuesta.status, 404);
});

test('los parámetros de ruta llegan al manejador', async () => {
  const respuesta = await fetch(`${base}/eco/abc%20123`);
  assert.strictEqual(respuesta.status, 200);
  assert.deepStrictEqual(await respuesta.json(), { id: 'abc 123' });
});

test('cerrar resuelve aun con una conexión keep-alive abierta', async () => {
  const otro = await iniciarServidor({ puerto: 0 });
  await fetch(`http://127.0.0.1:${otro.puerto}/health`);
  await otro.cerrar();
  await assert.rejects(fetch(`http://127.0.0.1:${otro.puerto}/health`));
});
