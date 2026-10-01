'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

// Story 5.18 (P18): el punto de entrada real (`node src/web/main.js`) en un proceso hijo.

const RAIZ = path.resolve(__dirname, '..', '..');
const ENTRADA = path.join(RAIZ, 'src', 'web', 'main.js');

function entornoDePrueba(directorio, extra = {}) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    DB_PATH: path.join(directorio, 'arranque.db'),
    CSRF_SECRET: 'secreto-de-arranque-0123456789',
    VENCIMIENTOS_AL_INICIAR: 'false',
    PORT: '0',
    ...extra,
  };
}

function directorioTemporal(t) {
  const directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'creditos-arranque-'));
  t.after(() => fs.rmSync(directorio, { recursive: true, force: true }));
  return directorio;
}

// Arranca el servidor y espera la linea "Servidor escuchando en el puerto N" (PORT=0 imprime el puerto real).
function arrancar(entorno) {
  const hijo = spawn(process.execPath, [ENTRADA], { cwd: RAIZ, env: entorno, stdio: ['ignore', 'pipe', 'pipe'] });
  let salida = '';
  let errores = '';
  hijo.stderr.on('data', (trozo) => {
    errores += trozo;
  });
  const salio = new Promise((resolver) => hijo.once('exit', (codigo, senal) => resolver({ codigo, senal })));
  const puerto = new Promise((resolver, rechazar) => {
    hijo.stdout.on('data', (trozo) => {
      salida += trozo;
      const coincidencia = /Servidor escuchando en el puerto (\d+)/.exec(salida);
      if (coincidencia) resolver(Number(coincidencia[1]));
    });
    hijo.once('exit', () => rechazar(new Error(`el proceso terminó sin escuchar: ${errores}`)));
  });
  puerto.catch(() => {});
  return { hijo, puerto, salio, salida: () => salida, errores: () => errores };
}

test('Scenario: node src/web/main.js escucha, /health responde 200 y SIGTERM cierra con codigo 0 en menos de un segundo', async (t) => {
  const directorio = directorioTemporal(t);
  const proceso = arrancar(entornoDePrueba(directorio));
  t.after(() => proceso.hijo.kill('SIGKILL'));

  const puerto = await proceso.puerto;
  assert.ok(puerto > 0, 'se imprime el puerto real, no 0');
  const respuesta = await fetch(`http://127.0.0.1:${puerto}/health`);
  assert.strictEqual(respuesta.status, 200);
  assert.deepStrictEqual(await respuesta.json(), { estado: 'ok' });

  const inicio = Date.now();
  proceso.hijo.kill('SIGTERM');
  const { codigo, senal } = await proceso.salio;
  const duracion = Date.now() - inicio;
  assert.strictEqual(senal, null);
  assert.strictEqual(codigo, 0, `salida limpia: ${proceso.errores()}`);
  assert.ok(duracion < 1000, `el cierre tardó ${duracion} ms`);
});

const CONFIGURACIONES_INVALIDAS = [
  ['VENCIMIENTOS_INTERVALO_MS', 'abc', /VENCIMIENTOS_INTERVALO_MS inválido: abc/],
  ['VENCIMIENTOS_INTERVALO_MS', '0', /VENCIMIENTOS_INTERVALO_MS inválido: 0/],
  ['VENCIMIENTOS_PLAZO_DIAS', 'x', /VENCIMIENTOS_PLAZO_DIAS inválido: x/],
  ['UMBRAL_MORA_DEFECTO', '2', /UMBRAL_MORA_DEFECTO inválido: 2/],
  ['PORT', '70000', /PORT inválido: 70000/],
  ['CSRF_SECRET', 'corto', /CSRF_SECRET debe tener al menos 16 caracteres/],
];

for (const [variable, valor, mensaje] of CONFIGURACIONES_INVALIDAS) {
  test(`Scenario: ${variable}=${valor} se rechaza ANTES de abrir el puerto, con un solo mensaje en español y codigo 1`, async (t) => {
    const directorio = directorioTemporal(t);
    const resultado = spawnSync(process.execPath, [ENTRADA], {
      cwd: RAIZ,
      env: entornoDePrueba(directorio, { [variable]: valor }),
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.strictEqual(resultado.status, 1, `stdout=${resultado.stdout} stderr=${resultado.stderr}`);
    assert.ok(!resultado.stdout.includes('Servidor escuchando'), `no debe escuchar: ${resultado.stdout}`);
    assert.match(resultado.stderr, mensaje);
    assert.strictEqual(resultado.stderr.trim().split('\n').length, 1, `un solo renglón: ${resultado.stderr}`);
    assert.ok(!fs.existsSync(path.join(directorio, 'arranque.db')), 'no abre ni crea la base antes de validar');
  });
}
