'use strict';

function esThenable(valor) {
  return valor !== null && valor !== undefined && typeof valor.then === 'function';
}

// Ejecuta `fn` dentro de una transaccion SQLite SINCRONA (BEGIN IMMEDIATE / COMMIT).
// Si `fn` lanza, hace ROLLBACK y relanza. `fn` debe ser sincrona: ninguna transaccion
// puede cruzar un await (R6), asi que si devuelve una promesa se revierte y se lanza error.
function enTransaccion(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const resultado = fn();
    if (esThenable(resultado)) {
      // Evita un rechazo no manejado de la promesa descartada.
      resultado.then(undefined, () => {});
      const error = new TypeError('enTransaccion requiere una funcion sincrona');
      error.codigo = 'TRANSACCION_ASINCRONA';
      throw error;
    }
    db.exec('COMMIT');
    return resultado;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

module.exports = { enTransaccion };
