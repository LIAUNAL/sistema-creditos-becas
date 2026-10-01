'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { abrirBaseDeDatos } = require('../baseDeDatos');
const { ejecutarMigraciones } = require('../migraciones');
const { enTransaccion } = require('../transaccion');
const { crearUnidadDeTrabajo } = require('../unidadDeTrabajo');
const { crearRepositorioCalendarioEnMemoria } = require('../../desembolso/repositorioCalendarioEnMemoria');
const { crearRepositorioCalendarioSqlite } = require('./repositorioCalendarioSqlite');
const { crearRepositorioCondicionesSqlite } = require('./repositorioCondicionesSqlite');
const { definirSuiteDeContratoCalendario } = require('./contratoCalendario');

function fabricaEnMemoria() {
  return {
    repositorio: crearRepositorioCalendarioEnMemoria(),
    ciclo: (fn) => fn(),
    sembrar: () => {},
  };
}

function baseConMigraciones() {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  return db;
}

function sembrarSolicitud(db, id) {
  db.prepare(
    `INSERT INTO solicitudes (id, estudiante_id, periodo_academico, estado, datos, creada_en)
     VALUES (?, 'est-1', '2026-1', 'aprobada', '{}', '2026-01-01T00:00:00.000Z')`,
  ).run(id);
}

function cicloSqlite(db) {
  return (fn) => {
    const unidad = crearUnidadDeTrabajo();
    const resultado = unidad.correr(fn);
    enTransaccion(db, () => unidad.volcar(db));
    return resultado;
  };
}

function fabricaSqlite() {
  const db = baseConMigraciones();
  return {
    repositorio: crearRepositorioCalendarioSqlite({ db }),
    ciclo: cicloSqlite(db),
    sembrar: (...ids) => ids.forEach((id) => sembrarSolicitud(db, id)),
  };
}

definirSuiteDeContratoCalendario('memoria', fabricaEnMemoria);
definirSuiteDeContratoCalendario('sqlite', fabricaSqlite);

// ---------------------------------------------------------------- Migracion 006 y condiciones

test('migracion 006 crea condiciones_credito, desembolsos y calendar_errors', () => {
  const db = baseConMigraciones();
  const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((f) => f.name);
  for (const tabla of ['condiciones_credito', 'desembolsos', 'calendar_errors']) {
    assert.ok(tablas.includes(tabla), tabla);
  }
  const version = db.prepare('SELECT nombre FROM schema_migrations WHERE version = 6').get();
  assert.equal(version.nombre, 'condiciones-desembolsos');
});

test('desembolsos exige solicitud existente y rechaza cuotas repetidas de una misma solicitud', () => {
  const db = baseConMigraciones();
  const insertar = (id, solicitudId, cuota) =>
    db
      .prepare(
        `INSERT INTO desembolsos (id, solicitud_id, numero_cuota, fecha, monto, estado)
         VALUES (?, ?, ?, '2026-12-01', 100, 'programado')`,
      )
      .run(id, solicitudId, cuota);

  assert.throws(() => insertar('d0', 'sin-solicitud', 1), /FOREIGN KEY/);
  sembrarSolicitud(db, 's1');
  insertar('d1', 's1', 1);
  assert.throws(() => insertar('d2', 's1', 1), /UNIQUE/);
  assert.doesNotThrow(() => insertar('d3', 's1', 2));
});

test('el repositorio de condiciones guarda y recarga los terminos aprobados', () => {
  const db = baseConMigraciones();
  sembrarSolicitud(db, 's1');
  const repositorio = crearRepositorioCondicionesSqlite({ db });
  const ciclo = cicloSqlite(db);
  const condiciones = {
    monto: 1200000,
    numeroCuotas: 4,
    fechaPrimeraCuota: '2026-12-01',
    tipoCredito: 'credito',
    creadaEn: '2026-05-04T12:30:00.000Z',
  };

  ciclo(() => repositorio.guardarCondiciones('s1', condiciones));

  assert.deepStrictEqual(ciclo(() => repositorio.obtenerCondiciones('s1')), condiciones);
  assert.equal(ciclo(() => repositorio.obtenerCondiciones('s2')), undefined);
});
