'use strict';

const { MIGRACIONES } = require('./versiones/indice');

// Aplica las migraciones pendientes, en orden de version, cada una en su propia transaccion.
// Devuelve las versiones aplicadas en esta ejecucion (vacio si no habia nada pendiente).
function ejecutarMigraciones(db, migraciones = MIGRACIONES) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL,
    aplicada_en TEXT NOT NULL
  )`);

  const registradas = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((fila) => fila.version),
  );
  const registrar = db.prepare(
    'INSERT INTO schema_migrations (version, nombre, aplicada_en) VALUES (?, ?, ?)',
  );

  const pendientes = [...migraciones]
    .sort((a, b) => a.version - b.version)
    .filter((migracion) => !registradas.has(migracion.version));

  const aplicadas = [];
  for (const migracion of pendientes) {
    db.exec('BEGIN');
    try {
      migracion.up(db);
      registrar.run(migracion.version, migracion.nombre, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    aplicadas.push(migracion.version);
  }
  return aplicadas;
}

module.exports = { ejecutarMigraciones };
