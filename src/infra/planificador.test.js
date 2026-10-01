'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  iniciarPlanificadorVencimientos,
  intervaloDesdeEntorno,
  INTERVALO_POR_DEFECTO_MS,
} = require('./planificador');

// Story 5.15 (P15): planificador diario en proceso. Pruebas con temporizador falso (deterministas).

const esperar = () => new Promise((resolve) => setImmediate(resolve));

function temporizadorFalso() {
  const estado = { tic: null, intervaloMs: null, unref: 0, limpiados: [] };
  const manejador = {
    unref() {
      estado.unref += 1;
      return manejador;
    },
  };
  return {
    estado,
    setInterval(funcion, ms) {
      estado.tic = funcion;
      estado.intervaloMs = ms;
      return manejador;
    },
    clearInterval(recibido) {
      estado.limpiados.push(recibido);
      estado.tic = null;
    },
  };
}

test('Scenario: el temporizador diario no mantiene vivo el proceso: se desreferencia (unref) y detener() lo limpia', async () => {
  const temporizador = temporizadorFalso();
  const planificador = iniciarPlanificadorVencimientos({ revisar: async () => {}, temporizador });

  assert.strictEqual(temporizador.estado.unref, 1);
  assert.strictEqual(temporizador.estado.intervaloMs, INTERVALO_POR_DEFECTO_MS);
  assert.strictEqual(INTERVALO_POR_DEFECTO_MS, 24 * 60 * 60 * 1000);

  planificador.detener();

  assert.strictEqual(temporizador.estado.limpiados.length, 1);
  assert.strictEqual(temporizador.estado.tic, null);
  planificador.detener(); // idempotente
  assert.strictEqual(temporizador.estado.limpiados.length, 1);
  await esperar();
});

test('Scenario: un proceso hijo que inicia el planificador termina solo (no se queda colgado)', async () => {
  const modulo = path.join(__dirname, 'planificador.js');
  const guion = `
    const { iniciarPlanificadorVencimientos } = require(${JSON.stringify(modulo)});
    let corridas = 0;
    iniciarPlanificadorVencimientos({ revisar: async () => { corridas += 1; }, intervaloMs: 60000 });
    process.on('exit', () => { if (corridas !== 1) process.exitCode = 3; });
  `;
  const hijo = spawn(process.execPath, ['-e', guion], { stdio: 'ignore' });
  const codigo = await new Promise((resolve, reject) => {
    const limite = setTimeout(() => {
      hijo.kill('SIGKILL');
      reject(new Error('el proceso hijo no termino: el temporizador lo mantiene vivo'));
    }, 8000);
    hijo.once('exit', (c) => {
      clearTimeout(limite);
      resolve(c);
    });
  });
  assert.strictEqual(codigo, 0);
});

test('corre una vez al iniciar y despues en cada intervalo; ejecutarAlIniciar:false lo omite', async () => {
  const temporizador = temporizadorFalso();
  let corridas = 0;
  const planificador = iniciarPlanificadorVencimientos({ revisar: async () => { corridas += 1; }, intervaloMs: 5000, temporizador });
  await esperar();
  assert.strictEqual(corridas, 1);
  assert.strictEqual(temporizador.estado.intervaloMs, 5000);

  temporizador.estado.tic();
  await esperar();
  temporizador.estado.tic();
  await esperar();
  assert.strictEqual(corridas, 3);
  planificador.detener();

  const otro = temporizadorFalso();
  let corridasOtro = 0;
  iniciarPlanificadorVencimientos({ revisar: async () => { corridasOtro += 1; }, ejecutarAlIniciar: false, temporizador: otro });
  await esperar();
  assert.strictEqual(corridasOtro, 0);
  otro.estado.tic();
  await esperar();
  assert.strictEqual(corridasOtro, 1);
});

