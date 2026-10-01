'use strict';

const crypto = require('node:crypto');
const { ejecutarCasoDeUso } = require('../infra/casoDeUso');
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
// esta slice. Una solicitud `limitrofe` se guarda sin premio y sin caso de comite: P12 conecta la cola
// del comite leyendo las solicitudes con clasificacion `limitrofe`.

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

function crearServicioBecas({ db, reloj, colector, auditoria, politicas }) {
  const caso = (operacion, persistir) =>
    ejecutarCasoDeUso({ db, colector, reloj, confirmarSiError: false, operacion, persistir });

  const exigirEstudiante = (usuario) => {
    if (usuario?.rol !== 'estudiante') throw new ErrorRolNoPermitido('estudiante');
  };

  const buscarPorId = db.prepare('SELECT * FROM scholarship_applications WHERE id = ?');
  const buscarPorPeriodo = db.prepare(
    'SELECT id FROM scholarship_applications WHERE estudiante_id = ? AND periodo_academico = ?',
  );
  const buscarPremio = db.prepare('SELECT 1 AS existe FROM scholarship_awards WHERE application_id = ?');

  // Vista del estudiante (reglas de la consulta de estado 2.3): clasificacion y datos faltantes; nunca el
  // puntaje ni los datos socioeconomicos. Se pasa ademas por la proyeccion de evaluacion (defensa en profundidad).
  function vistaParaEstudiante(usuario, fila) {
    const camposFaltantes = JSON.parse(fila.campos_faltantes);
    const estado = consultarEstadoEvaluacion({
      idEstudiante: fila.estudiante_id,
      evaluacion: { idEstudiante: fila.estudiante_id, resultado: { clasificacion: fila.clasificacion, camposFaltantes } },
    });
    return politicas.proyectarEvaluacion(usuario, {
      id: fila.id,
      periodoAcademico: fila.periodo_academico,
      clasificacion: estado.clasificacion,
      camposFaltantes: estado.datosFaltantes.map((d) => d.campo),
      becaOtorgada: buscarPremio.get(fila.id) !== undefined,
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

  const auditar = (usuario, accion, id, detalle) =>
    auditoria.registrar({ actor: usuario.nombre_usuario, rol: usuario.rol, accion, objetivo: `solicitud_beca:${id}`, detalle });

  return {
    async presentarSolicitudBeca(usuario, datos = {}) {
      exigirEstudiante(usuario);
      const estudianteId = idCanonicoEstudiante(usuario);

      return caso(
        () => {
          const { periodo, error: errorPeriodo } = validarPeriodo(datos.periodoAcademico);
          const configuracion = periodo ? obtenerConfiguracion(db, periodo) : DEFAULT_CONFIGURACION;
          const { errores, valores } = validarCampos(datos, configuracion.escalas.promedioMaximo);
          if (errorPeriodo) errores.periodoAcademico = errorPeriodo;
          if (Object.keys(errores).length > 0) throw new ErrorDatosInvalidos(errores);

          const existente = buscarPorPeriodo.get(estudianteId, periodo);
          if (existente) throw new ErrorSolicitudBecaExistente(existente.id);

          const evaluacion = evaluar(configuracion, valores);
          return { id: crypto.randomUUID(), estudianteId, periodoAcademico: periodo, valores, evaluacion };
        },
        ({ resultado: plan, error }) => {
          if (error) return;
          const ahora = reloj.ahora().toISOString();
          const { id, estudianteId: dueno, periodoAcademico, valores, evaluacion } = plan;
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
        },
      ).then((plan) => vistaParaEstudiante(usuario, buscarPorId.get(plan.id)));
    },

    // Reevaluacion para datos incompletos: solo el propietario y solo mientras la solicitud sea
    // `datos_incompletos`. Los campos recibidos se suman a los ya guardados; el periodo no cambia.
    async completarSolicitudBeca(usuario, solicitudId, datos = {}) {
      exigirEstudiante(usuario);

      return caso(
        () => {
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
          return { fila, valores, evaluacion: evaluar(configuracion, valores) };
        },
        ({ resultado: plan, error }) => {
          if (error) return;
          const { fila, valores, evaluacion } = plan;
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
        },
      ).then((plan) => vistaParaEstudiante(usuario, buscarPorId.get(plan.fila.id)));
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
