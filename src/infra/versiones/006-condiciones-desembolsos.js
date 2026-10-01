'use strict';

// Story 5.10 (P10): condiciones del credito, calendario de desembolsos y errores de generacion.
// - `condiciones_credito`: los terminos con que el asesor aprobo (uno por solicitud).
// - `desembolsos`: una fila por cuota; `periodo_academico` y `tipo_credito` se copian al generar el
//   calendario (puente F4). `fecha` y `fecha_ejecucion` son fechas ISO `YYYY-MM-DD`.
// - `calendar_errors`: registro de generaciones rechazadas. Sin clave foranea a proposito: el error se
//   guarda en una transaccion aparte, aunque la aprobacion se haya revertido.
function up(db) {
  db.exec(`
    CREATE TABLE condiciones_credito (
      solicitud_id TEXT PRIMARY KEY REFERENCES solicitudes (id),
      monto REAL NOT NULL,
      numero_cuotas INTEGER NOT NULL,
      fecha_primera_cuota TEXT NOT NULL,
      tipo_credito TEXT NOT NULL,
      creada_en TEXT NOT NULL
    );

    CREATE TABLE desembolsos (
      id TEXT PRIMARY KEY,
      solicitud_id TEXT NOT NULL REFERENCES solicitudes (id),
      numero_cuota INTEGER NOT NULL,
      fecha TEXT NOT NULL,
      monto REAL NOT NULL,
      estado TEXT NOT NULL,
      fecha_ejecucion TEXT,
      periodo_academico TEXT,
      tipo_credito TEXT,
      UNIQUE (solicitud_id, numero_cuota)
    );
    CREATE INDEX desembolsos_estado ON desembolsos (estado);

    CREATE TABLE calendar_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitud_id TEXT NOT NULL,
      codigo TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      registrado_en TEXT NOT NULL
    );
  `);
}

module.exports = { version: 6, nombre: 'condiciones-desembolsos', up };
