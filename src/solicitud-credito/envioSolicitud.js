'use strict';

/**
 * Story 1.2 (Epic 1: Solicitud de crédito)
 * "Validación de documentos requeridos antes de enviar a revisión"
 *
 * Extiende el registro de la Story 1.1 sin modificar su comportamiento.
 *
 *   1. Documentos completos -> `borrador` pasa a `pendiente_revision` y se
 *      notifica al estudiante la confirmación de envío.
 *   2. Falta un documento -> se rechaza el envío, se indica cuál falta y la
 *      solicitud permanece en `borrador`.
 *   3. Formato no soportado -> se rechaza el archivo, se solicita un formato
 *      válido y se conservan los documentos ya cargados.
 *
 * Los documentos requeridos, los formatos permitidos y el notificador son
 * entradas configurables / inyectadas (ver supuestos en el change).
 */

const DOCUMENTOS_REQUERIDOS_POR_DEFECTO = Object.freeze([
  'identificacion',
  'certificado_ingresos',
  'certificado_matricula',
]);

const FORMATOS_PERMITIDOS_POR_DEFECTO = Object.freeze(['pdf', 'jpg', 'jpeg', 'png']);

const ESTADO_BORRADOR = 'borrador';
const ESTADO_PENDIENTE_REVISION = 'pendiente_revision';

class ErrorDocumentosFaltantes extends Error {
  constructor(documentosFaltantes) {
    super(`Faltan documentos requeridos: ${documentosFaltantes.join(', ')}`);
    this.name = 'ErrorDocumentosFaltantes';
    this.codigo = 'DOCUMENTOS_FALTANTES';
    this.documentosFaltantes = documentosFaltantes;
  }
}

class ErrorFormatoInvalido extends Error {
  constructor(nombreArchivo, formatosPermitidos) {
    super(
      `Formato no válido para "${nombreArchivo}". Cargue el archivo en un formato válido: ${formatosPermitidos.join(', ')}`
    );
    this.name = 'ErrorFormatoInvalido';
    this.codigo = 'FORMATO_INVALIDO';
    this.nombreArchivo = nombreArchivo;
    this.formatosPermitidos = [...formatosPermitidos];
  }
}

class ErrorEstadoInvalido extends Error {
  constructor(solicitudId, estado) {
    super(
      estado === undefined
        ? `La solicitud ${solicitudId} no existe`
        : `La solicitud ${solicitudId} está en estado "${estado}"; solo se permite en "${ESTADO_BORRADOR}"`
    );
    this.name = 'ErrorEstadoInvalido';
    this.codigo = 'ESTADO_INVALIDO';
    this.solicitudId = solicitudId;
    this.estado = estado;
  }
}

function extensionDe(nombreArchivo) {
  const nombre = String(nombreArchivo ?? '');
  const punto = nombre.lastIndexOf('.');
  return punto < 0 ? '' : nombre.slice(punto + 1).toLowerCase();
}

class EnvioSolicitudCredito {
  /**
   * @param {object} dependencias
   * @param {import('./registroSolicitudCredito').RegistroSolicitudCredito} dependencias.registro
   * @param {{ notificarEnvio: (notificacion: object) => void }} dependencias.notificador puerto de notificación
   * @param {string[]} [dependencias.documentosRequeridos]
   * @param {string[]} [dependencias.formatosPermitidos] extensiones sin punto
   */
  constructor({
    registro,
    notificador,
    documentosRequeridos = DOCUMENTOS_REQUERIDOS_POR_DEFECTO,
    formatosPermitidos = FORMATOS_PERMITIDOS_POR_DEFECTO,
  }) {
    this.registro = registro;
    this._notificador = notificador;
    this._documentosRequeridos = [...documentosRequeridos];
    this._formatosPermitidos = formatosPermitidos.map((f) => f.toLowerCase());
    /** @type {Map<string, Map<string, object>>} solicitudId -> (tipo -> documento) */
    this._documentos = new Map();
  }

  _solicitudEnBorrador(solicitudId) {
    const solicitud = this.registro.obtener(solicitudId);
    if (!solicitud) throw new ErrorEstadoInvalido(solicitudId, undefined);
    if (solicitud.estado !== ESTADO_BORRADOR) {
      throw new ErrorEstadoInvalido(solicitudId, solicitud.estado);
    }
    return solicitud;
  }

  /** @returns {object[]} documentos cargados de la solicitud */
  documentosDe(solicitudId) {
    return [...(this._documentos.get(solicitudId)?.values() ?? [])];
  }

  /**
   * Carga un documento. Un formato no soportado se rechaza sin alterar los
   * documentos ya cargados. Un documento del mismo tipo reemplaza al anterior.
   *
   * @throws {ErrorFormatoInvalido}
   * @throws {ErrorEstadoInvalido}
   */
  adjuntarDocumento(solicitudId, { tipo, nombreArchivo }) {
    this._solicitudEnBorrador(solicitudId);

    if (!this._formatosPermitidos.includes(extensionDe(nombreArchivo))) {
      throw new ErrorFormatoInvalido(nombreArchivo, this._formatosPermitidos);
    }

    const documento = { tipo, nombreArchivo };
    if (!this._documentos.has(solicitudId)) this._documentos.set(solicitudId, new Map());
    this._documentos.get(solicitudId).set(tipo, documento);
    return documento;
  }

  /**
   * Confirma el envío a revisión.
   *
   * @returns {object} la solicitud en estado `pendiente_revision`
   * @throws {ErrorDocumentosFaltantes} si falta algún documento requerido
   * @throws {ErrorEstadoInvalido}
   */
  confirmarEnvio(solicitudId) {
    const solicitud = this._solicitudEnBorrador(solicitudId);

    const cargados = this._documentos.get(solicitudId) ?? new Map();
    const faltantes = this._documentosRequeridos.filter((tipo) => !cargados.has(tipo));
    if (faltantes.length > 0) {
      throw new ErrorDocumentosFaltantes(faltantes);
    }

    solicitud.estado = ESTADO_PENDIENTE_REVISION;
    this._notificador.notificarEnvio({
      estudianteId: solicitud.estudianteId,
      solicitudId: solicitud.id,
      estado: solicitud.estado,
    });
    return solicitud;
  }
}

module.exports = {
  EnvioSolicitudCredito,
  ErrorDocumentosFaltantes,
  ErrorFormatoInvalido,
  ErrorEstadoInvalido,
  DOCUMENTOS_REQUERIDOS_POR_DEFECTO,
  FORMATOS_PERMITIDOS_POR_DEFECTO,
};
