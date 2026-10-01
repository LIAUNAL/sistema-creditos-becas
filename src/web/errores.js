'use strict';

/**
 * Mapeo de errores de módulo a respuestas HTTP.
 *
 * Los módulos de src/ lanzan errores con una propiedad `.codigo` (cadena).
 * Esta tabla traduce cada código a un estado HTTP. Para extenderla basta con
 * agregar una entrada; un código ausente de la tabla responde 500.
 *
 * Nota sobre ambigüedad: un mismo código puede cubrir situaciones distintas.
 * `ESTADO_INVALIDO` de envioSolicitud cubre tanto "la solicitud no existe"
 * como "la solicitud está en un estado que no permite la operación". Aquí se
 * mapea de forma conservadora a 409 (conflicto). La capa de persistencia, que
 * sí distingue ambos casos, debe lanzar un error propio de la capa web
 * (con `estadoHttp: 404`) cuando la solicitud no exista, en lugar de depender
 * de este código.
 */
const ESTADOS_POR_CODIGO = Object.freeze({
  // Entradas inválidas o incompletas
  CAMPOS_FALTANTES: 400,
  DOCUMENTOS_FALTANTES: 400,
  FORMATO_INVALIDO: 400,
  MOTIVO_RECHAZO_REQUERIDO: 400,
  ASESOR_REQUERIDO: 400,
  DECISION_INVALIDA: 400,
  MONTO_INVALIDO: 400,
  CUOTAS_INVALIDAS: 400,
  FECHA_INVALIDA: 400,

  // Acceso a datos ajenos
  EVALUACION_AJENA: 403,

  // Recurso no disponible
  EVALUACION_NO_DISPONIBLE: 404,

  // Conflictos con el estado actual del recurso
  SOLICITUD_EXISTENTE: 409,
  ESTADO_INVALIDO: 409,
  SOLICITUD_NO_EN_REVISION: 409,
  SOLICITUD_NO_APROBADA: 409,
  CASO_NO_EN_COLA: 409,
  DESEMBOLSO_NO_PROGRAMADO: 409,
});

const ERROR_INTERNO = Object.freeze({
  estado: 500,
  cuerpo: Object.freeze({ codigo: 'ERROR_INTERNO' }),
});

/**
 * Convierte un valor lanzado en `{ estado, cuerpo }`.
 * El cuerpo solo incluye el código público; nunca el mensaje ni la traza.
 */
function mapearError(error) {
  if (error === null || typeof error !== 'object') {
    return { ...ERROR_INTERNO };
  }
  const { codigo, estadoHttp } = error;
  if (typeof codigo === 'string') {
    if (Number.isInteger(estadoHttp) && estadoHttp >= 400 && estadoHttp < 500) {
      return { estado: estadoHttp, cuerpo: { codigo } };
    }
    if (Object.hasOwn(ESTADOS_POR_CODIGO, codigo)) {
      return { estado: ESTADOS_POR_CODIGO[codigo], cuerpo: { codigo } };
    }
  }
  return { ...ERROR_INTERNO };
}

module.exports = { ESTADOS_POR_CODIGO, mapearError };
