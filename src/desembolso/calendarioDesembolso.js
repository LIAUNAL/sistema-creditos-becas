'use strict';

const { randomUUID } = require('node:crypto');
const { crearRepositorioCalendarioEnMemoria } = require('./repositorioCalendarioEnMemoria');

/**
 * Story 3.1 (Epic 3: Desembolso y seguimiento)
 * "Calendario de desembolso para crédito aprobado"
 *
 * Implementa los dos escenarios de la spec
 * openspec/changes/e3s1-calendario-de-desembolso-para-credito-aprobado/specs/desembolso-y-seguimiento/spec.md
 *
 *   1. Solicitud `aprobada` con monto y número de cuotas -> un desembolso
 *      por cuota, con fecha y monto, en estado `programado`.
 *   2. Monto igual a cero o inválido -> se rechaza la generación y se
 *      registra el error, sin crear desembolsos parciales.
 *
 * Nota técnica de la story: el calendario se genera una sola vez por
 * crédito aprobado; una reaprobación no duplica desembolsos.
 *
 * La fecha de la primera cuota es una entrada (`opciones.fechaPrimeraCuota`);
 * las cuotas siguientes caen cada mes calendario.
 */

const ESTADO_APROBADA = 'aprobada';
const ESTADO_DESEMBOLSO_PROGRAMADO = 'programado';

const FORMATO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

class ErrorGeneracionCalendario extends Error {
  constructor(codigo, motivo, solicitudId) {
    super(`No se pudo generar el calendario de desembolso: ${motivo}`);
    this.name = 'ErrorGeneracionCalendario';
    this.codigo = codigo;
    this.solicitudId = solicitudId;
  }
}

function esNumeroFinito(valor) {
  return typeof valor === 'number' && Number.isFinite(valor);
}

function parsearFecha(texto) {
  const coincidencia = typeof texto === 'string' ? FORMATO_FECHA.exec(texto) : null;
  if (!coincidencia) return undefined;
  const [, anio, mes, dia] = coincidencia.map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  const coincide =
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia;
  return coincide ? { anio, mes: mes - 1, dia } : undefined;
}

/** Fecha ISO (YYYY-MM-DD) `meses` después de la base, ajustando al último día del mes. */
function sumarMeses({ anio, mes, dia }, meses) {
  const ultimoDia = new Date(Date.UTC(anio, mes + meses + 1, 0)).getUTCDate();
  return new Date(Date.UTC(anio, mes + meses, Math.min(dia, ultimoDia)))
    .toISOString()
    .slice(0, 10);
}

/** Reparte el monto en centavos; el residuo va a la última cuota para que la suma sea exacta. */
function repartirMonto(monto, numeroCuotas) {
  const totalCentavos = Math.round(monto * 100);
  const base = Math.floor(totalCentavos / numeroCuotas);
  const montos = Array(numeroCuotas).fill(base);
  montos[numeroCuotas - 1] += totalCentavos - base * numeroCuotas;
  return montos.map((centavos) => centavos / 100);
}

class CalendarioDesembolso {
  /**
   * Todas las opciones son aditivas: sin ellas el calendario vive en memoria, como siempre.
   *
   * @param {object} [dependencias]
   * @param {object} [dependencias.repositorio] puerto de persistencia (ver repositorioCalendarioEnMemoria.js)
   * @param {function(): Date} [dependencias.reloj] hora de los errores registrados
   * @param {number} [dependencias.maximoCuotas] tope del número de cuotas (sin tope por defecto)
   */
  constructor({ repositorio, reloj = () => new Date(), maximoCuotas = Infinity } = {}) {
    this._repositorio = repositorio ?? crearRepositorioCalendarioEnMemoria();
    this._reloj = reloj;
    this._maximoCuotas = maximoCuotas;
  }

  /** Errores de generación registrados (los del repositorio). */
  get errores() {
    return this._repositorio.listarErrores();
  }

  obtenerPorSolicitud(solicitudId) {
    return this._repositorio.obtenerPorSolicitud(solicitudId);
  }

  /**
   * Genera el calendario de desembolso de un crédito aprobado.
   *
   * @param {object} solicitud
   * @param {string} solicitud.id
   * @param {string} solicitud.estado debe ser `aprobada`
   * @param {number} solicitud.monto número finito mayor que cero
   * @param {number} solicitud.numeroCuotas entero mayor que cero
   * @param {object} opciones
   * @param {string} opciones.fechaPrimeraCuota fecha ISO `YYYY-MM-DD`
   * @returns {object[]} los desembolsos programados (los existentes si ya se generó)
   * @throws {ErrorGeneracionCalendario} registrado en `errores`; no crea desembolsos
   */
  generar(solicitud = {}, opciones = {}) {
    const existentes = this._repositorio.obtenerPorSolicitud(solicitud.id);
    if (existentes.length > 0) return existentes;

    const base = this._validar(solicitud, opciones);

    const montos = repartirMonto(solicitud.monto, solicitud.numeroCuotas);
    const desembolsos = montos.map((monto, indice) => ({
      id: randomUUID(),
      solicitudId: solicitud.id,
      numeroCuota: indice + 1,
      fecha: sumarMeses(base, indice),
      monto,
      estado: ESTADO_DESEMBOLSO_PROGRAMADO,
    }));

    this._repositorio.guardar(solicitud.id, desembolsos);
    return desembolsos;
  }

  /** Valida todo antes de crear nada; devuelve la fecha base parseada. */
  _validar(solicitud, opciones) {
    if (solicitud.estado !== ESTADO_APROBADA) {
      this._rechazar('SOLICITUD_NO_APROBADA', `la solicitud no está aprobada (estado "${solicitud.estado}")`, solicitud);
    }
    if (!esNumeroFinito(solicitud.monto) || solicitud.monto <= 0) {
      this._rechazar('MONTO_INVALIDO', 'el monto debe ser un número mayor que cero', solicitud);
    }
    if (!Number.isInteger(solicitud.numeroCuotas) || solicitud.numeroCuotas <= 0) {
      this._rechazar('CUOTAS_INVALIDAS', 'el número de cuotas debe ser un entero mayor que cero', solicitud);
    }
    if (solicitud.numeroCuotas > this._maximoCuotas) {
      this._rechazar('CUOTAS_INVALIDAS', `el número de cuotas no puede superar ${this._maximoCuotas}`, solicitud);
    }
    const base = parsearFecha(opciones.fechaPrimeraCuota);
    if (!base) {
      this._rechazar('FECHA_INVALIDA', 'fechaPrimeraCuota debe ser una fecha ISO YYYY-MM-DD válida', solicitud);
    }
    return base;
  }

  _rechazar(codigo, motivo, solicitud) {
    const error = new ErrorGeneracionCalendario(codigo, motivo, solicitud.id);
    this._repositorio.registrarError({
      solicitudId: solicitud.id,
      codigo,
      mensaje: error.message,
      registradoEn: this._reloj().toISOString(),
    });
    throw error;
  }
}

module.exports = {
  CalendarioDesembolso,
  ErrorGeneracionCalendario,
  ESTADO_DESEMBOLSO_PROGRAMADO,
};
