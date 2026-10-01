'use strict';

const { unidadDeTrabajoActual } = require('../unidadDeTrabajo');

// Repositorio SQLite del puerto de documentos. Un documento por (solicitud, tipo): guardar uno
// del mismo tipo reemplaza al anterior conservando su posicion. Escribe a traves de la unidad de
// trabajo actual (ver repositorioSolicitudesSqlite.js).

const clave = (solicitudId, tipo) => JSON.stringify([solicitudId, tipo]);

const hidratar = (fila) => ({ tipo: fila.tipo, nombreArchivo: fila.nombre_archivo });

const persistidorDocumentos = {
  tipo: 'documento',
  orden: 2,
  preparar(db) {
    const insertar = db.prepare(
      'INSERT INTO documentos_solicitud (solicitud_id, tipo, nombre_archivo) VALUES (?, ?, ?)',
    );
    const actualizar = db.prepare(
      'UPDATE documentos_solicitud SET nombre_archivo = ? WHERE solicitud_id = ? AND tipo = ?',
    );
    return {
      insertar(documento, solicitudId) {
        insertar.run(solicitudId, documento.tipo, documento.nombreArchivo);
      },
      actualizar(documento, solicitudId) {
        actualizar.run(documento.nombreArchivo, solicitudId, documento.tipo);
      },
    };
  },
};

function crearRepositorioDocumentosSqlite({ db }) {
  return {
    guardarDocumento(solicitudId, documento) {
      const unidad = unidadDeTrabajoActual();
      const id = clave(solicitudId, documento.tipo);
      const registrado = unidad.buscar('documento', id);
      if (registrado) {
        if (registrado !== documento) unidad.reemplazar('documento', id, documento);
        return;
      }
      const fila = db
        .prepare('SELECT tipo, nombre_archivo FROM documentos_solicitud WHERE solicitud_id = ? AND tipo = ?')
        .get(solicitudId, documento.tipo);
      if (fila) {
        unidad.adjuntarCargada(persistidorDocumentos, id, documento, solicitudId, hidratar(fila));
      } else {
        unidad.adjuntarNueva(persistidorDocumentos, id, documento, solicitudId);
      }
    },

    listarDocumentos(solicitudId) {
      const unidad = unidadDeTrabajoActual();
      const filas = db
        .prepare('SELECT tipo, nombre_archivo FROM documentos_solicitud WHERE solicitud_id = ? ORDER BY id')
        .all(solicitudId);
      const resultado = new Map();
      for (const fila of filas) {
        const id = clave(solicitudId, fila.tipo);
        resultado.set(
          id,
          unidad.buscar('documento', id) ??
            unidad.adjuntarCargada(persistidorDocumentos, id, hidratar(fila), solicitudId),
        );
      }
      for (const entrada of unidad.entidades('documento')) {
        if (entrada.contexto === solicitudId && !resultado.has(entrada.clave)) {
          resultado.set(entrada.clave, entrada.entidad);
        }
      }
      return [...resultado.values()];
    },
  };
}

module.exports = { crearRepositorioDocumentosSqlite, persistidorDocumentos };
