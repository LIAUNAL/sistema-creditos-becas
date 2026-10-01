'use strict';

const { ejecutarCasoDeUso } = require('../infra/casoDeUso');
const { crearUnidadDeTrabajo } = require('../infra/unidadDeTrabajo');
const { ErrorDatosInvalidos, ErrorSolicitudNoEncontrada } = require('./servicioSolicitudes');

// Casos de uso del asesor financiero (Story 5.9) y la lectura de direccion academica.
// Cada uno corre en `ejecutarCasoDeUso` con su propia unidad de trabajo. La auditoria de las
// escrituras (`asignar`, `rechazar`) se registra en el callback `persistir`, que corre DENTRO de la
// misma transaccion que el estado, la decision y el outbox: si algo falla, no se confirma nada.
// La aprobacion (condiciones del prestamo y calendario) llega en la siguiente slice (P10).

const TIPO_RECURSO = 'solicitud_credito';
const ESTADO_PENDIENTE_REVISION = 'pendiente_revision';
const MAX_MOTIVO = 1000;

class ErrorRolNoPermitido extends Error {
  constructor(rol) {
    super(`Solo el rol ${rol} puede realizar esta operación`);
    this.name = 'ErrorRolNoPermitido';
    this.codigo = 'ROL_NO_PERMITIDO';
    this.estadoHttp = 403;
  }
}

// La solicitud existe pero la tiene otro asesor (o aun nadie): la decision no le corresponde.
class ErrorDecisionNoPermitida extends Error {
  constructor(solicitudId) {
    super(`La solicitud ${solicitudId} no está asignada a este asesor`);
    this.name = 'ErrorDecisionNoPermitida';
    this.codigo = 'SOLICITUD_NO_ASIGNADA';
    this.estadoHttp = 403;
  }
}

class ErrorSolicitudNoReclamable extends Error {
  constructor(solicitudId, estado) {
    super(`La solicitud ${solicitudId} está en estado "${estado}" y no se puede reclamar`);
    this.name = 'ErrorSolicitudNoReclamable';
    this.codigo = 'SOLICITUD_NO_EN_REVISION';
    this.estadoHttp = 409;
  }
}

function validarMotivo(motivo) {
  const texto = String(motivo ?? '').trim();
  if (texto === '') throw new ErrorDatosInvalidos({ motivo: 'Indique el motivo del rechazo.' });
  if (texto.length > MAX_MOTIVO) {
    throw new ErrorDatosInvalidos({ motivo: `El motivo admite hasta ${MAX_MOTIVO} caracteres.` });
  }
  return texto;
}

const aIso = (fecha) => (fecha instanceof Date ? fecha.toISOString() : String(fecha));

