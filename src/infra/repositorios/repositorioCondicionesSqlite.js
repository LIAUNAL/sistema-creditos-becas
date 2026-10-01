'use strict';

const { unidadDeTrabajoActual } = require('../unidadDeTrabajo');

// Repositorio SQLite de las condiciones del credito aprobado (una por solicitud):
// `{ monto, numeroCuotas, fechaPrimeraCuota, tipoCredito, creadaEn }`. Escribe a traves de la unidad
// de trabajo actual (ver repositorioDecisionesSqlite.js), asi que se confirma junto con la aprobacion.

function hidratar(fila) {
  return {
    monto: fila.monto,
    numeroCuotas: fila.numero_cuotas,
    fechaPrimeraCuota: fila.fecha_primera_cuota,
    tipoCredito: fila.tipo_credito,
    creadaEn: fila.creada_en,
  };
}

const persistidorCondiciones = {
  tipo: 'condiciones',
  orden: 4,
  preparar(db) {
    const insertar = db.prepare(
      `INSERT INTO condiciones_credito
         (solicitud_id, monto, numero_cuotas, fecha_primera_cuota, tipo_credito, creada_en)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const actualizar = db.prepare(
      `UPDATE condiciones_credito
          SET monto = ?, numero_cuotas = ?, fecha_primera_cuota = ?, tipo_credito = ?, creada_en = ?
        WHERE solicitud_id = ?`,
    );
    return {
      insertar(c, solicitudId) {
        insertar.run(solicitudId, c.monto, c.numeroCuotas, c.fechaPrimeraCuota, c.tipoCredito, c.creadaEn);
      },
      actualizar(c, solicitudId) {
        actualizar.run(c.monto, c.numeroCuotas, c.fechaPrimeraCuota, c.tipoCredito, c.creadaEn, solicitudId);
      },
    };
  },
};

function crearRepositorioCondicionesSqlite({ db }) {
  const leerFila = (solicitudId) =>
    db.prepare('SELECT * FROM condiciones_credito WHERE solicitud_id = ?').get(solicitudId);

  return {
    guardarCondiciones(solicitudId, condiciones) {
      const unidad = unidadDeTrabajoActual();
      const registradas = unidad.buscar('condiciones', solicitudId);
      if (registradas) {
        if (registradas !== condiciones) unidad.reemplazar('condiciones', solicitudId, condiciones);
        return;
      }
      const fila = leerFila(solicitudId);
      if (fila) {
        unidad.adjuntarCargada(persistidorCondiciones, solicitudId, condiciones, solicitudId, hidratar(fila));
      } else {
        unidad.adjuntarNueva(persistidorCondiciones, solicitudId, condiciones, solicitudId);
      }
    },

    obtenerCondiciones(solicitudId) {
      const unidad = unidadDeTrabajoActual();
      const registradas = unidad.buscar('condiciones', solicitudId);
      if (registradas) return registradas;
      const fila = leerFila(solicitudId);
      return fila
        ? unidad.adjuntarCargada(persistidorCondiciones, solicitudId, hidratar(fila), solicitudId)
        : undefined;
    },
  };
}

module.exports = { crearRepositorioCondicionesSqlite, persistidorCondiciones };
