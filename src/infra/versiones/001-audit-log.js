'use strict';

// NFR-001: el registro de auditoria es de solo anexado; la base aborta UPDATE y DELETE.
function up(db) {
  db.exec(`
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      rol TEXT NOT NULL,
      accion TEXT NOT NULL,
      objetivo TEXT NOT NULL,
      fecha TEXT NOT NULL,
      detalle TEXT
    );
    CREATE INDEX audit_log_objetivo ON audit_log (objetivo);
    CREATE TRIGGER audit_log_sin_update BEFORE UPDATE ON audit_log
    BEGIN
      SELECT RAISE(ABORT, 'audit_log es de solo anexado (append-only): UPDATE no permitido');
    END;
    CREATE TRIGGER audit_log_sin_delete BEFORE DELETE ON audit_log
    BEGIN
      SELECT RAISE(ABORT, 'audit_log es de solo anexado (append-only): DELETE no permitido');
    END;
  `);
}

module.exports = { version: 1, nombre: 'audit_log', up };
