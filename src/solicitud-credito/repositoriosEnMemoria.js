'use strict';

/**
 * Story 5.7 (Epic 5: Aplicación web): puertos de persistencia de los módulos de
 * solicitud de crédito y su implementación POR DEFECTO en memoria.
 *
 * La implementación en memoria reproduce exactamente lo que hacían los `Map`
 * privados de los módulos: guarda y devuelve el MISMO objeto (referencia viva),
 * sin copias, de modo que el comportamiento previo no cambia.
 *
 * Puerto de solicitudes
 *   guardar(solicitud)
 *   obtener(id)                                  -> solicitud | undefined
 *   buscarActivaPorEstudianteYPeriodo(estudianteId, periodoAcademico)
 *   listarPorEstudiante(estudianteId)            -> solicitud[] (orden de creación)
 *   listarPorEstado(estado)                      -> solicitud[]
 *   listarTodas()                                -> solicitud[]
 *
 * Puerto de documentos (envío)
 *   guardarDocumento(solicitudId, { tipo, nombreArchivo })   (reemplaza el del mismo tipo)
 *   listarDocumentos(solicitudId)                -> documento[]
 *
 * Puerto de decisiones (asesor)
 *   guardarDecision(solicitudId, { tipo, asesorId, fecha: Date, motivo? })
 *   obtenerDecision(solicitudId)                 -> decisión | undefined
 */

const ESTADOS_ACTIVOS = new Set(['borrador', 'enviada', 'pendiente_revision', 'en_revision', 'aprobada']);

function crearRepositorioSolicitudesEnMemoria() {
  /** @type {Map<string, object>} id -> solicitud */
  const solicitudes = new Map();

  const filtrar = (predicado) => [...solicitudes.values()].filter(predicado);

  return {
    guardar(solicitud) {
      solicitudes.set(solicitud.id, solicitud);
    },
    obtener(id) {
      return solicitudes.get(id);
    },
    buscarActivaPorEstudianteYPeriodo(estudianteId, periodoAcademico) {
      return filtrar(
        (s) =>
          s.estudianteId === estudianteId &&
          s.periodoAcademico === periodoAcademico &&
          ESTADOS_ACTIVOS.has(s.estado),
      )[0];
    },
    listarPorEstudiante(estudianteId) {
      return filtrar((s) => s.estudianteId === estudianteId);
    },
    listarPorEstado(estado) {
      return filtrar((s) => s.estado === estado);
    },
    listarTodas() {
      return filtrar(() => true);
    },
  };
}

function crearRepositorioDocumentosEnMemoria() {
  /** @type {Map<string, Map<string, object>>} solicitudId -> (tipo -> documento) */
  const documentos = new Map();

  return {
    guardarDocumento(solicitudId, documento) {
      if (!documentos.has(solicitudId)) documentos.set(solicitudId, new Map());
      documentos.get(solicitudId).set(documento.tipo, documento);
    },
    listarDocumentos(solicitudId) {
      return [...(documentos.get(solicitudId)?.values() ?? [])];
    },
  };
}

function crearRepositorioDecisionesEnMemoria() {
  /** @type {Map<string, object>} solicitudId -> decisión */
  const decisiones = new Map();

  return {
    guardarDecision(solicitudId, decision) {
      decisiones.set(solicitudId, decision);
    },
    obtenerDecision(solicitudId) {
      return decisiones.get(solicitudId);
    },
  };
}

module.exports = {
  ESTADOS_ACTIVOS,
  crearRepositorioSolicitudesEnMemoria,
  crearRepositorioDocumentosEnMemoria,
  crearRepositorioDecisionesEnMemoria,
};
