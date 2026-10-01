'use strict';

// Story 5.7 (P7): persistencia de los modulos de solicitud de credito.
// `datos` guarda en JSON los campos de la solicitud que no tienen columna propia (socioeconomicos).
// Las fechas se guardan como texto ISO 8601; los repositorios las rehidratan al tipo del modulo.
function up(db) {
  db.exec(`
    CREATE TABLE solicitudes (
      id TEXT PRIMARY KEY,
      estudiante_id TEXT NOT NULL,
      periodo_academico TEXT NOT NULL,
      estado TEXT NOT NULL,
      datos TEXT NOT NULL DEFAULT '{}',
      creada_en TEXT NOT NULL
    );
    CREATE INDEX solicitudes_estudiante ON solicitudes (estudiante_id);
    CREATE INDEX solicitudes_estado ON solicitudes (estado);

    CREATE TABLE documentos_solicitud (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitud_id TEXT NOT NULL REFERENCES solicitudes (id),
      tipo TEXT NOT NULL,
      nombre_archivo TEXT NOT NULL,
      UNIQUE (solicitud_id, tipo)
    );

    CREATE TABLE decisiones_solicitud (
      solicitud_id TEXT PRIMARY KEY REFERENCES solicitudes (id),
      tipo TEXT NOT NULL,
      asesor_id TEXT NOT NULL,
      fecha TEXT NOT NULL,
      motivo TEXT
    );
  `);
}

module.exports = { version: 5, nombre: 'solicitudes', up };
