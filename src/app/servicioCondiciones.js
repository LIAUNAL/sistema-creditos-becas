'use strict';

const { ejecutarCasoDeUso } = require('../infra/casoDeUso');
const { crearUnidadDeTrabajo } = require('../infra/unidadDeTrabajo');
const { ErrorSolicitudNoEnRevision } = require('../solicitud-credito/decisionAsesor');
const { ErrorSolicitudNoEncontrada } = require('./servicioSolicitudes');
const { ErrorRolNoPermitido, ErrorDecisionNoPermitida } = require('./servicioAsesor');

// Story 5.10 (P10): aprobacion con condiciones del credito y generacion del calendario de desembolso.
//
// Orden (decision de diseno): los terminos se VALIDAN ANTES de comprometer la aprobacion.
//   1. `calendario.generar` con una copia candidata de la solicitud (`estado: 'aprobada'`): lanza si
//      los terminos son invalidos y en ese caso no crea nada.
//   2. `decision.aprobar` sobre la solicitud real.
//   3. se guardan las condiciones; la auditoria `aprobar` se escribe en `persistir`.
// El caso de uso corre con `confirmarSiError: false`: estado, decision, condiciones, calendario,
// auditoria y outbox se confirman en UNA transaccion o no se confirma nada. Si los terminos son
// invalidos, el error de generacion ya quedo en `calendar_errors` (el repositorio lo escribe en su
// propia transaccion, que no se revierte con la del caso de uso).

const TIPO_RECURSO = 'solicitud_credito';
const ESTADO_PENDIENTE_REVISION = 'pendiente_revision';
const ESTADO_APROBADA = 'aprobada';

// El sistema aun no captura el tipo de credito (puente F4 del plan): todo credito aprobado se copia a
// sus desembolsos como `credito`. Cuando exista el dato en la solicitud, se lee de ahi.
const TIPO_CREDITO_POR_DEFECTO = 'credito';
const MAXIMO_CUOTAS = 120;

// Solo se aceptan numeros en texto plano (monto con hasta 2 decimales: las cuotas se reparten en
// centavos). Lo demas llega al calendario como NaN y se rechaza con su codigo de error.
const FORMATO_MONTO = /^\d{1,12}(\.\d{1,2})?$/;
const FORMATO_CUOTAS = /^\d{1,6}$/;

const aNumero = (valor, formato) => {
  const texto = String(valor ?? '').trim();
  return formato.test(texto) ? Number(texto) : Number.NaN;
};

function crearServicioCondiciones({ db, reloj, colector, registro, decision, calendario, repositorios, asignaciones, auditoria }) {
  const caso = (operacion, persistir) =>
    ejecutarCasoDeUso({
      db,
      colector,
      reloj,
      unidadDeTrabajo: crearUnidadDeTrabajo(),
      confirmarSiError: false,
      operacion,
      persistir,
    });

  return {
    // Solo el asesor ASIGNADO a la solicitud: otro asesor (o una sin reclamar) recibe 403; una
    // inexistente o en borrador, 404; una ya decidida, 409 sin tocar el calendario.
    async aprobarConCondiciones(usuario, solicitudId, terminos = {}) {
      if (usuario?.rol !== 'asesor_financiero') throw new ErrorRolNoPermitido('asesor_financiero');
      const monto = aNumero(terminos.monto, FORMATO_MONTO);
      const numeroCuotas = aNumero(terminos.numeroCuotas, FORMATO_CUOTAS);
      const fechaPrimeraCuota = String(terminos.fechaPrimeraCuota ?? '').trim();

      return caso(
        () => {
          const solicitud = registro.obtener(solicitudId);
          if (!solicitud || solicitud.estado === 'borrador') throw new ErrorSolicitudNoEncontrada(solicitudId);
          if (!asignaciones.estaAsignado(usuario.id, TIPO_RECURSO, solicitudId)) {
            throw new ErrorDecisionNoPermitida(solicitudId);
          }
          if (solicitud.estado !== ESTADO_PENDIENTE_REVISION) {
            throw new ErrorSolicitudNoEnRevision(solicitudId, solicitud.estado);
          }

          const desembolsos = calendario.generar(
            { ...solicitud, estado: ESTADO_APROBADA, monto, numeroCuotas },
            { fechaPrimeraCuota },
          );
          for (const desembolso of desembolsos) {
            desembolso.periodoAcademico = solicitud.periodoAcademico;
            desembolso.tipoCredito = TIPO_CREDITO_POR_DEFECTO;
          }

          const aprobada = decision.aprobar(solicitudId, { asesorId: String(usuario.id) });
          repositorios.condiciones.guardarCondiciones(solicitudId, {
            monto,
            numeroCuotas,
            fechaPrimeraCuota,
            tipoCredito: TIPO_CREDITO_POR_DEFECTO,
            creadaEn: reloj.ahora().toISOString(),
          });
          return { id: aprobada.id, estado: aprobada.estado, desembolsos: desembolsos.length };
        },
        ({ error }) => {
          if (error) return;
          auditoria.registrar({
            actor: usuario.nombre_usuario,
            rol: usuario.rol,
            accion: 'aprobar',
            objetivo: `${TIPO_RECURSO}:${solicitudId}`,
            detalle: { monto, numeroCuotas, fechaPrimeraCuota },
          });
        },
      );
    },
  };
}

module.exports = { crearServicioCondiciones, TIPO_CREDITO_POR_DEFECTO, MAXIMO_CUOTAS };