test('una corrida que falla (sincrona o asincrona) se informa a alError y no detiene el calendario', async () => {
  const temporizador = temporizadorFalso();
  const errores = [];
  let corridas = 0;
  iniciarPlanificadorVencimientos({
    revisar: () => {
      corridas += 1;
      if (corridas === 1) throw new Error('fallo sincrono');
      if (corridas === 2) return Promise.reject(new Error('fallo asincrono'));
      return Promise.resolve();
    },
    temporizador,
    alError: (error) => errores.push(error.message),
  });
  await esperar();
  temporizador.estado.tic();
  await esperar();
  temporizador.estado.tic();
  await esperar();

  assert.deepStrictEqual(errores, ['fallo sincrono', 'fallo asincrono']);
  assert.strictEqual(corridas, 3);
  assert.notStrictEqual(temporizador.estado.tic, null, 'el temporizador sigue activo');
});

test('un alError que tambien lanza no tumba el proceso ni el calendario', async () => {
  const temporizador = temporizadorFalso();
  let corridas = 0;
  iniciarPlanificadorVencimientos({
    revisar: async () => {
      corridas += 1;
      throw new Error('x');
    },
    temporizador,
    alError: () => {
      throw new Error('el registro tambien fallo');
    },
  });
  await esperar();
  temporizador.estado.tic();
  await esperar();
  assert.strictEqual(corridas, 2);
});

test('no se solapan corridas: un tic mientras hay una en curso se omite', async () => {
  const temporizador = temporizadorFalso();
  let corridas = 0;
  let liberar;
  const planificador = iniciarPlanificadorVencimientos({
    revisar: () => {
      corridas += 1;
      return new Promise((resolve) => {
        liberar = resolve;
      });
    },
    temporizador,
  });
  await esperar();
  temporizador.estado.tic();
  temporizador.estado.tic();
  await esperar();
  assert.strictEqual(corridas, 1);

  liberar();
  await esperar();
  temporizador.estado.tic();
  await esperar();
  assert.strictEqual(corridas, 2);
  liberar();
  planificador.detener();
});

test('tras detener(), un tic pendiente ya no ejecuta la revision', async () => {
  const temporizador = temporizadorFalso();
  let corridas = 0;
  const planificador = iniciarPlanificadorVencimientos({ revisar: async () => { corridas += 1; }, ejecutarAlIniciar: false, temporizador });
  const tic = temporizador.estado.tic;
  planificador.detener();
  tic();
  await esperar();
  assert.strictEqual(corridas, 0);
});

test('ejecutarAhora corre una revision y devuelve su resultado; respeta el no solapamiento', async () => {
  const temporizador = temporizadorFalso();
  const planificador = iniciarPlanificadorVencimientos({ revisar: async () => ({ marcados: 2 }), ejecutarAlIniciar: false, temporizador });
  assert.deepStrictEqual(await planificador.ejecutarAhora(), { marcados: 2 });
  planificador.detener();
});

test('intervaloDesdeEntorno: por defecto 24 h, acepta enteros positivos y rechaza valores invalidos o fuera del limite del temporizador', () => {
  assert.strictEqual(intervaloDesdeEntorno(undefined), INTERVALO_POR_DEFECTO_MS);
  assert.strictEqual(intervaloDesdeEntorno(''), INTERVALO_POR_DEFECTO_MS);
  assert.strictEqual(intervaloDesdeEntorno('60000'), 60000);
  for (const invalido of ['0', '-5', 'abc', '1.5', '2147483648']) {
    assert.throws(() => intervaloDesdeEntorno(invalido), /VENCIMIENTOS_INTERVALO_MS/, invalido);
  }
});

test('iniciarPlanificadorVencimientos exige una funcion revisar y un intervalo valido', () => {
  assert.throws(() => iniciarPlanificadorVencimientos({}), /revisar/);
  assert.throws(() => iniciarPlanificadorVencimientos({ revisar: async () => {}, intervaloMs: 0 }), /intervaloMs/);
});
