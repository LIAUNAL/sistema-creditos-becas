'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { abrirBaseDeDatos } = require('./baseDeDatos');
const { ejecutarMigraciones } = require('./migraciones');
const { crearAuditoria } = require('./auditoria');
const { crearRelojFijo } = require('./reloj');

function preparar(fecha = new Date('2026-05-04T12:30:00.000Z')) {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  const reloj = crearRelojFijo(fecha);
  return { db, reloj, auditoria: crearAuditoria({ db, reloj }) };
}

test('la entrada guarda actor, rol, accion, objetivo y la fecha ISO del reloj', () => {
  const { db, auditoria } = preparar();
  auditoria.registrar({
    actor: 'maria',
    rol: 'comite',
    accion: 'aprobar',
    objetivo: 'solicitud-7',
    detalle: { motivo: 'cumple' },
  });
  const [entrada] = auditoria.listar();
  assert.strictEqual(entrada.actor, 'maria');
  assert.strictEqual(entrada.rol, 'comite');
  assert.strictEqual(entrada.accion, 'aprobar');
  assert.strictEqual(entrada.objetivo, 'solicitud-7');
  assert.strictEqual(entrada.fecha, '2026-05-04T12:30:00.000Z');
  assert.deepStrictEqual(entrada.detalle, { motivo: 'cumple' });
  assert.ok(Number.isInteger(entrada.id));
  db.close();
});

test('el detalle es opcional y se lee como null', () => {
  const { db, auditoria } = preparar();
  auditoria.registrar({ actor: 'a', rol: 'r', accion: 'x', objetivo: 'o' });
  assert.strictEqual(auditoria.listar()[0].detalle, null);
  db.close();
});

test('las entradas previas siguen presentes tras agregar una nueva', () => {
  const { db, auditoria } = preparar();
  auditoria.registrar({ actor: 'a', rol: 'r', accion: 'uno', objetivo: 'o1' });
  auditoria.registrar({ actor: 'b', rol: 'r', accion: 'dos', objetivo: 'o2' });
  assert.deepStrictEqual(
    auditoria.listar().map((entrada) => entrada.accion),
    ['uno', 'dos'],
  );
  db.close();
});

test('listarPorObjetivo devuelve solo las entradas del objetivo', () => {
  const { db, auditoria } = preparar();
  auditoria.registrar({ actor: 'a', rol: 'r', accion: 'uno', objetivo: 'o1' });
  auditoria.registrar({ actor: 'a', rol: 'r', accion: 'dos', objetivo: 'o2' });
  auditoria.registrar({ actor: 'a', rol: 'r', accion: 'tres', objetivo: 'o1' });
  assert.deepStrictEqual(
    auditoria.listarPorObjetivo('o1').map((entrada) => entrada.accion),
    ['uno', 'tres'],
  );
  db.close();
});

test('el registro es solo de anexado: no expone actualizar ni borrar', () => {
  const { db, auditoria } = preparar();
  assert.deepStrictEqual(Object.keys(auditoria).sort(), ['listar', 'listarPorObjetivo', 'registrar']);
  db.close();
});

test('la base rechaza UPDATE y DELETE sobre audit_log', () => {
  const { db, auditoria } = preparar();
  auditoria.registrar({ actor: 'a', rol: 'r', accion: 'uno', objetivo: 'o1' });
  assert.throws(() => db.exec("UPDATE audit_log SET actor = 'otro'"), /append-only|solo de anexado/i);
  assert.throws(() => db.exec('DELETE FROM audit_log'), /append-only|solo de anexado/i);
  assert.strictEqual(auditoria.listar().length, 1);
  assert.strictEqual(auditoria.listar()[0].actor, 'a');
  db.close();
});

test('registrar exige actor, rol, accion y objetivo', () => {
  const { db, auditoria } = preparar();
  assert.throws(() => auditoria.registrar({ actor: 'a', rol: 'r', accion: 'x' }), /objetivo/);
  assert.throws(() => auditoria.registrar({}), /actor/);
  assert.strictEqual(auditoria.listar().length, 0);
  db.close();
});
