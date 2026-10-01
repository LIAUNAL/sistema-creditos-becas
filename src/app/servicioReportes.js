'use strict';

const { enTransaccion } = require('../infra/transaccion');
const { generarReporteConsolidado } = require('../reportes/reporteConsolidado');
const { generarAlertaTasaMora, calcularTasaMora } = require('../reportes/alertaTasaMora');
const { ErrorDatosInvalidos } = require('./servicioSolicitudes');
const { ErrorRolNoPermitido } = require('./servicioAsesor');

// Story 5.17 (P17): reporte consolidado, alerta de mora y umbral por periodo para direccion academica
// (FR-051, FR-030, FR-031). Solo lee y calcula con los modulos REALES de la Epic 4
// (`generarReporteConsolidado`, `generarAlertaTasaMora`); el servicio solo les arma los datos.
//
// Lecturas (NFR-002, indices de la migracion 010 y 007):
//   - solicitudes del periodo (`solicitudes_periodo_estado`);
//   - becas: filas de `scholarship_awards` del periodo (`scholarship_awards_periodo`) -> `{ periodoAcademico,
//     estado: 'otorgada' }`, asi cuentan AMBOS origenes (automatica y comite); el desglose por origen se
//     calcula aqui, el total lo sigue dando el modulo;
//   - desembolsos ejecutados unidos por `solicitud_id` a las solicitudes del periodo (el modulo asi lo define);
//   - para la mora, los desembolsos con `periodo_academico` (`desembolsos_periodo_estado`). Los que no lo
//     traen quedan fuera de la tasa y se cuentan en `sinPeriodo` (diagnostico).
// El reporte solo devuelve agregados, periodo, tasa y umbral: nunca datos socioeconomicos ni identificadores
// de estudiantes (NFR-003).
//
// Umbral de mora: una fila de `configuracion_mora` por periodo; sin fila rige UMBRAL_MORA_POR_DEFECTO.
// SUPUESTO A CONFIRMAR CON EL NEGOCIO: ni la Story 4.2 ni el PRD fijan un valor; se asume 10 % (0.10) como
// punto de partida habitual de alerta temprana. Se sustituye con la variable de entorno UMBRAL_MORA_DEFECTO
// y, por periodo, desde la pantalla de reportes.

const ROL_DIRECCION = 'direccion_academica';
const UMBRAL_MORA_POR_DEFECTO = 0.1;
const MAX_PERIODO = 20;
const ACCION_AUDITORIA = 'configurar_umbral_mora';
const ESTADO_BECA_OTORGADA = 'otorgada';
const FORMATO_UMBRAL = /^\d+([.,]\d+)?$/;

const esUmbralValido = (valor) => typeof valor === 'number' && Number.isFinite(valor) && valor > 0 && valor <= 1;

// Texto -> numero (acepta punto o coma decimal); `NaN` si no es un numero escrito en forma simple.
function parsearUmbral(texto) {
  if (typeof texto !== 'string' || !FORMATO_UMBRAL.test(texto.trim())) return Number.NaN;
  return Number(texto.trim().replace(',', '.'));
}

// UMBRAL_MORA_DEFECTO: vacio o ausente -> la constante; un valor invalido falla al arrancar.
function umbralMoraDesdeEntorno(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return UMBRAL_MORA_POR_DEFECTO;
  const umbral = parsearUmbral(String(valor));
  if (!esUmbralValido(umbral)) {
    throw new Error(`UMBRAL_MORA_DEFECTO inválido: ${valor} (fracción mayor que 0 y hasta 1, por ejemplo 0.10)`);
  }
  return umbral;
}

function periodoValido(periodo) {
  const texto = typeof periodo === 'string' ? periodo.trim() : '';
  if (texto === '') throw new ErrorDatosInvalidos({ periodo: 'Indique el periodo académico.' });
  if (texto.length > MAX_PERIODO) {
    throw new ErrorDatosInvalidos({ periodo: `El periodo académico no puede superar ${MAX_PERIODO} caracteres.` });
  }
  return texto;
}

