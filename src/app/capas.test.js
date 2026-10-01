'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Story 5.18 (P18): la capa de aplicacion no depende de la capa web (las politicas viven en src/app).

const raiz = __dirname;
const archivosDeCodigo = fs
  .readdirSync(raiz)
  .filter((nombre) => nombre.endsWith('.js') && !nombre.endsWith('.test.js'))
  .map((nombre) => path.join(raiz, nombre));

test('Scenario: ningun archivo de src/app importa nada de src/web', () => {
  const infractores = archivosDeCodigo.filter((archivo) =>
    /require\(\s*['"]\.\.\/web\//.test(fs.readFileSync(archivo, 'utf8')),
  );
  assert.deepStrictEqual(infractores.map((a) => path.basename(a)), []);
});

test('Scenario: las politicas se implementan en src/app y src/web/politicas.js las reexporta sin cambios', () => {
  const enApp = require('./politicas');
  const enWeb = require('../web/politicas');
  assert.strictEqual(typeof enApp.crearPoliticas, 'function');
  assert.strictEqual(enWeb.crearPoliticas, enApp.crearPoliticas);
  assert.strictEqual(enWeb.CAMPOS_SOCIOECONOMICOS, enApp.CAMPOS_SOCIOECONOMICOS);
});
