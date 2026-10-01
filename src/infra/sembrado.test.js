'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { abrirBaseDeDatos } = require('./baseDeDatos');
const { ejecutarMigraciones } = require('./migraciones');
const { sembrarUsuarios, ROLES } = require('./sembrado');
const { verificarContrasena } = require('./contrasenas');

function preparar() {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  return db;
}

const ENTORNO = {
  SEED_PASSWORD_ESTUDIANTE: 'clave-estudiante',
  SEED_PASSWORD_ASESOR_FINANCIERO: 'clave-asesor',
  SEED_PASSWORD_COMITE_BECAS: 'clave-comite',
  SEED_PASSWORD_DIRECCION_ACADEMICA: 'clave-direccion',
};

test('los roles son exactamente los cuatro definidos', () => {
  assert.deepStrictEqual(
    [...ROLES],
    ['estudiante', 'asesor_financiero', 'comite_becas', 'direccion_academica'],
  );
});

test('siembra un usuario por rol con la contraseña del entorno, hasheada', async () => {
  const db = preparar();
  const resultado = await sembrarUsuarios({ db, entorno: ENTORNO });
  assert.strictEqual(resultado.length, 4);
  const filas = db.prepare('SELECT * FROM usuarios ORDER BY id').all();
  assert.deepStrictEqual(filas.map((f) => f.rol), [...ROLES]);
  for (const fila of filas) {
    assert.ok(fila.hash_contrasena.startsWith('scrypt$'));
    assert.strictEqual(fila.activo, 1);
  }
  assert.strictEqual(await verificarContrasena('clave-asesor', filas[1].hash_contrasena), true);
  const volcado = JSON.stringify(filas);
  for (const clave of Object.values(ENTORNO)) assert.ok(!volcado.includes(clave));
  assert.ok(resultado.every((r) => r.contrasenaGenerada === undefined));
});

test('sin variable de entorno genera una contraseña aleatoria y la devuelve una vez', async () => {
  const db = preparar();
  const resultado = await sembrarUsuarios({ db, entorno: {} });
  const claves = resultado.map((r) => r.contrasenaGenerada);
  assert.ok(claves.every((c) => typeof c === 'string' && c.length >= 16));
  assert.strictEqual(new Set(claves).size, 4);
  const fila = db.prepare('SELECT hash_contrasena FROM usuarios WHERE rol = ?').get('estudiante');
  assert.strictEqual(await verificarContrasena(claves[0], fila.hash_contrasena), true);
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM usuarios').all()).includes(claves[0]));
});

test('es idempotente: una segunda ejecución conserva los usuarios existentes', async () => {
  const db = preparar();
  await sembrarUsuarios({ db, entorno: ENTORNO });
  const antes = db.prepare('SELECT * FROM usuarios ORDER BY id').all();
  const segunda = await sembrarUsuarios({ db, entorno: { ...ENTORNO, SEED_PASSWORD_ESTUDIANTE: 'otra' } });
  const despues = db.prepare('SELECT * FROM usuarios ORDER BY id').all();
  assert.deepStrictEqual(despues.map((f) => ({ ...f })), antes.map((f) => ({ ...f })));
  assert.ok(segunda.every((r) => r.creado === false));
});

test('la migración 002 rechaza roles fuera del catálogo y nombres duplicados', () => {
  const db = preparar();
  const ins = db.prepare(
    'INSERT INTO usuarios (nombre_usuario, hash_contrasena, rol, activo) VALUES (?, ?, ?, 1)',
  );
  assert.throws(() => ins.run('x', 'h', 'superadmin'));
  ins.run('a', 'h', 'estudiante');
  assert.throws(() => ins.run('a', 'h', 'estudiante'));
});
