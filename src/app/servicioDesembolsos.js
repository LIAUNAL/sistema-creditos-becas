'use strict';

const { ejecutarCasoDeUso } = require('../infra/casoDeUso');
const { crearUnidadDeTrabajo } = require('../infra/unidadDeTrabajo');
const { ErrorEjecucionDesembolso } = require('../desembolso/ejecucionDesembolso');
const { ErrorSolicitudNoEncontrada } = require('./servicioSolicitudes');
const { proyectarCalendario } = require('./proyeccionCalendario');
const { ErrorRolNoPermitido, ErrorDecisionNoPermitida } = require('./servicioAsesor');

// Story 5.14 (P14): ejecucion de un desembolso y lectura del calendario ejecutado.
//
// Quien ejecuta (decision Q2 por defecto): el asesor financiero ASIGNADO a la solicitud a la que
// pertenece el desembolso. Otro asesor, o una solicitud aun sin reclamar, recibe 403; un desembolso
// inexistente o de una solicitud no visible (borrador), 404; cualquier otro rol, 403.
//
// Politica de error DESPUES de mutar (decision documentada): el modulo `ejecutar` fija el estado
// `ejecutado` ANTES de esperar al notificador, y su politica es que un estado ya fijado es final. Este
// caso de uso conserva por eso el `confirmarSiError: true` por defecto de `ejecutarCasoDeUso`: si la
// operacion lanza tras mutar, el estado `ejecutado` (y su auditoria) se confirman igualmente en la
// transaccion de cierre y el error original se propaga. Si el error ocurre ANTES de mutar (desembolso
// no programado, no encontrado, sin permiso) no hay nada que confirmar: no se escribe estado, auditoria
// ni aviso. Todo lo escrito (estado, auditoria `ejecutar_desembolso` y fila del outbox) se confirma en UNA
// transaccion sincrona, o no se confirma nada si falla cualquiera de las escrituras.
//
// Doble envio: la primera ejecucion deja la cuota `ejecutado`, asi que la segunda recibe
// `DESEMBOLSO_NO_PROGRAMADO` (409) sin segundo aviso. Para dos ejecuciones simultaneas de la misma cuota en
// el mismo proceso (donde ninguna habria confirmado aun), `enCurso` rechaza a la segunda con el mismo codigo.

const TIPO_RECURSO = 'solicitud_credito';
const ESTADO_PROGRAMADO = 'programado';
const ESTADO_EJECUTADO = 'ejecutado';

// Un desembolso inexistente y uno ajeno son indistinguibles para quien no puede verlo (regla P5).
class ErrorDesembolsoNoEncontrado extends Error {
  constructor(desembolsoId) {
    super(`El desembolso ${desembolsoId} no existe o no es visible para el usuario`);
    this.name = 'ErrorDesembolsoNoEncontrado';
    this.codigo = 'RECURSO_NO_ENCONTRADO';
    this.estadoHttp = 404;
  }
}

function crearServicioDesembolsos({ db, reloj, colector, registro, repositorios, asignaciones, politicas, auditoria, ejecucion }) {
  const caso = (operacion, persistir) =>
    ejecutarCasoDeUso({ db, colector, reloj, unidadDeTrabajo: crearUnidadDeTrabajo(), operacion, persistir });

  const enCurso = new Set();

  const exigirRol = (usuario, ...roles) => {
    if (!roles.includes(usuario?.rol)) throw new ErrorRolNoPermitido(roles.join(' o '));
  };

  return {
    async ejecutarDesembolso(usuario, desembolsoId) {
      exigirRol(usuario, 'asesor_financiero');
      const id = String(desembolsoId);
      if (enCurso.has(id)) {
        throw new ErrorEjecucionDesembolso('DESEMBOLSO_NO_PROGRAMADO', 'ya hay una ejecución en curso', id);
      }
      enCurso.add(id);

      let desembolso;
      let estadoPrevio;
      try {
        return await caso(
          async () => {
            desembolso = repositorios.calendario.obtenerPorId(id);
            if (!desembolso) throw new ErrorDesembolsoNoEncontrado(id);
            const solicitud = registro.obtener(desembolso.solicitudId);
            if (!solicitud || solicitud.estado === 'borrador') throw new ErrorDesembolsoNoEncontrado(id);
            if (!asignaciones.estaAsignado(usuario.id, TIPO_RECURSO, solicitud.id)) {
              throw new ErrorDecisionNoPermitida(solicitud.id);
            }
            estadoPrevio = desembolso.estado;
            try {
              await ejecucion.ejecutar(desembolso);
            } catch (error) {
              // Permite a la pagina volver al detalle de la solicitud del desembolso.
              if (error && typeof error === 'object') error.solicitudId ??= desembolso.solicitudId;
              throw error;
            }
            return { ...desembolso };
          },
          // Corre tambien si la operacion lanzo tras mutar: el estado final deja su traza.
          () => {
            if (!(desembolso && estadoPrevio === ESTADO_PROGRAMADO && desembolso.estado === ESTADO_EJECUTADO)) return;
            auditoria.registrar({
              actor: usuario.nombre_usuario,
              rol: usuario.rol,
              accion: 'ejecutar_desembolso',
              objetivo: `desembolso:${desembolso.id}`,
              detalle: { solicitudId: desembolso.solicitudId, numeroCuota: desembolso.numeroCuota, monto: desembolso.monto },
            });
          },
        );
      } finally {
        enCurso.delete(id);
      }
    },

    // Asesor asignado: el calendario completo. Estudiante: solo el de su propia solicitud (otra ajena
    // o inexistente da 404). Otros roles: 403.
    async listarDesembolsosDeSolicitud(usuario, solicitudId) {
      exigirRol(usuario, 'asesor_financiero', 'estudiante');
      return caso(() => {
        const solicitud = registro.obtener(solicitudId);
        if (!solicitud || solicitud.estado === 'borrador') throw new ErrorSolicitudNoEncontrada(solicitudId);
        if (usuario.rol === 'estudiante') {
          if (!politicas.puedeVerSolicitud(usuario, solicitud)) throw new ErrorSolicitudNoEncontrada(solicitudId);
        } else if (!asignaciones.estaAsignado(usuario.id, TIPO_RECURSO, solicitudId)) {
          throw new ErrorDecisionNoPermitida(solicitudId);
        }
        return proyectarCalendario(ejecucion, repositorios.calendario.obtenerPorSolicitud(solicitudId));
      });
    },
  };
}

module.exports = { crearServicioDesembolsos, ErrorDesembolsoNoEncontrado };
