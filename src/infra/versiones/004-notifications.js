'use strict';

// D6: bandeja de salida (outbox) y bandeja de entrada en la app. `payload` es JSON en texto.
// Destinatarios: envio/decision -> estudiante; caso_limitrofe -> rol `comite_becas`;
// desembolso -> solicitud (la bandeja lo resuelve al estudiante despues).
function up(db) {
  db.exec(`
    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL CHECK (tipo IN ('envio', 'decision', 'caso_limitrofe', 'desembolso')),
      destinatario_tipo TEXT NOT NULL CHECK (destinatario_tipo IN ('estudiante', 'solicitud', 'rol')),
      destinatario_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      creada_en TEXT NOT NULL,
      entregada_en TEXT,
      intentos INTEGER NOT NULL DEFAULT 0,
      ultimo_error TEXT,
      leida_en TEXT
    );
    CREATE INDEX notifications_pendientes ON notifications (entregada_en);
    CREATE INDEX notifications_destinatario ON notifications (destinatario_tipo, destinatario_id);
  `);
}

module.exports = { version: 4, nombre: 'notifications', up };
