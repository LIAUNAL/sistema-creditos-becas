'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { abrirBaseDeDatos } = require('../infra/baseDeDatos');
const { ejecutarMigraciones } = require('../infra/migraciones');
const { crearRelojFijo } = require('../infra/reloj');
const { crearAuditoria } = require('../infra/auditoria');
const {
  crearServicioReportes,
  umbralMoraDesdeEntorno,
  UMBRAL_MORA_POR_DEFECTO,
} = require('./servicioReportes');

// Story 5.17 (P17): migracion 010 y reglas del servicio de reportes que no pasan por HTTP.

function baseConServicio(opciones) {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  const reloj = crearRelojFijo(new Date('2026-05-04T12:30:00.000Z'));
  const servicio = crearServicioReportes({ db, reloj, auditoria: crearAuditoria({ db, reloj }), opciones });
  return { db, servicio };
}

const DIRECCION = Object.freeze({ id: 4, nombre_usuario: 'direccion_academica', rol: 'direccion_academica' });

test('el umbral de mora por defecto documentado es 0,10', () => {
  assert.strictEqual(UMBRAL_MORA_POR_DEFECTO, 0.1);
});

test('UMBRAL_MORA_DEFECTO: sin valor usa la constante y un valor válido (punto o coma) la reemplaza', () => {
  assert.strictEqual(umbralMoraDesdeEntorno(undefined), UMBRAL_MORA_POR_DEFECTO);
  assert.strictEqual(umbralMoraDesdeEntorno(''), UMBRAL_MORA_POR_DEFECTO);
  assert.strictEqual(umbralMoraDesdeEntorno('0.25'), 0.25);
  assert.strictEqual(umbralMoraDesdeEntorno('0,3'), 0.3);
  assert.strictEqual(umbralMoraDesdeEntorno('1'), 1);
});

test('UMBRAL_MORA_DEFECTO inválido falla al arrancar con un mensaje claro', () => {
  for (const valor of ['abc', '0', '-1', '1.5', '10%', '0.1.2']) {
    assert.throws(() => umbralMoraDesdeEntorno(valor), /UMBRAL_MORA_DEFECTO inválido/, valor);
  }
});

test('la migración 010 crea configuracion_mora con CHECK entre 0 y 1 y los índices del reporte', () => {
  const { db } = baseConServicio();
  const insertar = db.prepare(
    "INSERT INTO configuracion_mora (periodo_academico, umbral, actualizada_en, actualizada_por) VALUES (?, ?, 'x', 'y')",
  );
  insertar.run('2026-1', 0.5);
  assert.throws(() => insertar.run('2026-2', 1.5), /CHECK/);
  assert.throws(() => insertar.run('2026-3', -0.1), /CHECK/);
  assert.throws(() => insertar.run('2026-1', 0.2), /UNIQUE|PRIMARY/);
  const indices = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((f) => f.name);
  for (const esperado of ['desembolsos_periodo_estado', 'solicitudes_periodo_estado', 'scholarship_awards_periodo']) {
    assert.ok(indices.includes(esperado), `falta el índice ${esperado}`);
  }
  const plan = db
    .prepare("EXPLAIN QUERY PLAN SELECT estado FROM desembolsos WHERE periodo_academico = '2026-1'")
    .all()
    .map((f) => f.detail)
    .join(' ');
  assert.ok(plan.includes('desembolsos_periodo_estado'), plan);
});

test('el servicio solo admite el rol direccion_academica', async () => {
  const { servicio } = baseConServicio();
  for (const rol of ['estudiante', 'asesor_financiero', 'comite_becas']) {
    const usuario = { id: 1, nombre_usuario: 'x', rol };
    for (const operacion of [
      () => servicio.generarReporte(usuario, '2026-1'),
      () => servicio.evaluarAlertaMora(usuario, '2026-1'),
      () => servicio.listarPeriodos(usuario),
      () => servicio.configurarUmbral(usuario, '2026-1', 0.5),
    ]) {
      assert.throws(operacion, (error) => error.codigo === 'ROL_NO_PERMITIDO' && error.estadoHttp === 403);
    }
  }
});

test('configurarUmbral valida el rango y el periodo, y devuelve el umbral guardado', () => {
  const { servicio, db } = baseConServicio();
  for (const umbral of [0, -1, 1.01, NaN, Infinity, '0.5', null, undefined]) {
    assert.throws(() => servicio.configurarUmbral(DIRECCION, '2026-1', umbral), (e) => e.codigo === 'DATOS_INVALIDOS' && typeof e.errores.umbral === 'string', String(umbral));
  }
  for (const periodo of ['', '   ', undefined, 'x'.repeat(21)]) {
    assert.throws(() => servicio.configurarUmbral(DIRECCION, periodo, 0.5), (e) => e.codigo === 'DATOS_INVALIDOS' && typeof e.errores.periodo === 'string');
  }
  assert.deepStrictEqual(servicio.configurarUmbral(DIRECCION, ' 2026-1 ', 0.35), { periodoAcademico: '2026-1', umbral: 0.35 });
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM configuracion_mora').get().n, 1);
});

test('si la auditoría falla el umbral no se guarda (misma transacción)', () => {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  const reloj = crearRelojFijo(new Date('2026-05-04T12:30:00.000Z'));
  const auditoria = { registrar() { throw new Error('fallo de auditoria'); } };
  const servicio = crearServicioReportes({ db, reloj, auditoria });

  assert.throws(() => servicio.configurarUmbral(DIRECCION, '2026-1', 0.5), /fallo de auditoria/);

  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM configuracion_mora').get().n, 0);
});

test('listarPeriodos devuelve los periodos distintos de solicitudes, becas, desembolsos y umbrales, el más reciente primero', () => {
  const { servicio, db } = baseConServicio();
  assert.deepStrictEqual(servicio.listarPeriodos(DIRECCION), []);
  db.prepare("INSERT INTO configuracion_mora VALUES ('2024-1', 0.2, 'x', 'y')").run();
  db.prepare("INSERT INTO solicitudes (id, estudiante_id, periodo_academico, estado, datos, creada_en) VALUES ('a', 'e', '2025-2', 'aprobada', '{}', 'x')").run();
  db.prepare("INSERT INTO solicitudes (id, estudiante_id, periodo_academico, estado, datos, creada_en) VALUES ('b', 'e', '2025-2', 'rechazada', '{}', 'x')").run();
  assert.deepStrictEqual(servicio.listarPeriodos(DIRECCION), ['2025-2', '2024-1']);
});
