'use strict';

const { ejecutarCasoDeUso } = require('../infra/casoDeUso');
const { crearUnidadDeTrabajo } = require('../infra/unidadDeTrabajo');
const { crearRevisionVencimientos } = require('../desembolso/vencimientoDesembolso');

// Story 5.15 (P15): revision de desembolsos vencidos (FR-049, FR-022).
//
// Un solo caso de uso, `revisarVencimientos`, lo invocan el planificador diario (actor `sistema`) y los
// endpoints manuales de direccion academica y asesor financiero (actor = el usuario). Corre en su propia
// unidad de trabajo y su propia transaccion de cierre:
//   1. carga los desembolsos del calendario (modelo de lectura, mapa de identidad de la unidad);
//   2. el modulo REAL `crearRevisionVencimientos().revisar` los muta (`programado` -> `vencido` cuando hoy
//      es posterior a `fecha + plazo`); el modulo no guarda nada: el write-back lo hace el `volcar` de la
//      unidad de trabajo, tambien si algo lanza despues de mutar (`confirmarSiError` por defecto);
//   3. por cada desembolso marcado deja un aviso `desembolso_vencido` (colector -> outbox) y, en la misma
//      transaccion, una entrada `marcar_desembolso_vencido` en `audit_log`.
// Estado, auditoria y outbox se confirman juntos o no se confirma ninguno. Es idempotente: un desembolso
// ya `vencido` o `ejecutado` no se vuelve a tocar, asi que la segunda corrida no marca ni escribe nada.
//
// Plazo de confirmacion (configurable): por defecto 15 dias (el del modulo). Se cambia con
// `opciones.plazoConfirmacionDias` (general) y `opciones.plazosPorTipoCredito` (`{ credito: 30 }`, por
// `desembolso.tipoCredito`); `main.js` lee `VENCIMIENTOS_PLAZO_DIAS` para el plazo general.
//
// Resultado: `{ marcados, moraPorPeriodo }` — `marcados` es la CANTIDAD marcada en esta corrida y
// `moraPorPeriodo` el conteo total de desembolsos `vencido` por periodo academico (los sin periodo no cuentan).
//
// "Hoy" es la fecha UTC del reloj inyectado; la mora la define la fecha del calendario, no el momento de
// la corrida (si el servidor estuvo apagado, la siguiente corrida marca todo lo atrasado).

const ACTOR_SISTEMA = Object.freeze({ nombre: 'sistema', rol: 'sistema' });
const ACCION_AUDITORIA = 'marcar_desembolso_vencido';

function crearServicioVencimientos({ db, reloj, colector, repositorios, auditoria, opciones = {} }) {
  const { plazoConfirmacionDias, plazosPorTipoCredito } = opciones;
  const revision = crearRevisionVencimientos({
    reloj: () => reloj.ahora(),
    ...(plazoConfirmacionDias === undefined ? {} : { plazoConfirmacionDias }),
    ...(plazosPorTipoCredito === undefined ? {} : { plazosPorTipoCredito }),
  });

  const caso = (operacion, persistir) =>
    ejecutarCasoDeUso({ db, colector, reloj, unidadDeTrabajo: crearUnidadDeTrabajo(), operacion, persistir });

  // Las revisiones se serializan dentro del proceso: dos corridas simultaneas (temporizador + endpoint
  // manual) cargarian los mismos `programado` y duplicarian auditoria y avisos. La segunda espera a la
  // primera y ya no encuentra nada que marcar.
  let cola = Promise.resolve();
  const enSerie = (tarea) => {
    const resultado = cola.then(tarea);
    cola = resultado.then(undefined, () => {});
    return resultado;
  };

  function revisar(actor) {
    let marcados = [];
    return caso(
      () => {
        const resultado = revision.revisar(repositorios.calendario.listarTodos());
        marcados = resultado.marcados;
        for (const desembolso of marcados) {
          colector.notificarDesembolsoVencido({
            solicitudId: desembolso.solicitudId,
            desembolsoId: desembolso.id,
            numeroCuota: desembolso.numeroCuota,
            fecha: desembolso.fecha,
            monto: desembolso.monto,
          });
        }
        return { marcados: marcados.length, moraPorPeriodo: resultado.moraPorPeriodo };
      },
      // Dentro de la transaccion de cierre, despues del volcado del estado.
      () => {
        for (const desembolso of marcados) {
          auditoria.registrar({
            actor: actor.nombre,
            rol: actor.rol,
            accion: ACCION_AUDITORIA,
            objetivo: `desembolso:${desembolso.id}`,
            detalle: { solicitudId: desembolso.solicitudId, numeroCuota: desembolso.numeroCuota, fecha: desembolso.fecha },
          });
        }
      },
    );
  }

  return {
    /**
     * @param {{actor?: {nombre: string, rol: string}}} [parametros] sin actor: el temporizador (`sistema`)
     * @returns {Promise<{marcados: number, moraPorPeriodo: Object<string, number>}>}
     */
    revisarVencimientos({ actor = ACTOR_SISTEMA } = {}) {
      return enSerie(() => revisar(actor));
    },

    // Lectura: conteo actual de desembolsos vencidos por periodo (sin datos de las personas).
    consultarMora() {
      return caso(() => revision.contarMoraPorPeriodo(repositorios.calendario.listarPorEstado('vencido')));
    },
  };
}

module.exports = { crearServicioVencimientos, ACTOR_SISTEMA, ACCION_AUDITORIA };
