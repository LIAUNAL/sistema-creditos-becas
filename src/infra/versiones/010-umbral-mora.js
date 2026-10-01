'use strict';

// Story 5.17 (P17): umbral de la alerta de mora por periodo e indices del reporte consolidado.
// - `configuracion_mora`: una fila por periodo academico con su umbral (fraccion entre 0 y 1). Sin fila, la
//   aplicacion usa UMBRAL_MORA_POR_DEFECTO (src/app/servicioReportes.js), sustituible con UMBRAL_MORA_DEFECTO.
//   Se guarda en una tabla propia (y no en `configuracion_elegibilidad`) porque es otro dominio: la mora de
//   los creditos, no la elegibilidad de las becas.
// - Indices (NFR-002): el reporte filtra solicitudes y desembolsos por periodo (y estado). Los premios ya
//   tienen `scholarship_awards_periodo` desde la migracion 007.
function up(db) {
  db.exec(`
    CREATE TABLE configuracion_mora (
      periodo_academico TEXT PRIMARY KEY,
      umbral REAL NOT NULL CHECK (umbral >= 0 AND umbral <= 1),
      actualizada_en TEXT NOT NULL,
      actualizada_por TEXT NOT NULL
    );
    CREATE INDEX desembolsos_periodo_estado ON desembolsos (periodo_academico, estado);
    CREATE INDEX solicitudes_periodo_estado ON solicitudes (periodo_academico, estado);
  `);
}

module.exports = { version: 10, nombre: 'umbral-mora', up };
