'use strict';

// FR-040 / NFR-004: usuarios con contrasena hasheada y sesiones en SQLite.
// `sesiones.id` es el SHA-256 (hex) del token de la cookie: el token en claro nunca se guarda.
function up(db) {
  db.exec(`
    CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_usuario TEXT NOT NULL UNIQUE,
      hash_contrasena TEXT NOT NULL,
      rol TEXT NOT NULL CHECK (rol IN ('estudiante', 'asesor_financiero', 'comite_becas', 'direccion_academica')),
      activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
    );
    CREATE TABLE sesiones (
      id TEXT PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
      creada_en TEXT NOT NULL,
      expira_en TEXT NOT NULL
    );
    CREATE INDEX sesiones_usuario ON sesiones (usuario_id);
  `);
}

module.exports = { version: 2, nombre: 'usuarios_sesiones', up };
