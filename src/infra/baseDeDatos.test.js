'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { abrirBaseDeDatos, RUTA_POR_DEFECTO } = require('./baseDeDatos');
const { ejecutarMigraciones } = require('./migraciones');
const { crearAuditoria } = require('./auditoria');
const { crearRelojFijo } = require('./reloj');

test('una base en memoria tiene las claves foraneas activas', () => {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  assert.strictEqual(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  db.close();
});

test('la ruta por defecto es data/app.db y DB_PATH la reemplaza', () => {
  assert.strictEqual(RUTA_POR_DEFECTO, path.join('data', 'app.db'));
  const directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-ruta-'));
  try {
    const ruta = path.join(directorio, 'anidado', 'otra.db');
    const db = abrirBaseDeDatos({ entorno: { DB_PATH: ruta } });
    assert.ok(fs.existsSync(ruta));
    db.close();
  } finally {
    fs.rmSync(directorio, { recursive: true, force: true });
  }
});

test('una base en archivo usa WAL, crea el directorio y persiste al reabrir', () => {
  const directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-persistencia-'));
  try {
    const ruta = path.join(directorio, 'datos', 'app.db');
    const reloj = crearRelojFijo(new Date('2026-03-01T10:00:00.000Z'));

    const primera = abrirBaseDeDatos({ ruta });
    assert.strictEqual(primera.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    ejecutarMigraciones(primera);
    crearAuditoria({ db: primera, reloj }).registrar({
      actor: 'u1',
      rol: 'analista',
      accion: 'crear',
      objetivo: 'solicitud-1',
    });
    primera.close();

    const segunda = abrirBaseDeDatos({ ruta });
    ejecutarMigraciones(segunda);
    const entradas = crearAuditoria({ db: segunda, reloj }).listar();
    assert.strictEqual(entradas.length, 1);
    assert.strictEqual(entradas[0].objetivo, 'solicitud-1');
    segunda.close();
  } finally {
    fs.rmSync(directorio, { recursive: true, force: true });
  }
});
