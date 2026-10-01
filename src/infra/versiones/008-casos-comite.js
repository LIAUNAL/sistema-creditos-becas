'use strict';

// Story 5.12 (P12): casos del comite de becas.
// - `casos_comite`: un caso por solicitud de beca limitrofe (`id` = id de la solicitud, la FK se verifica
//   al confirmar porque la solicitud se inserta en la misma transaccion, despues del volcado de la
//   unidad de trabajo). `historial` es una lista JSON con las fechas en ISO; `creada_en` es la fecha de
//   ingreso a la cola. El periodo vive tambien en la solicitud: aqui se copia para consultarlo sin unir.
function up(db) {
  db.exec(`
    CREATE TABLE casos_comite (
      id TEXT PRIMARY KEY REFERENCES scholarship_applications (id) DEFERRABLE INITIALLY DEFERRED,
      estudiante_id TEXT NOT NULL,
      periodo_academico TEXT NOT NULL,
      puntaje REAL NOT NULL,
      estado TEXT NOT NULL CHECK (estado IN ('en_revision_comite', 'otorgada', 'denegada')),
      historial TEXT NOT NULL,
      creada_en TEXT NOT NULL
    );
    CREATE INDEX casos_comite_estado ON casos_comite (estado);
  `);
}

module.exports = { version: 8, nombre: 'casos-comite', up };
