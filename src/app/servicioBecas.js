'use strict';

const crypto = require('node:crypto');
const { ejecutarCasoDeUso } = require('../infra/casoDeUso');
const { crearUnidadDeTrabajo } = require('../infra/unidadDeTrabajo');
const { calcularElegibilidad, CLASIFICACIONES } = require('../evaluacion-elegibilidad/calculoElegibilidad');
const { consultarEstadoEvaluacion } = require('../evaluacion-elegibilidad/consultaEstadoEvaluacion');
const { obtenerConfiguracion, DEFAULT_CONFIGURACION } = require('./configuracionElegibilidad');
const { ErrorDatosInvalidos, idCanonicoEstudiante } = require('./servicioSolicitudes');
const { ErrorRolNoPermitido } = require('./servicioAsesor');

// Story 5.11 (P11): solicitud de beca y elegibilidad automatica.
//
// Cada caso de uso corre en `ejecutarCasoDeUso` con `confirmarSiError: false`: la solicitud, la fila de
// `scholarship_awards` (solo si el resultado es `elegible`) y las entradas de auditoria se escriben en
// UNA transaccion sincrona (`persistir`) o no se escribe nada. El estudiante NO recibe notificacion en
// esta slice. Story 5.12 (P12): una solicitud `limitrofe` se guarda sin premio y, en la MISMA transaccion,
// entra a la cola del comite (`revisionComite.procesarResultado`, con el id del caso igual al de la
// solicitud), el colector deja el aviso al rol `comite_becas` en el outbox, el caso se asigna a todo
// integrante activo del comite y la auditoria registra el escalamiento del sistema. El comite decide en
// servicioComite.js. Cada caso de uso lleva su unidad de trabajo para volcar el caso del comite.

const ESTRATOS = Object.freeze([1, 2, 3, 4, 5, 6]);
const MAX_PERIODO = 20;
const FORMATO_NUMERO = /^\d+(\.\d+)?$/;
const ACTOR_SISTEMA = 'sistema';

class ErrorSolicitudBecaNoEncontrada extends Error {
  constructor(id) {
    super(`La solicitud de beca ${id} no existe o no es visible para el usuario`);
    this.name = 'ErrorSolicitudBecaNoEncontrada';
    this.codigo = 'RECURSO_NO_ENCONTRADO';
    this.estadoHttp = 404;
  }
}

class ErrorSolicitudBecaExistente extends Error {
  constructor(solicitudId) {
    super('Ya existe una solicitud de beca para ese estudiante y periodo');
    this.name = 'ErrorSolicitudBecaExistente';
    this.codigo = 'SOLICITUD_BECA_EXISTENTE';
    this.estadoHttp = 409;
    this.solicitudId = solicitudId;
  }
}

class ErrorSolicitudBecaDecidida extends Error {
  constructor(id) {
    super(`La solicitud de beca ${id} ya tiene una decisión y no se reevalúa`);
    this.name = 'ErrorSolicitudBecaDecidida';
    this.codigo = 'SOLICITUD_BECA_DECIDIDA';
    this.estadoHttp = 409;
  }
}

const vacio = (valor) => valor === undefined || valor === null || String(valor).trim() === '';

// Devuelve `undefined` si falta, el numero si es valido o `NaN` si no se puede interpretar.
function aNumero(valor) {
  if (vacio(valor)) return undefined;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : Number.NaN;
  if (typeof valor === 'string' && FORMATO_NUMERO.test(valor.trim())) return Number(valor.trim());
  return Number.NaN;
}

// Valida solo los campos presentes: un campo ausente no es un error (la solicitud queda
// `datos_incompletos`). `escalaPromedio` sale de la configuracion del periodo.
function validarCampos(datos, escalaPromedio) {
  const errores = {};
  const valores = {};

  const promedio = aNumero(datos.promedioAcumulado);
  if (promedio !== undefined) {
    if (Number.isNaN(promedio) || promedio < 0 || promedio > escalaPromedio) {
      errores.promedioAcumulado = `Ingrese un promedio numérico entre 0 y ${escalaPromedio}.`;
    } else valores.promedioAcumulado = promedio;
  }

  const estrato = aNumero(datos.estrato);
  if (estrato !== undefined) {
    if (!ESTRATOS.includes(estrato)) errores.estrato = 'Ingrese un estrato entero entre 1 y 6.';
    else valores.estrato = estrato;
  }

  const ingresos = aNumero(datos.ingresosHogar);
  if (ingresos !== undefined) {
    if (Number.isNaN(ingresos) || ingresos < 0) {
      errores.ingresosHogar = 'Ingrese un número mayor o igual a 0, sin signos ni separadores de miles.';
    } else valores.ingresosHogar = ingresos;
  }
  return { errores, valores };
}

