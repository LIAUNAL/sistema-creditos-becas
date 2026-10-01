'use strict';

const crypto = require('node:crypto');
const { ejecutarCasoDeUso } = require('../infra/casoDeUso');
const { crearUnidadDeTrabajo } = require('../infra/unidadDeTrabajo');
const { ESTADOS_CASO, DECISIONES } = require('../evaluacion-elegibilidad/revisionComite');
const { ErrorRolNoPermitido } = require('./servicioAsesor');

// Story 5.12 (P12): cola y decision del comite de becas.
//
// El caso del comite tiene el mismo id que la solicitud de beca (servicioBecas.js lo encola). Aqui se
// consulta la cola de cada integrante y se registra su decision:
//   - `registrarDecision` del modulo no recibe al integrante (NFR-001): el autor, la accion y la fecha
//     quedan en `audit_log` DENTRO de la misma transaccion que el estado del caso;
//   - `otorgada` inserta la fila de `scholarship_awards` con origen `comite` y el periodo de la solicitud;
//   - `denegada` no crea beca.
// Cada decision corre con `confirmarSiError: false`: estado del caso, auditoria, premio y outbox se
// confirman juntos o no se confirma nada.

const TIPO_RECURSO = 'caso_comite';
const ROL_COMITE = 'comite_becas';

class ErrorCasoComiteNoEncontrado extends Error {
  constructor(id) {
    super(`El caso ${id} del comité no existe o no es visible para el usuario`);
    this.name = 'ErrorCasoComiteNoEncontrado';
    this.codigo = 'RECURSO_NO_ENCONTRADO';
    this.estadoHttp = 404;
  }
}

// El integrante existe pero el caso no le fue asignado: no le corresponde decidirlo.
class ErrorCasoNoAsignado extends Error {
  constructor(id) {
    super(`El caso ${id} no está asignado a este integrante del comité`);
    this.name = 'ErrorCasoNoAsignado';
    this.codigo = 'CASO_NO_ASIGNADO';
    this.estadoHttp = 403;
  }
}

class ErrorBecaYaOtorgada extends Error {
  constructor(id) {
    super(`La solicitud ${id} ya tiene una beca otorgada`);
    this.name = 'ErrorBecaYaOtorgada';
    this.codigo = 'BECA_YA_OTORGADA';
    this.estadoHttp = 409;
  }
}

const aIso = (fecha) => new Date(fecha).toISOString();

function crearServicioComite({ db, reloj, colector, auditoria, politicas, revisionComite }) {
  const exigirComite = (usuario) => {
    if (usuario?.rol !== ROL_COMITE) throw new ErrorRolNoPermitido(ROL_COMITE);
  };

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

  // Lecturas: el repositorio SQLite resuelve el caso en una unidad de trabajo; sin cambios no se escribe nada.
  const leer = (fn) => crearUnidadDeTrabajo().correr(fn);

  const buscarSolicitud = db.prepare('SELECT * FROM scholarship_applications WHERE id = ?');
  const buscarPremio = db.prepare('SELECT 1 AS existe FROM scholarship_awards WHERE application_id = ?');

  const entradaDeCola = (registro) => ({
    id: registro.id,
    periodoAcademico: registro.periodoAcademico,
    puntaje: registro.puntaje,
    ingresadoEn: aIso(registro.historial[0].fecha),
  });

  // Entrada del historial para el integrante: fechas en ISO, con la decision y su comentario si los hay.
  const entradaDeHistorial = ({ tipo, fecha, decision, comentario }) => ({
    tipo,
    fecha: aIso(fecha),
    ...(decision === undefined ? {} : { decision, comentario }),
  });

  return {
    // Solo los casos asignados al integrante que siguen en revision (en orden de ingreso).
    async listarColaComite(usuario) {
      exigirComite(usuario);
      return leer(() =>
        revisionComite
          .listarCola()
          .filter((registro) => politicas.puedeVerCasoComite(usuario, registro))
          .map(entradaDeCola),
      );
    },

    // Ajeno e inexistente dan el mismo 404 (regla P5: denegar == no encontrado). El integrante asignado ve
    // el puntaje y los datos de entrada de la evaluacion (proyeccion P5 para el comite).
    async obtenerCasoComite(usuario, idCaso) {
      exigirComite(usuario);
      const id = String(idCaso);
      return leer(() => {
        const registro = revisionComite.obtenerCaso(id);
        if (!registro || !politicas.puedeVerCasoComite(usuario, registro)) throw new ErrorCasoComiteNoEncontrado(id);
        const solicitud = buscarSolicitud.get(id);
        return politicas.proyectarEvaluacion(usuario, {
          id: registro.id,
          periodoAcademico: registro.periodoAcademico,
          estado: registro.estado,
          puntaje: registro.puntaje,
          promedioAcumulado: solicitud?.promedio_acumulado ?? null,
          estrato: solicitud?.estrato ?? null,
          ingresosHogar: solicitud?.ingresos_hogar ?? null,
          historial: registro.historial.map(entradaDeHistorial),
        });
      });
    },

    // Solo un integrante ASIGNADO al caso: otro integrante recibe 403; un caso ya decidido, 409; un
    // comentario vacio o una decision desconocida, 400. Todo se confirma en UNA transaccion.
    async registrarDecisionComite(usuario, idCaso, { decision, comentario } = {}) {
      exigirComite(usuario);
      const id = String(idCaso);

      return caso(
        () => {
          // Asignacion primero: un caso inexistente o ajeno al comite no revela nada (nadie esta asignado).
          if (!politicas.puedeVerCasoComite(usuario, { id })) throw new ErrorCasoNoAsignado(id);
          const registro = revisionComite.obtenerCaso(id);
          const solicitud = buscarSolicitud.get(id);
          if (!registro || !solicitud) throw new ErrorCasoComiteNoEncontrado(id);
          if (
            registro.estado === ESTADOS_CASO.EN_REVISION_COMITE &&
            decision === DECISIONES.OTORGADA &&
            buscarPremio.get(id)
          ) {
            throw new ErrorBecaYaOtorgada(id);
          }

          const decidido = revisionComite.registrarDecision(id, { decision, comentario });
          return { id, estado: decidido.estado, decision, comentario, solicitud };
        },
        ({ resultado: plan, error }) => {
          if (error) return;
          const { id: idPlan, decision: decisionPlan, comentario: comentarioPlan, solicitud } = plan;
          auditoria.registrar({
            actor: usuario.nombre_usuario,
            rol: usuario.rol,
            accion: 'decidir_caso_comite',
            objetivo: `${TIPO_RECURSO}:${idPlan}`,
            detalle: { usuarioId: usuario.id, decision: decisionPlan, comentario: comentarioPlan },
          });
          if (decisionPlan === DECISIONES.OTORGADA) {
            db.prepare(
              `INSERT INTO scholarship_awards (id, application_id, estudiante_id, periodo_academico, origen, otorgada_en)
               VALUES (?, ?, ?, ?, 'comite', ?)`,
            ).run(crypto.randomUUID(), idPlan, solicitud.estudiante_id, solicitud.periodo_academico, reloj.ahora().toISOString());
          }
        },
      ).then(({ solicitud, ...vista }) => vista);
    },
  };
}

module.exports = {
  crearServicioComite,
  ErrorCasoComiteNoEncontrado,
  ErrorCasoNoAsignado,
  ErrorBecaYaOtorgada,
};
