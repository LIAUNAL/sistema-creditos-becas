'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { abrirBaseDeDatos } = require('./baseDeDatos');
const { enTransaccion } = require('./transaccion');

function preparar() {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
  return db;
}

const contar = (db) => db.prepare('SELECT COUNT(*) AS n FROM t').get().n;

test('enTransaccion confirma y devuelve el resultado de fn', () => {
  const db = preparar();
  const resultado = enTransaccion(db, () => {
    db.prepare('INSERT INTO t (v) VALUES (?)').run('a');
    return 42;
  });
  assert.equal(resultado, 42);
  assert.equal(contar(db), 1);
});

test('enTransaccion revierte todo y relanza el error si fn lanza', () => {
  const db = preparar();
  assert.throws(
    () =>
      enTransaccion(db, () => {
        db.prepare('INSERT INTO t (v) VALUES (?)').run('a');
        throw new Error('falla');
      }),
    /falla/,
  );
  assert.equal(contar(db), 0);
  // la conexion queda utilizable (no quedo una transaccion abierta)
  enTransaccion(db, () => db.prepare('INSERT INTO t (v) VALUES (?)').run('b'));
  assert.equal(contar(db), 1);
});

test('enTransaccion rechaza una funcion asincrona y revierte', () => {
  const db = preparar();
  assert.throws(
    () =>
      enTransaccion(db, async () => {
        db.prepare('INSERT INTO t (v) VALUES (?)').run('a');
      }),
    (error) => error.codigo === 'TRANSACCION_ASINCRONA',
  );
  assert.equal(contar(db), 0);
  enTransaccion(db, () => db.prepare('INSERT INTO t (v) VALUES (?)').run('b'));
  assert.equal(contar(db), 1);
});