function validarPeriodo(valor) {
  const periodo = String(valor ?? '').trim();
  if (periodo === '') return { error: 'Indique el periodo académico.' };
  if (periodo.length > MAX_PERIODO) return { error: `El periodo académico admite hasta ${MAX_PERIODO} caracteres.` };
  return { periodo };
}

function crearServicioBecas({ db, reloj, colector, auditoria, politicas, asignaciones, revisionComite }) {
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

  const exigirEstudiante = (usuario) => {
    if (usuario?.rol !== 'estudiante') throw new ErrorRolNoPermitido('estudiante');
  };

  const buscarPorId = db.prepare('SELECT * FROM scholarship_applications WHERE id = ?');
  const buscarPorPeriodo = db.prepare(
    'SELECT id FROM scholarship_applications WHERE estudiante_id = ? AND periodo_academico = ?',
  );
  const buscarPremio = db.prepare('SELECT 1 AS existe FROM scholarship_awards WHERE application_id = ?');
  const listarPorEstudiante = db.prepare(
    'SELECT * FROM scholarship_applications WHERE estudiante_id = ? ORDER BY creada_en DESC, rowid DESC',
  );

  // Vista del estudiante (reglas de la consulta de estado 2.3): clasificacion y datos faltantes; nunca el
  // puntaje ni los datos socioeconomicos. Se pasa ademas por la proyeccion de evaluacion (defensa en profundidad).
  //
  // P13: si la solicitud es limitrofe y ya tiene caso en el comite, el caso se pasa a la consulta para que
  // el estudiante vea la decision (`otorgada`/`denegada`) y su comentario. El caso se lee en su propia
  // unidad de trabajo de solo lectura (el repositorio SQLite lo exige) y solo de ahi salen la decision y el
  // comentario: el puntaje del caso nunca llega a la vista.
  function vistaParaEstudiante(usuario, fila) {
    const camposFaltantes = JSON.parse(fila.campos_faltantes);
    const caso =
      fila.clasificacion === CLASIFICACIONES.LIMITROFE
        ? crearUnidadDeTrabajo().correr(() => revisionComite.obtenerCaso(fila.id))
        : undefined;
    const estado = consultarEstadoEvaluacion({
      idEstudiante: fila.estudiante_id,
      evaluacion: {
        idEstudiante: fila.estudiante_id,
        resultado: { clasificacion: fila.clasificacion, camposFaltantes },
        ...(caso ? { caso } : {}),
      },
    });
    return politicas.proyectarEvaluacion(usuario, {
      id: fila.id,
      periodoAcademico: fila.periodo_academico,
      clasificacion: estado.clasificacion,
      camposFaltantes: estado.datosFaltantes.map((d) => d.campo),
      datosFaltantes: estado.datosFaltantes,
      becaOtorgada: buscarPremio.get(fila.id) !== undefined,
      ...(estado.decisionComite === undefined
        ? {}
        : { decisionComite: estado.decisionComite, comentarioComite: estado.comentarioComite }),
    });
  }

  function evaluar(configuracion, entrada) {
    const resultado = calcularElegibilidad(entrada, configuracion);
    return {
      clasificacion: resultado.clasificacion,
      puntaje: resultado.puntaje,
      decisionAutomatica: resultado.decisionAutomatica ? 1 : 0,
      camposFaltantes: resultado.camposFaltantes,
    };
  }

  // Escribe el premio y la auditoria del resultado. Sincrono: corre dentro de la transaccion del caso de uso.
  function registrarOtorgamiento({ id, estudianteId, periodoAcademico, evaluacion, ahora }) {
    if (evaluacion.clasificacion !== CLASIFICACIONES.ELEGIBLE) return;
    db.prepare(
      `INSERT INTO scholarship_awards (id, application_id, estudiante_id, periodo_academico, origen, otorgada_en)
       VALUES (?, ?, ?, ?, 'automatica', ?)`,
    ).run(crypto.randomUUID(), id, estudianteId, periodoAcademico, ahora);
    auditoria.registrar({
      actor: ACTOR_SISTEMA,
      rol: ACTOR_SISTEMA,
      accion: 'otorgar_beca_automatica',
      objetivo: `solicitud_beca:${id}`,
      detalle: { periodoAcademico, puntaje: evaluacion.puntaje },
    });
  }

  // Escalamiento (FR-046): una solicitud `limitrofe` entra a la cola del comite. Corre en la OPERACION del
  // caso de uso (dentro de la unidad de trabajo y del colector) y devuelve si el caso es nuevo: procesar
  // otra vez el mismo caso no lo duplica ni vuelve a avisar (lo garantiza el modulo).
  async function encolarSiLimitrofe({ id, estudianteId, periodoAcademico, evaluacion }) {
    if (evaluacion.clasificacion !== CLASIFICACIONES.LIMITROFE) return false;
    const yaEnComite = revisionComite.obtenerCaso(id) !== undefined;
    await revisionComite.procesarResultado(
      { id, estudiante: { estudianteId }, periodoAcademico },
      {
        clasificacion: evaluacion.clasificacion,
        decisionAutomatica: evaluacion.decisionAutomatica === 1,
        puntaje: evaluacion.puntaje,
      },
    );
    return !yaEnComite;
  }

  // Asignacion (Q5 por defecto: todo integrante activo) y auditoria del escalamiento. Sincrono: corre en `persistir`.
  function registrarEscalamiento({ id, periodoAcademico, evaluacion, escalado }) {
    if (!escalado) return;
    asignaciones.asignarComiteACaso({ casoId: id, actor: { nombre_usuario: ACTOR_SISTEMA, rol: ACTOR_SISTEMA } });
    auditoria.registrar({
      actor: ACTOR_SISTEMA,
      rol: ACTOR_SISTEMA,
      accion: 'escalar_a_comite',
      objetivo: `caso_comite:${id}`,
      detalle: { periodoAcademico, puntaje: evaluacion.puntaje },
    });
  }

  const auditar = (usuario, accion, id, detalle) =>
    auditoria.registrar({ actor: usuario.nombre_usuario, rol: usuario.rol, accion, objetivo: `solicitud_beca:${id}`, detalle });

  return {
    async presentarSolicitudBeca(usuario, datos = {}) {
      exigirEstudiante(usuario);
      const estudianteId = idCanonicoEstudiante(usuario);

      return caso(
        async () => {
          const { periodo, error: errorPeriodo } = validarPeriodo(datos.periodoAcademico);
          const configuracion = periodo ? obtenerConfiguracion(db, periodo) : DEFAULT_CONFIGURACION;
          const { errores, valores } = validarCampos(datos, configuracion.escalas.promedioMaximo);
          if (errorPeriodo) errores.periodoAcademico = errorPeriodo;
          if (Object.keys(errores).length > 0) throw new ErrorDatosInvalidos(errores);

          const existente = buscarPorPeriodo.get(estudianteId, periodo);
          if (existente) throw new ErrorSolicitudBecaExistente(existente.id);

          const evaluacion = evaluar(configuracion, valores);
          const id = crypto.randomUUID();
          const escalado = await encolarSiLimitrofe({ id, estudianteId, periodoAcademico: periodo, evaluacion });
          return { id, estudianteId, periodoAcademico: periodo, valores, evaluacion, escalado };
        },
        ({ resultado: plan, error }) => {
          if (error) return;
          const ahora = reloj.ahora().toISOString();
          const { id, estudianteId: dueno, periodoAcademico, valores, evaluacion, escalado } = plan;
          db.prepare(
            `INSERT INTO scholarship_applications
               (id, estudiante_id, periodo_academico, promedio_acumulado, estrato, ingresos_hogar,
                clasificacion, puntaje, decision_automatica, campos_faltantes, creada_en, actualizada_en)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            id,
            dueno,
            periodoAcademico,
            valores.promedioAcumulado ?? null,
            valores.estrato ?? null,
            valores.ingresosHogar ?? null,
            evaluacion.clasificacion,
            evaluacion.puntaje,
            evaluacion.decisionAutomatica,
            JSON.stringify(evaluacion.camposFaltantes),
            ahora,
            ahora,
          );
          auditar(usuario, 'presentar_solicitud_beca', id, { periodoAcademico, clasificacion: evaluacion.clasificacion });
          registrarOtorgamiento({ id, estudianteId: dueno, periodoAcademico, evaluacion, ahora });
          registrarEscalamiento({ id, periodoAcademico, evaluacion, escalado });
        },
      ).then((plan) => vistaParaEstudiante(usuario, buscarPorId.get(plan.id)));
    },

    // Reevaluacion para datos incompletos: solo el propietario y solo mientras la solicitud sea
    // `datos_incompletos`. Los campos recibidos se suman a los ya guardados; el periodo no cambia.
    async completarSolicitudBeca(usuario, solicitudId, datos = {}) {
      exigirEstudiante(usuario);

      return caso(
        async () => {
          const fila = buscarPorId.get(String(solicitudId));
          if (!fila || !politicas.puedeVerSolicitudBeca(usuario, { id: fila.id, estudianteId: fila.estudiante_id })) {
            throw new ErrorSolicitudBecaNoEncontrada(solicitudId);
          }
          if (fila.clasificacion !== CLASIFICACIONES.DATOS_INCOMPLETOS || buscarPremio.get(fila.id)) {
            throw new ErrorSolicitudBecaDecidida(fila.id);
          }
          const configuracion = obtenerConfiguracion(db, fila.periodo_academico);
          const { errores, valores: nuevos } = validarCampos(datos, configuracion.escalas.promedioMaximo);
          if (Object.keys(errores).length > 0) throw new ErrorDatosInvalidos(errores);

          const valores = {
            promedioAcumulado: nuevos.promedioAcumulado ?? fila.promedio_acumulado ?? undefined,
            estrato: nuevos.estrato ?? fila.estrato ?? undefined,
            ingresosHogar: nuevos.ingresosHogar ?? fila.ingresos_hogar ?? undefined,
          };
          const evaluacion = evaluar(configuracion, valores);
          const escalado = await encolarSiLimitrofe({
            id: fila.id,
            estudianteId: fila.estudiante_id,
            periodoAcademico: fila.periodo_academico,
            evaluacion,
          });
          return { fila, valores, evaluacion, escalado };
        },
        ({ resultado: plan, error }) => {
          if (error) return;
          const { fila, valores, evaluacion, escalado } = plan;
          const ahora = reloj.ahora().toISOString();
          // La condicion repite la regla de negocio: un premio o una decision previa nunca se pisan.
          const { changes } = db
            .prepare(
              `UPDATE scholarship_applications
                  SET promedio_acumulado = ?, estrato = ?, ingresos_hogar = ?, clasificacion = ?, puntaje = ?,
                      decision_automatica = ?, campos_faltantes = ?, actualizada_en = ?
                WHERE id = ? AND clasificacion = 'datos_incompletos'`,
            )
            .run(
              valores.promedioAcumulado ?? null,
              valores.estrato ?? null,
              valores.ingresosHogar ?? null,
              evaluacion.clasificacion,
              evaluacion.puntaje,
              evaluacion.decisionAutomatica,
              JSON.stringify(evaluacion.camposFaltantes),
              ahora,
              fila.id,
            );
          if (changes !== 1) throw new ErrorSolicitudBecaDecidida(fila.id);
          auditar(usuario, 'completar_solicitud_beca', fila.id, {
            periodoAcademico: fila.periodo_academico,
            clasificacion: evaluacion.clasificacion,
          });
          registrarOtorgamiento({
            id: fila.id,
            estudianteId: fila.estudiante_id,
            periodoAcademico: fila.periodo_academico,
            evaluacion,
            ahora,
          });
          registrarEscalamiento({ id: fila.id, periodoAcademico: fila.periodo_academico, evaluacion, escalado });
        },
      ).then((plan) => vistaParaEstudiante(usuario, buscarPorId.get(plan.fila.id)));
    },

    // Solicitudes de beca del propio estudiante (la mas reciente primero), con la vista del estudiante.
    async listarMisSolicitudesBeca(usuario) {
      exigirEstudiante(usuario);
      return listarPorEstudiante
        .all(idCanonicoEstudiante(usuario))
        .map((fila) => vistaParaEstudiante(usuario, fila));
    },

    // Ajena e inexistente dan el mismo 404 (regla P5: denegar == no encontrado).
    async obtenerSolicitudBeca(usuario, solicitudId) {
      exigirEstudiante(usuario);
      const fila = buscarPorId.get(String(solicitudId));
      if (!fila || !politicas.puedeVerSolicitudBeca(usuario, { id: fila.id, estudianteId: fila.estudiante_id })) {
        throw new ErrorSolicitudBecaNoEncontrada(solicitudId);
      }
      return vistaParaEstudiante(usuario, fila);
    },
  };
}

module.exports = {
  crearServicioBecas,
  ErrorSolicitudBecaNoEncontrada,
  ErrorSolicitudBecaExistente,
  ErrorSolicitudBecaDecidida,
};