function crearServicioReportes({ db, reloj, auditoria, opciones = {} }) {
  const umbralPorDefecto = opciones.umbralMoraDefecto ?? UMBRAL_MORA_POR_DEFECTO;
  if (!esUmbralValido(umbralPorDefecto)) throw new TypeError('umbralMoraDefecto debe ser un número mayor que 0 y hasta 1');

  const consultas = {
    solicitudes: db.prepare(
      'SELECT id, periodo_academico AS periodoAcademico, estado FROM solicitudes WHERE periodo_academico = ?',
    ),
    premios: db.prepare('SELECT origen FROM scholarship_awards WHERE periodo_academico = ?'),
    ejecutados: db.prepare(
      `SELECT d.solicitud_id AS solicitudId, d.monto AS monto, d.estado AS estado
         FROM desembolsos d JOIN solicitudes s ON s.id = d.solicitud_id
        WHERE s.periodo_academico = ? AND d.estado = 'ejecutado'`,
    ),
    desembolsosDelPeriodo: db.prepare(
      'SELECT periodo_academico AS periodoAcademico, estado FROM desembolsos WHERE periodo_academico = ?',
    ),
    sinPeriodo: db.prepare('SELECT COUNT(*) AS total FROM desembolsos WHERE periodo_academico IS NULL'),
    umbral: db.prepare('SELECT umbral FROM configuracion_mora WHERE periodo_academico = ?'),
    guardarUmbral: db.prepare(
      `INSERT INTO configuracion_mora (periodo_academico, umbral, actualizada_en, actualizada_por)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (periodo_academico) DO UPDATE SET
         umbral = excluded.umbral, actualizada_en = excluded.actualizada_en, actualizada_por = excluded.actualizada_por`,
    ),
    periodos: db.prepare(
      `SELECT periodo_academico AS periodo FROM solicitudes
       UNION SELECT periodo_academico FROM scholarship_awards
       UNION SELECT periodo_academico FROM desembolsos WHERE periodo_academico IS NOT NULL
       UNION SELECT periodo_academico FROM configuracion_mora
       ORDER BY periodo DESC`,
    ),
  };

  function exigirDireccion(usuario) {
    if (usuario?.rol !== ROL_DIRECCION) throw new ErrorRolNoPermitido(ROL_DIRECCION);
  }

  // `{ umbral, origen }`: el del periodo si esta configurado; si no, el por defecto.
  function umbralVigente(periodo) {
    const fila = consultas.umbral.get(periodo);
    return fila ? { umbral: fila.umbral, origen: 'configurado' } : { umbral: umbralPorDefecto, origen: 'por_defecto' };
  }

  return {
    umbralPorDefecto,

    /** Periodos con datos (solicitudes, premios, desembolsos o umbral), el mas reciente primero. */
    listarPeriodos(usuario) {
      exigirDireccion(usuario);
      return consultas.periodos.all().map((fila) => fila.periodo);
    },

    /**
     * Reporte consolidado del periodo. Un periodo sin datos da todos los totales en cero.
     * @returns {{periodoAcademico:string, totalCreditosAprobados:number, totalBecasOtorgadas:number,
     *   becasAutomaticas:number, becasComite:number, montoTotalDesembolsado:number}}
     */
    generarReporte(usuario, periodo) {
      exigirDireccion(usuario);
      const periodoAcademico = periodoValido(periodo);
      const premios = consultas.premios.all(periodoAcademico);
      const reporte = generarReporteConsolidado(periodoAcademico, {
        solicitudes: consultas.solicitudes.all(periodoAcademico),
        becas: premios.map(() => ({ periodoAcademico, estado: ESTADO_BECA_OTORGADA })),
        desembolsos: consultas.ejecutados.all(periodoAcademico),
      });
      const becasAutomaticas = premios.filter((premio) => premio.origen === 'automatica').length;
      return {
        ...reporte,
        becasAutomaticas,
        becasComite: premios.length - becasAutomaticas,
      };
    },

    /**
     * Recalcula la tasa de mora del periodo con su umbral vigente.
     * @returns {{periodoAcademico:string, tasaMora:number, umbral:number, origenUmbral:string,
     *   alerta:{periodoAcademico:string, tasaMora:number, umbral:number}|null, sinPeriodo:number}}
     */
    evaluarAlertaMora(usuario, periodo) {
      exigirDireccion(usuario);
      const periodoAcademico = periodoValido(periodo);
      const datos = { desembolsos: consultas.desembolsosDelPeriodo.all(periodoAcademico) };
      const { umbral, origen } = umbralVigente(periodoAcademico);
      return {
        periodoAcademico,
        tasaMora: calcularTasaMora(periodoAcademico, datos),
        umbral,
        origenUmbral: origen,
        alerta: generarAlertaTasaMora(periodoAcademico, umbral, datos),
        sinPeriodo: consultas.sinPeriodo.get().total,
      };
    },

    /**
     * Guarda el umbral del periodo y deja la entrada de auditoria en la MISMA transaccion.
     * @param {number} umbral fraccion mayor que 0 y hasta 1
     */
    configurarUmbral(usuario, periodo, umbral) {
      exigirDireccion(usuario);
      const errores = {};
      let periodoAcademico = '';
      try {
        periodoAcademico = periodoValido(periodo);
      } catch (error) {
        Object.assign(errores, error.errores);
      }
      if (!esUmbralValido(umbral)) {
        errores.umbral = 'Escriba un número mayor que 0 y hasta 1, por ejemplo 0.10 para 10 %.';
      }
      if (Object.keys(errores).length > 0) throw new ErrorDatosInvalidos(errores);

      enTransaccion(db, () => {
        const anterior = umbralVigente(periodoAcademico).umbral;
        consultas.guardarUmbral.run(periodoAcademico, umbral, reloj.ahora().toISOString(), usuario.nombre_usuario);
        auditoria.registrar({
          actor: usuario.nombre_usuario,
          rol: usuario.rol,
          accion: ACCION_AUDITORIA,
          objetivo: `periodo:${periodoAcademico}`,
          detalle: { periodoAcademico, umbralAnterior: anterior, umbralNuevo: umbral },
        });
      });
      return { periodoAcademico, umbral };
    },
  };
}

module.exports = {
  crearServicioReportes,
  umbralMoraDesdeEntorno,
  parsearUmbral,
  UMBRAL_MORA_POR_DEFECTO,
  ACCION_AUDITORIA,
};
