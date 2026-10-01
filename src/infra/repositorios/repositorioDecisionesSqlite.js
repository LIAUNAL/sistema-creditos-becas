'use strict';

const { unidadDeTrabajoActual } = require('../unidadDeTrabajo');

// Repositorio SQLite del puerto de decisiones (una por solicitud). La fecha se guarda como ISO y
// se rehidrata a Date, que es el tipo que usa el modulo. `motivo` solo existe en los rechazos.
// Escribe a traves de la unidad de trabajo actual (ver repositorioSolicitudesSqlite.js).

const aIso = (fecha) => (fecha instanceof Date ? fecha.toISOString() : new Date(fecha).toISOString());

function hidratar(fila) {
  const decision = { tipo: fila.tipo, asesorId: fila.asesor_id, fecha: new Date(fila.fecha) };
  if (fila.motivo !== null) decision.motivo = fila.motivo;
  return decision;
}

const persistidorDecisiones = {
  tipo: 'decision',
  orden: 3,
  preparar(db) {
    const insertar = db.prepare(
      'INSERT INTO decisiones_solicitud (solicitud_id, tipo, asesor_id, fecha, motivo) VALUES (?, ?, ?, ?, ?)',
    );
    const actualizar = db.prepare(
      'UPDATE decisiones_solicitud SET tipo = ?, asesor_id = ?, fecha = ?, motivo = ? WHERE solicitud_id = ?',
    );
    return {
      insertar(decision, solicitudId) {
        insertar.run(solicitudId, decision.tipo, decision.asesorId, aIso(decision.fecha), decision.motivo ?? null);
      },
      actualizar(decision, solicitudId) {
        actualizar.run(decision.tipo, decision.asesorId, aIso(decision.fecha), decision.motivo ?? null, solicitudId);
      },
    };
  },
};

function crearRepositorioDecisionesSqlite({ db }) {
  const leerFila = (solicitudId) =>
    db.prepare('SELECT * FROM decisiones_solicitud WHERE solicitud_id = ?').get(solicitudId);

  return {
    guardarDecision(solicitudId, decision) {
      const unidad = unidadDeTrabajoActual();
      const registrada = unidad.buscar('decision', solicitudId);
      if (registrada) {
        if (registrada !== decision) unidad.reemplazar('decision', solicitudId, decision);
        return;
      }
      const fila = leerFila(solicitudId);
      if (fila) {
        unidad.adjuntarCargada(persistidorDecisiones, solicitudId, decision, solicitudId, hidratar(fila));
      } else {
        unidad.adjuntarNueva(persistidorDecisiones, solicitudId, decision, solicitudId);
      }
    },

    obtenerDecision(solicitudId) {
      const unidad = unidadDeTrabajoActual();
      const registrada = unidad.buscar('decision', solicitudId);
      if (registrada) return registrada;
      const fila = leerFila(solicitudId);
      return fila
        ? unidad.adjuntarCargada(persistidorDecisiones, solicitudId, hidratar(fila), solicitudId)
        : undefined;
    },
  };
}

module.exports = { crearRepositorioDecisionesSqlite, persistidorDecisiones };
