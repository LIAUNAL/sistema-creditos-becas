'use strict';

/**
 * Puerto de persistencia del calendario de desembolso (Story 5.10) y su implementacion en memoria,
 * que es la de por defecto de `CalendarioDesembolso` (mismo comportamiento que antes del puerto).
 *
 *   guardar(solicitudId, desembolsos)  registra (o reemplaza) las cuotas de una solicitud
 *   obtenerPorSolicitud(solicitudId)   cuotas por numero de cuota; `[]` si no hay calendario
 *   obtenerPorId(id)                   la cuota con ese id, o `undefined`
 *   listarTodos()                    todas las cuotas
 *   listarPorEstado(estado)            las cuotas en ese estado
 *   registrarError(error)              anexa un error de generacion `{ solicitudId, codigo, mensaje, registradoEn }`
 *   listarErrores()                    los errores registrados, en orden
 */
const porNumeroDeCuota = (a, b) => a.numeroCuota - b.numeroCuota;

function crearRepositorioCalendarioEnMemoria() {
  /** @type {Map<string, object[]>} */
  const desembolsos = new Map();
  /** @type {object[]} */
  const errores = [];

  return {
    guardar(solicitudId, cuotas) {
      desembolsos.set(solicitudId, [...cuotas].sort(porNumeroDeCuota));
    },
    obtenerPorSolicitud: (solicitudId) => desembolsos.get(solicitudId) ?? [],
    obtenerPorId: (id) => [...desembolsos.values()].flat().find((d) => d.id === id),
    listarTodos: () => [...desembolsos.values()].flat(),
    listarPorEstado(estado) {
      return [...desembolsos.values()].flat().filter((d) => d.estado === estado);
    },
    registrarError(error) {
      errores.push(error);
    },
    listarErrores: () => errores,
  };
}

module.exports = { crearRepositorioCalendarioEnMemoria };
