'use strict';

// FR-041 / NFR-003: asignacion de solicitudes de credito (a asesores) y de casos de comite
// (a integrantes del comite). `recurso_id` es TEXT porque los ids de negocio son cadenas.
function up(db) {
  db.exec(`
    CREATE TABLE asignaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo_recurso TEXT NOT NULL CHECK (tipo_recurso IN ('solicitud_credito', 'caso_comite')),
      recurso_id TEXT NOT NULL,
      usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
      rol TEXT NOT NULL,
      asignada_en TEXT NOT NULL,
      UNIQUE (tipo_recurso, recurso_id, usuario_id)
    );
    CREATE INDEX asignaciones_usuario ON asignaciones (usuario_id);
  `);
}

module.exports = { version: 3, nombre: 'asignaciones', up };
