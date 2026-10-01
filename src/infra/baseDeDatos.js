'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const RUTA_POR_DEFECTO = path.join('data', 'app.db');
const EN_MEMORIA = ':memory:';

// Abre la conexion SQLite. Orden de precedencia de la ruta: `ruta`, DB_PATH, ruta por defecto.
function abrirBaseDeDatos({ ruta, entorno = process.env } = {}) {
  const destino = ruta || entorno.DB_PATH || RUTA_POR_DEFECTO;
  const enMemoria = destino === EN_MEMORIA;

  if (!enMemoria) {
    fs.mkdirSync(path.dirname(path.resolve(destino)), { recursive: true });
  }

  const db = new DatabaseSync(destino);
  db.exec('PRAGMA foreign_keys = ON');
  if (!enMemoria) {
    db.exec('PRAGMA journal_mode = WAL');
  }
  return db;
}

module.exports = { abrirBaseDeDatos, RUTA_POR_DEFECTO };
