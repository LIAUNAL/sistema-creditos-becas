'use strict';

// Story 5.11 (P11): solicitud de beca, premios y configuracion de elegibilidad.
// - `scholarship_applications`: una solicitud por estudiante y periodo. Los datos de entrada son
//   anulables porque una solicitud con datos faltantes se guarda como `datos_incompletos`.
//   `decision_automatica` es 1 cuando el calculo llego a una clasificacion (elegible, no_elegible o
//   limitrofe) y 0 cuando faltaban datos. `campos_faltantes` es una lista JSON.
// - `scholarship_awards`: proyeccion de becas otorgadas (puente F4). Una fila por solicitud; `origen`
//   distingue la beca automatica de la decidida por el comite (P12). El reporte consolidado la lee.
// - `configuracion_elegibilidad`: pesos, escalas y umbrales por periodo (JSON). Sin fila para un
//   periodo, la aplicacion usa DEFAULT_CONFIGURACION (src/app/configuracionElegibilidad.js).
function up(db) {
  db.exec(`
    CREATE TABLE scholarship_applications (
      id TEXT PRIMARY KEY,
      estudiante_id TEXT NOT NULL,
      periodo_academico TEXT NOT NULL,
      promedio_acumulado REAL,
      estrato INTEGER,
      ingresos_hogar REAL,
      clasificacion TEXT NOT NULL,
      puntaje REAL,
      decision_automatica INTEGER NOT NULL,
      campos_faltantes TEXT NOT NULL DEFAULT '[]',
      creada_en TEXT NOT NULL,
      actualizada_en TEXT NOT NULL,
      UNIQUE (estudiante_id, periodo_academico)
    );

    CREATE TABLE scholarship_awards (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL UNIQUE REFERENCES scholarship_applications (id),
      estudiante_id TEXT NOT NULL,
      periodo_academico TEXT NOT NULL,
      origen TEXT NOT NULL CHECK (origen IN ('automatica', 'comite')),
      otorgada_en TEXT NOT NULL
    );
    CREATE INDEX scholarship_awards_periodo ON scholarship_awards (periodo_academico);

    CREATE TABLE configuracion_elegibilidad (
      periodo_academico TEXT PRIMARY KEY,
      configuracion TEXT NOT NULL,
      actualizada_en TEXT NOT NULL
    );
  `);
}

module.exports = { version: 7, nombre: 'becas', up };
