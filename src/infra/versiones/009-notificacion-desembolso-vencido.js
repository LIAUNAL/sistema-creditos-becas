'use strict';

// Story 5.15 (P15): el aviso de desembolso vencido es un tipo nuevo de `notifications`.
// SQLite no puede alterar un CHECK, asi que se reconstruye la tabla dentro de la transaccion de la
// migracion: se copian las filas con sus ids, se recrean los indices y se conserva la secuencia
// AUTOINCREMENT (los ids ya usados, incluso de filas borradas, no se reutilizan).
function up(db) {
  const secuencia = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'notifications'").get();
  db.exec(`
    CREATE TABLE notifications_nueva (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL CHECK (tipo IN ('envio', 'decision', 'caso_limitrofe', 'desembolso', 'desembolso_vencido')),
      destinatario_tipo TEXT NOT NULL CHECK (destinatario_tipo IN ('estudiante', 'solicitud', 'rol')),
      destinatario_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      creada_en TEXT NOT NULL,
      entregada_en TEXT,
      intentos INTEGER NOT NULL DEFAULT 0,
      ultimo_error TEXT,
      leida_en TEXT
    );
    INSERT INTO notifications_nueva
      (id, tipo, destinatario_tipo, destinatario_id, payload, creada_en, entregada_en, intentos, ultimo_error, leida_en)
    SELECT id, tipo, destinatario_tipo, destinatario_id, payload, creada_en, entregada_en, intentos, ultimo_error, leida_en
      FROM notifications;
    DROP TABLE notifications;
    ALTER TABLE notifications_nueva RENAME TO notifications;
    CREATE INDEX notifications_pendientes ON notifications (entregada_en);
    CREATE INDEX notifications_destinatario ON notifications (destinatario_tipo, destinatario_id);
  `);
  if (secuencia) {
    db.prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = 'notifications'").run(secuencia.seq);
  }
}

module.exports = { version: 9, nombre: 'notificacion-desembolso-vencido', up };
