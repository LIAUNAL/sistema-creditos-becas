'use strict';

// Story 5.15 (P15, D2/D5): planificador diario EN PROCESO de la revision de vencidos.
//
// Limites conocidos (R5): es de UNA sola instancia y depende de que el servidor este en marcha. Si se
// levantan varias instancias, cada una correra su propia revision (es idempotente, pero repetira el
// trabajo); si el servidor esta detenido, no hay revision hasta que arranque (por eso corre una vez al
// iniciar) o alguien use el endpoint manual de direccion/asesor.
//
// Garantias:
//   - el temporizador se desreferencia (`unref`): no mantiene vivo el proceso;
//   - `detener()` lo limpia de forma determinista (cierre ordenado y pruebas);
//   - un error en una corrida se informa a `alError` y nunca tumba el proceso ni detiene el calendario;
//   - no hay corridas solapadas: un tic mientras hay una en curso se omite.

const INTERVALO_POR_DEFECTO_MS = 24 * 60 * 60 * 1000;
// `setInterval` usa un entero de 32 bits con signo: por encima de este valor dispararia cada 1 ms.
const INTERVALO_MAXIMO_MS = 2 ** 31 - 1;

const esIntervaloValido = (valor) => Number.isInteger(valor) && valor > 0 && valor <= INTERVALO_MAXIMO_MS;

/** Lee VENCIMIENTOS_INTERVALO_MS (texto). Vacio o ausente: 24 h. Invalido: lanza. */
function intervaloDesdeEntorno(valor) {
  if (valor === undefined || valor === '') return INTERVALO_POR_DEFECTO_MS;
  const intervalo = /^\d+$/.test(String(valor)) ? Number(valor) : Number.NaN;
  if (!esIntervaloValido(intervalo)) {
    throw new Error(`VENCIMIENTOS_INTERVALO_MS inválido: ${valor} (entero de 1 a ${INTERVALO_MAXIMO_MS} milisegundos)`);
  }
  return intervalo;
}

/**
 * @param {object} opciones
 * @param {function(): (Promise<*>|*)} opciones.revisar una corrida de la revision
 * @param {number} [opciones.intervaloMs] por defecto 24 h
 * @param {boolean} [opciones.ejecutarAlIniciar] corre una vez al arrancar (por defecto si)
 * @param {{setInterval: function, clearInterval: function}} [opciones.temporizador] inyectable en pruebas
 * @param {function(Error): void} [opciones.alError] registro de errores de una corrida
 * @returns {{detener: function(): void, ejecutarAhora: function(): Promise<*>}}
 */
function iniciarPlanificadorVencimientos({
  revisar,
  intervaloMs = INTERVALO_POR_DEFECTO_MS,
  ejecutarAlIniciar = true,
  temporizador = { setInterval, clearInterval },
  alError = (error) => console.error('Revisión de vencidos fallida:', error),
} = {}) {
  if (typeof revisar !== 'function') throw new TypeError('revisar debe ser una función');
  if (!esIntervaloValido(intervaloMs)) {
    throw new RangeError(`intervaloMs inválido: ${intervaloMs} (entero de 1 a ${INTERVALO_MAXIMO_MS})`);
  }

  let detenido = false;
  let enCurso = false;

  const informar = (error) => {
    try {
      alError(error);
    } catch {
      // El registro de errores no debe poder tumbar el planificador.
    }
  };

  async function ejecutar() {
    if (detenido || enCurso) return undefined;
    enCurso = true;
    try {
      return await revisar();
    } catch (error) {
      informar(error);
      return undefined;
    } finally {
      enCurso = false;
    }
  }

  const manejador = temporizador.setInterval(ejecutar, intervaloMs);
  manejador?.unref?.();

  function detener() {
    if (detenido) return;
    detenido = true;
    temporizador.clearInterval(manejador);
  }

  if (ejecutarAlIniciar) ejecutar();

  return { detener, ejecutarAhora: ejecutar };
}

module.exports = {
  iniciarPlanificadorVencimientos,
  intervaloDesdeEntorno,
  INTERVALO_POR_DEFECTO_MS,
  INTERVALO_MAXIMO_MS,
};
