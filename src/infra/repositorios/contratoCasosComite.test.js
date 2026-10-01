'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { abrirBaseDeDatos } = require('../baseDeDatos');
const { ejecutarMigraciones } = require('../migraciones');
const { enTransaccion } = require('../transaccion');
const { crearUnidadDeTrabajo } = require('../unidadDeTrabajo');
const { crearRepositorioCasosComiteEnMemoria } = require('../../evaluacion-elegibilidad/repositorioCasosComiteEnMemoria');
const { crearRepositorioCasosComiteSqlite } = require('./repositorioCasosComiteSqlite');
const { definirSuiteDeContratoCasosComite, caso } = require('./contratoCasosComite');

function fabricaEnMemoria() {
  return {
    repositorio: crearRepositorioCasosComiteEnMemoria(),
    ciclo: async (fn) => fn(),
    sembrar: () => {},
  };
}

function baseConMigraciones() {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  return db;
}

function sembrarSolicitudBeca(db, id) {
  db.prepare(
    `INSERT INTO scholarship_applications
       (id, estudiante_id, periodo_academico, clasificacion, puntaje, decision_automatica, creada_en, actualizada_en)
     VALUES (?, ?, '2026-1', 'limitrofe', 62.5, 1, '2026-05-04T12:30:00.000Z', '2026-05-04T12:30:00.000Z')`,
  ).run(id, `est-de-${id}`);
}

function cicloSqlite(db) {
  return async (fn) => {
    const unidad = crearUnidadDeTrabajo();
    const resultado = await unidad.correr(fn);
    enTransaccion(db, () => unidad.volcar(db));
    return resultado;
  };
}

function fabricaSqlite() {
  const db = baseConMigraciones();
  return {
    repositorio: crearRepositorioCasosComiteSqlite({ db }),
    ciclo: cicloSqlite(db),
    sembrar: (...ids) => ids.forEach((id) => sembrarSolicitudBeca(db, id)),
    db,
  };
}

definirSuiteDeContratoCasosComite('memoria', fabricaEnMemoria);
definirSuiteDeContratoCasosComite('sqlite', fabricaSqlite);

// ---------------------------------------------------------------- Migracion 008 y persistencia SQLite

test('migracion 008 crea casos_comite con indice por estado', () => {
  const db = baseConMigraciones();
  const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((f) => f.name);
  assert.ok(tablas.includes('casos_comite'));
  const indices = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'casos_comite'").all();
  assert.ok(indices.some((i) => i.name === 'casos_comite_estado'), JSON.stringify(indices));
  assert.strictEqual(db.prepare('SELECT nombre FROM schema_migrations WHERE version = 8').get().nombre, 'casos-comite');
});

test('la fila guarda el periodo, el puntaje, el historial como ISO y la fecha de ingreso', async () => {
  const { repositorio, ciclo, sembrar, db } = fabricaSqlite();
  sembrar('c1');
  await ciclo(() => repositorio.guardarCaso(caso('c1')));

  const fila = db.prepare('SELECT * FROM casos_comite WHERE id = ?').get('c1');
  assert.strictEqual(fila.estudiante_id, 'est-1');
  assert.strictEqual(fila.periodo_academico, '2026-1');
  assert.strictEqual(fila.puntaje, 62.5);
  assert.strictEqual(fila.estado, 'en_revision_comite');
  assert.strictEqual(fila.creada_en, '2026-05-04T12:30:00.000Z');
  assert.deepStrictEqual(JSON.parse(fila.historial), [
    { tipo: 'ingreso_cola_comite', fecha: '2026-05-04T12:30:00.000Z', puntaje: 62.5 },
  ]);
});

test('un caso sin periodo o con un estudiante sin normalizar no se persiste', async () => {
  const { repositorio, ciclo, sembrar } = fabricaSqlite();
  sembrar('c1');
  await assert.rejects(
    () => ciclo(() => repositorio.guardarCaso(caso('c1', { periodoAcademico: undefined }))),
    TypeError,
  );
  const { repositorio: otro, ciclo: otroCiclo, sembrar: otroSembrar } = fabricaSqlite();
  otroSembrar('c1');
  await assert.rejects(
    () => otroCiclo(() => otro.guardarCaso(caso('c1', { estudiante: { promedioAcumulado: 4 } }))),
    TypeError,
  );
});

test('casos_comite exige una solicitud de beca existente (verificado al confirmar)', async () => {
  const { repositorio, ciclo } = fabricaSqlite();
  await assert.rejects(() => ciclo(() => repositorio.guardarCaso(caso('sin-solicitud'))), /FOREIGN KEY/);
});

test('un ciclo que no cambia nada no reescribe filas (deteccion de cambios)', async () => {
  const { repositorio, ciclo, sembrar, db } = fabricaSqlite();
  sembrar('c1');
  await ciclo(() => repositorio.guardarCaso(caso('c1')));
  db.exec(`CREATE TRIGGER no_reescribir BEFORE UPDATE ON casos_comite BEGIN SELECT RAISE(ABORT, 'reescrito'); END`);

  await ciclo(() => repositorio.obtenerCaso('c1'));
  await ciclo(() => repositorio.listarTodos());
});
