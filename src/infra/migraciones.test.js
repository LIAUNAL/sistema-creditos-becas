'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { abrirBaseDeDatos } = require('./baseDeDatos');
const { ejecutarMigraciones } = require('./migraciones');

function listarTablas(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((fila) => fila.name);
}

function esquema(db) {
  return db.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY type, name').all();
}

test('las tablas existen y la segunda ejecucion no cambia el esquema ni falla', () => {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  const tablas = listarTablas(db);
  assert.ok(tablas.includes('schema_migrations'));
  assert.ok(tablas.includes('audit_log'));

  const esquemaInicial = esquema(db);
  const registradasInicial = db.prepare('SELECT * FROM schema_migrations').all();

  assert.doesNotThrow(() => ejecutarMigraciones(db));
  assert.deepStrictEqual(esquema(db), esquemaInicial);
  assert.deepStrictEqual(db.prepare('SELECT * FROM schema_migrations').all(), registradasInicial);
  db.close();
});

test('las migraciones se aplican en orden de version y se registran una sola vez', () => {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  const orden = [];
  const migraciones = [
    { version: 2, nombre: 'segunda', up: () => orden.push(2) },
    { version: 1, nombre: 'primera', up: () => orden.push(1) },
  ];

  const aplicadas = ejecutarMigraciones(db, migraciones);
  assert.deepStrictEqual(orden, [1, 2]);
  assert.deepStrictEqual(aplicadas, [1, 2]);

  assert.deepStrictEqual(ejecutarMigraciones(db, migraciones), []);
  assert.deepStrictEqual(orden, [1, 2]);

  const filas = db.prepare('SELECT version, nombre FROM schema_migrations ORDER BY version').all();
  assert.deepStrictEqual(
    filas.map((fila) => ({ version: fila.version, nombre: fila.nombre })),
    [
      { version: 1, nombre: 'primera' },
      { version: 2, nombre: 'segunda' },
    ],
  );
  db.close();
});

test('una migracion que falla no queda registrada ni deja cambios parciales', () => {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  const migraciones = [
    {
      version: 1,
      nombre: 'rota',
      up: (conexion) => {
        conexion.exec('CREATE TABLE parcial (id INTEGER)');
        throw new Error('fallo');
      },
    },
  ];
  assert.throws(() => ejecutarMigraciones(db, migraciones), /fallo/);
  assert.ok(!listarTablas(db).includes('parcial'));
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, 0);
  db.close();
});
