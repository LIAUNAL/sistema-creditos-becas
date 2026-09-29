'use strict';

const { randomUUID } = require('node:crypto');

/**
 * Story 1.1 (Epic 1: Solicitud de crédito)
 * "Registro de solicitud de crédito con datos socioeconómicos"
 *
 * Implementa los tres criterios de aceptación de la spec
 * openspec/changes/e1s1-registro-de-solicitud-de-credito-con-datos-socio/specs/solicitud-de-credito/spec.md
 *
 *   1. Formulario completo -> crea la solicitud en estado `borrador`,
 *      con id único, asociada al estudiante.
 *   2. Segunda solicitud para el mismo periodo académico mientras hay
 *      una activa -> se rechaza y se devuelve el estado de la existente.
 *   3. Campos socioeconómicos obligatorios vacíos -> se bloquea el envío
 *      y se listan los campos faltantes.
 */

const CAMPOS_SOCIOECONOMICOS_OBLIGATORIOS = [
  'ingresosHogar',
  'numeroDependientes',
  'estrato',
  'ocupacionAcudiente',
];

const CAMPOS_IDENTIDAD_OBLIGATORIOS = ['estudianteId', 'periodoAcademico'];

const ESTADOS_ACTIVOS = new Set(['borrador', 'enviada', 'en_revision', 'aprobada']);

class ErrorCamposFaltantes extends Error {
  constructor(camposFaltantes) {
    super(`Faltan campos obligatorios: ${camposFaltantes.join(', ')}`);
    this.name = 'ErrorCamposFaltantes';
    this.codigo = 'CAMPOS_FALTANTES';
    this.camposFaltantes = camposFaltantes;
  }
}

class ErrorSolicitudExistente extends Error {
  constructor(solicitudExistente) {
    super(
      `Ya existe una solicitud activa (${solicitudExistente.id}) para el periodo ${solicitudExistente.periodoAcademico} en estado "${solicitudExistente.estado}"`
    );
    this.name = 'ErrorSolicitudExistente';
    this.codigo = 'SOLICITUD_EXISTENTE';
    this.solicitudExistente = solicitudExistente;
  }
}

function esVacio(valor) {
  return valor === undefined || valor === null || valor === '';
}

/**
 * Recorre los datos recibidos y devuelve la lista de campos obligatorios
 * (identidad + socioeconómicos) que llegaron vacíos o ausentes.
 */
function camposFaltantesEn(datos) {
  const todos = [...CAMPOS_IDENTIDAD_OBLIGATORIOS, ...CAMPOS_SOCIOECONOMICOS_OBLIGATORIOS];
  return todos.filter((campo) => esVacio(datos[campo]));
}

class RegistroSolicitudCredito {
  constructor() {
    /** @type {Map<string, object>} id -> solicitud */
    this._solicitudes = new Map();
  }

  /**
   * @returns {object[]} solicitudes activas del estudiante para el periodo dado
   */
  buscarActivaPorEstudianteYPeriodo(estudianteId, periodoAcademico) {
    for (const solicitud of this._solicitudes.values()) {
      if (
        solicitud.estudianteId === estudianteId &&
        solicitud.periodoAcademico === periodoAcademico &&
        ESTADOS_ACTIVOS.has(solicitud.estado)
      ) {
        return solicitud;
      }
    }
    return undefined;
  }

  /**
   * Crea una solicitud de crédito con datos socioeconómicos.
   *
   * @param {object} datos
   * @param {string} datos.estudianteId
   * @param {string} datos.periodoAcademico
   * @param {number} datos.ingresosHogar
   * @param {number} datos.numeroDependientes
   * @param {string|number} datos.estrato
   * @param {string} datos.ocupacionAcudiente
   * @returns {object} la solicitud creada
   * @throws {ErrorCamposFaltantes} si faltan campos socioeconómicos obligatorios
   * @throws {ErrorSolicitudExistente} si el estudiante ya tiene una solicitud activa en ese periodo
   */
  crear(datos = {}) {
    const camposFaltantes = camposFaltantesEn(datos);
    if (camposFaltantes.length > 0) {
      throw new ErrorCamposFaltantes(camposFaltantes);
    }

    const existente = this.buscarActivaPorEstudianteYPeriodo(
      datos.estudianteId,
      datos.periodoAcademico
    );
    if (existente) {
      throw new ErrorSolicitudExistente(existente);
    }

    const solicitud = {
      id: randomUUID(),
      estudianteId: datos.estudianteId,
      periodoAcademico: datos.periodoAcademico,
      estado: 'borrador',
      ingresosHogar: datos.ingresosHogar,
      numeroDependientes: datos.numeroDependientes,
      estrato: datos.estrato,
      ocupacionAcudiente: datos.ocupacionAcudiente,
      creadaEn: new Date().toISOString(),
    };

    this._solicitudes.set(solicitud.id, solicitud);
    return solicitud;
  }

  obtener(id) {
    return this._solicitudes.get(id);
  }
}

module.exports = {
  RegistroSolicitudCredito,
  ErrorCamposFaltantes,
  ErrorSolicitudExistente,
  CAMPOS_SOCIOECONOMICOS_OBLIGATORIOS,
  CAMPOS_IDENTIDAD_OBLIGATORIOS,
};