function crearServicioAsesor({ db, reloj, colector, registro, envio, decision, repositorios, asignaciones, auditoria }) {
  const caso = (operacion, persistir) =>
    ejecutarCasoDeUso({ db, colector, reloj, unidadDeTrabajo: crearUnidadDeTrabajo(), operacion, persistir });

  function exigirAsesor(usuario) {
    if (usuario?.rol !== 'asesor_financiero') throw new ErrorRolNoPermitido('asesor_financiero');
  }

  const esMia = (usuario, solicitudId) => asignaciones.estaAsignado(usuario.id, TIPO_RECURSO, solicitudId);

  return {
    // Pendientes de revision sin asignar y las asignadas a quien consulta. Sin datos socioeconomicos:
    // una solicitud libre solo se puede revisar en detalle despues de reclamarla.
    async listarCola(usuario) {
      exigirAsesor(usuario);
      return caso(() =>
        repositorios.solicitudes.listarPorEstado(ESTADO_PENDIENTE_REVISION).flatMap((solicitud) => {
          const asignados = asignaciones.listarPorRecurso(TIPO_RECURSO, solicitud.id);
          const mia = asignados.some((a) => String(a.usuarioId) === String(usuario.id));
          if (asignados.length > 0 && !mia) return [];
          return [
            {
              id: solicitud.id,
              periodoAcademico: solicitud.periodoAcademico,
              estado: solicitud.estado,
              creadaEn: solicitud.creadaEn,
              asignadaAMi: mia,
            },
          ];
        }),
      );
    },

    // La asignacion (y su entrada `asignar` en audit_log) se escribe en la transaccion del caso de uso.
    async reclamar(usuario, solicitudId) {
      exigirAsesor(usuario);
      return caso(
        () => {
          const solicitud = registro.obtener(solicitudId);
          if (!solicitud || solicitud.estado === 'borrador') throw new ErrorSolicitudNoEncontrada(solicitudId);
          if (solicitud.estado !== ESTADO_PENDIENTE_REVISION) {
            throw new ErrorSolicitudNoReclamable(solicitudId, solicitud.estado);
          }
          return { id: solicitud.id };
        },
        ({ error }) => {
          if (!error) asignaciones.reclamar({ solicitudId, usuario });
        },
      );
    },

    // `undefined` si no existe, no esta asignada a quien consulta o aun no la reclamo (404 en la web).
    async obtenerParaAsesor(usuario, solicitudId) {
      exigirAsesor(usuario);
      return caso(() => {
        const solicitud = registro.obtener(solicitudId);
        if (!solicitud || !esMia(usuario, solicitudId)) return undefined;
        const registrada = repositorios.decisiones.obtenerDecision(solicitudId);
        return {
          solicitud: { ...solicitud },
          documentos: envio.documentosDe(solicitudId).map((d) => ({ ...d })),
          decision: registrada
            ? { tipo: registrada.tipo, fecha: aIso(registrada.fecha), motivo: registrada.motivo ?? null }
            : null,
        };
      });
    },

    // El motivo es obligatorio: sin el se lanza DATOS_INVALIDOS (400) y la solicitud no cambia.
    async rechazar(usuario, solicitudId, { motivo } = {}) {
      exigirAsesor(usuario);
      let motivoValido;
      return caso(
        () => {
          const solicitud = registro.obtener(solicitudId);
          // Un borrador no es visible para los asesores: no se revela que existe.
          if (!solicitud || solicitud.estado === 'borrador') throw new ErrorSolicitudNoEncontrada(solicitudId);
          if (!esMia(usuario, solicitudId)) throw new ErrorDecisionNoPermitida(solicitudId);
          // Despues de autorizar: otro asesor recibe 403 aunque el motivo falte. Sin motivo valido
          // se lanza DATOS_INVALIDOS antes de tocar la solicitud, asi que el estado no cambia.
          motivoValido = validarMotivo(motivo);
          const decidida = decision.rechazar(solicitudId, { asesorId: String(usuario.id), motivo: motivoValido });
          return { id: decidida.id, estado: decidida.estado };
        },
        ({ error }) => {
          if (error) return;
          auditoria.registrar({
            actor: usuario.nombre_usuario,
            rol: usuario.rol,
            accion: 'rechazar',
            objetivo: `${TIPO_RECURSO}:${solicitudId}`,
            detalle: { motivo: motivoValido },
          });
        },
      );
    },
  };
}

/**
 * Lectura de solo consulta para direccion academica: resumen de la solicitud SIN campos
 * socioeconomicos (NFR-003). Se arma con una lista blanca y ademas pasa por `proyectarSolicitud`.
 */
function crearServicioDireccion({ db, reloj, colector, registro, repositorios, politicas }) {
  const caso = (operacion) =>
    ejecutarCasoDeUso({ db, colector, reloj, unidadDeTrabajo: crearUnidadDeTrabajo(), operacion });

  return {
    // `undefined` si no existe o la politica no permite abrirla: el llamador responde 404.
    async obtenerResumen(usuario, solicitudId) {
      if (usuario?.rol !== 'direccion_academica') throw new ErrorRolNoPermitido('direccion_academica');
      return caso(() => {
        const solicitud = registro.obtener(solicitudId);
        if (!solicitud || !politicas.puedeVerSolicitud(usuario, solicitud)) return undefined;
        const registrada = repositorios.decisiones.obtenerDecision(solicitudId);
        return politicas.proyectarSolicitud(usuario, {
          id: solicitud.id,
          periodoAcademico: solicitud.periodoAcademico,
          estado: solicitud.estado,
          decision: registrada ? { tipo: registrada.tipo, fecha: aIso(registrada.fecha) } : null,
        });
      });
    },
  };
}

module.exports = {
  crearServicioAsesor,
  crearServicioDireccion,
  ErrorRolNoPermitido,
  ErrorDecisionNoPermitida,
  ErrorSolicitudNoReclamable,
};
