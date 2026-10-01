'use strict';

const { unidadDeTrabajoActual } = require('../unidadDeTrabajo');
const { ESTADOS_ACTIVOS } = require('../../solicitud-credito/repositoriosEnMemoria');

// Repositorio SQLite del puerto de solicitudes (ver solicitud-credito/repositoriosEnMemoria.js).
// Lee y escribe a traves de la unidad de trabajo ACTUAL (mapa de identidad + volcado): `guardar`
// y las mutaciones de los objetos obtenidos se escriben en `volcar`, no al instante.
//
// Las listas combinan las filas de la base con lo que la unidad ya tiene en memoria (nuevo o
// modificado sin volcar) y filtran sobre el estado en memoria, de modo que dentro de un caso de
// uso se lee lo propio aunque aun no este confirmado.

function separarDatos(solicitud) {
  const { id, estudianteId, periodoAcademico, estado, creadaEn, ...resto } = solicitud;
  if (typeof creadaEn !== 'string' || creadaEn === '') {
    throw new TypeError(`La solicitud ${id} requiere creadaEn (texto ISO) para persistirse`);
  }
  return { id, estudianteId, periodoAcademico, estado, creadaEn, datos: JSON.stringify(resto) };
}

function hidratar(fila) {
  return {
    id: fila.id,
    estudianteId: fila.estudiante_id,
    periodoAcademico: fila.periodo_academico,
    estado: fila.estado,
    ...JSON.parse(fila.datos),
    creadaEn: fila.creada_en,
  };
}

const persistidorSolicitudes = {
  tipo: 'solicitud',
  orden: 1,
  preparar(db) {
    const insertar = db.prepare(
      `INSERT INTO solicitudes (id, estudiante_id, periodo_academico, estado, datos, creada_en)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const actualizar = db.prepare(
      `UPDATE solicitudes
          SET estudiante_id = ?, periodo_academico = ?, estado = ?, datos = ?, creada_en = ?
        WHERE id = ?`,
    );
    return {
      insertar(solicitud) {
        const f = separarDatos(solicitud);
        insertar.run(f.id, f.estudianteId, f.periodoAcademico, f.estado, f.datos, f.creadaEn);
      },
      actualizar(solicitud) {
        const f = separarDatos(solicitud);
        actualizar.run(f.estudianteId, f.periodoAcademico, f.estado, f.datos, f.creadaEn, f.id);
      },
    };
  },
};

function crearRepositorioSolicitudesSqlite({ db }) {
  // Instancia de la unidad para una fila: la ya registrada o, si no, una hidratada y registrada.
  function materializar(unidad, fila) {
    return (
      unidad.buscar('solicitud', fila.id) ??
      unidad.adjuntarCargada(persistidorSolicitudes, fila.id, hidratar(fila))
    );
  }

  // Candidatas = filas que cumplen el filtro en la base + todo lo registrado en la unidad;
  // el predicado final se evalua sobre el estado en memoria.
  function listar(condicionSql, parametros, predicado) {
    const unidad = unidadDeTrabajoActual();
    const filas = db
      .prepare(`SELECT * FROM solicitudes ${condicionSql} ORDER BY rowid`)
      .all(...parametros);
    const candidatas = new Map();
    for (const fila of filas) candidatas.set(fila.id, materializar(unidad, fila));
    for (const entrada of unidad.entidades('solicitud')) {
      if (!candidatas.has(entrada.clave)) candidatas.set(entrada.clave, entrada.entidad);
    }
    return [...candidatas.values()].filter(predicado);
  }

  return {
    guardar(solicitud) {
      const unidad = unidadDeTrabajoActual();
      separarDatos(solicitud); // valida antes de registrar
      const registrada = unidad.buscar('solicitud', solicitud.id);
      if (registrada) {
        if (registrada !== solicitud) unidad.reemplazar('solicitud', solicitud.id, solicitud);
        return;
      }
      const fila = db.prepare('SELECT * FROM solicitudes WHERE id = ?').get(solicitud.id);
      if (fila) {
        unidad.adjuntarCargada(persistidorSolicitudes, solicitud.id, solicitud, null, hidratar(fila));
      } else {
        unidad.adjuntarNueva(persistidorSolicitudes, solicitud.id, solicitud);
      }
    },

    obtener(id) {
      const unidad = unidadDeTrabajoActual();
      const registrada = unidad.buscar('solicitud', id);
      if (registrada) return registrada;
      const fila = db.prepare('SELECT * FROM solicitudes WHERE id = ?').get(id);
      return fila ? materializar(unidad, fila) : undefined;
    },

    buscarActivaPorEstudianteYPeriodo(estudianteId, periodoAcademico) {
      return listar(
        'WHERE estudiante_id = ? AND periodo_academico = ?',
        [estudianteId, periodoAcademico],
        (s) =>
          s.estudianteId === estudianteId &&
          s.periodoAcademico === periodoAcademico &&
          ESTADOS_ACTIVOS.has(s.estado),
      )[0];
    },

    listarPorEstudiante(estudianteId) {
      return listar('WHERE estudiante_id = ?', [estudianteId], (s) => s.estudianteId === estudianteId);
    },

    listarPorEstado(estado) {
      return listar('WHERE estado = ?', [estado], (s) => s.estado === estado);
    },

    listarTodas() {
      return listar('', [], () => true);
    },
  };
}

module.exports = { crearRepositorioSolicitudesSqlite, persistidorSolicitudes };
