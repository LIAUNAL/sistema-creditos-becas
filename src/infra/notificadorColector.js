'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

// D6: notificador colector. Implementa los cuatro metodos del puerto de notificacion (mas
// `notificarDesembolsoVencido`, aditivo, de la Story 5.15); cada
// llamada solo registra el payload en memoria, en el colector del CASO DE USO ACTUAL
// (sincrono, sin tocar la base de datos, sin lanzar para una llamada valida).
//
// Los modulos de negocio se construyen una vez y reciben el notificador en el constructor, asi
// que el aislamiento por caso de uso se hace con AsyncLocalStorage: `ejecutarCasoDeUso` corre la
// operacion con `correrEnContexto(recolectadas, fn)`, y peticiones concurrentes que esperan un
// notificador (await) nunca mezclan sus payloads.
//
// Invocar un metodo FUERA de un caso de uso es un error de programacion: lanza
// NOTIFICADOR_SIN_CONTEXTO en lugar de descartar la notificacion en silencio.

const ROL_COMITE = 'comite_becas';

class ErrorNotificadorSinContexto extends Error {
  constructor(metodo) {
    super(`${metodo} se invoco fuera de un caso de uso: la notificacion se perderia`);
    this.name = 'ErrorNotificadorSinContexto';
    this.codigo = 'NOTIFICADOR_SIN_CONTEXTO';
  }
}

function crearNotificadorColector() {
  const almacen = new AsyncLocalStorage();

  function registrar(metodo, tipo, destinatarioTipo, destinatarioId, payload) {
    const recolectadas = almacen.getStore();
    if (!recolectadas) throw new ErrorNotificadorSinContexto(metodo);
    recolectadas.push({
      tipo,
      destinatarioTipo,
      destinatarioId: String(destinatarioId),
      payload: structuredClone(payload),
    });
  }

  return {
    // Corre `fn` con `recolectadas` (arreglo) como colector del caso de uso actual.
    correrEnContexto(recolectadas, fn) {
      return almacen.run(recolectadas, fn);
    },
    notificarEnvio(payload) {
      registrar('notificarEnvio', 'envio', 'estudiante', payload.estudianteId, payload);
    },
    notificarDecision(payload) {
      registrar('notificarDecision', 'decision', 'estudiante', payload.estudianteId, payload);
    },
    notificarCasoLimitrofe(payload) {
      registrar('notificarCasoLimitrofe', 'caso_limitrofe', 'rol', ROL_COMITE, payload);
    },
    notificarDesembolso(payload) {
      registrar('notificarDesembolso', 'desembolso', 'solicitud', payload.solicitudId, payload);
    },
    // Story 5.15: metodo aditivo (no forma parte del puerto de los modulos de negocio); lo usa el caso de
    // uso de revision de vencidos para dejar el aviso en el outbox junto con el cambio de estado.
    notificarDesembolsoVencido(payload) {
      registrar('notificarDesembolsoVencido', 'desembolso_vencido', 'solicitud', payload.solicitudId, payload);
    },
  };
}

module.exports = { crearNotificadorColector, ErrorNotificadorSinContexto, ROL_COMITE };
