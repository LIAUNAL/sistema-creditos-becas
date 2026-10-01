'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { abrirBaseDeDatos } = require('./baseDeDatos');
const { ejecutarMigraciones } = require('./migraciones');
const { enTransaccion } = require('./transaccion');
const { crearUnidadDeTrabajo, ErrorSinUnidadDeTrabajo } = require('./unidadDeTrabajo');
const { crearRepositorioSolicitudesSqlite } = require('./repositorios/repositorioSolicitudesSqlite');
const { solicitud } = require('./repositorios/contrato');

function preparar() {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  // Bitacora de UPDATE sobre solicitudes: permite contar exactamente que filas se reescriben.
  db.exec(`
    CREATE TABLE bitacora_updates (solicitud_id TEXT NOT NULL);
    CREATE TRIGGER solicitudes_bitacora AFTER UPDATE ON solicitudes
    BEGIN INSERT INTO bitacora_updates (solicitud_id) VALUES (NEW.id); END;
  `);
  const solicitudes = crearRepositorioSolicitudesSqlite({ db });
  const ciclo = (fn) => {
    const unidad = crearUnidadDeTrabajo();
    const resultado = unidad.correr(fn);
    enTransaccion(db, () => unidad.volcar(db));
    return resultado;
  };
  const updates = () => db.prepare('SELECT solicitud_id FROM bitacora_updates ORDER BY rowid').all().map((f) => f.solicitud_id);
  return { db, solicitudes, ciclo, updates };
}

test('Escenario: dentro de una unidad de trabajo obtener devuelve siempre la misma instancia', () => {
  const { solicitudes, ciclo } = preparar();
  ciclo(() => {
    solicitudes.guardar(solicitud('s1'));
    solicitudes.guardar(solicitud('s2', { estudianteId: 'est-2' }));
  });

  ciclo(() => {
    const primera = solicitudes.obtener('s1');
    assert.strictEqual(solicitudes.obtener('s1'), primera);
    assert.strictEqual(solicitudes.listarTodas()[0], primera);
    assert.strictEqual(solicitudes.listarPorEstudiante('est-1')[0], primera);
    assert.strictEqual(solicitudes.buscarActivaPorEstudianteYPeriodo('est-1', '2026-1'), primera);
  });
});

test('Escenario: unidades de trabajo distintas no comparten instancias', () => {
  const { solicitudes, ciclo } = preparar();
  ciclo(() => solicitudes.guardar(solicitud('s1')));

  const a = ciclo(() => solicitudes.obtener('s1'));
  const b = ciclo(() => solicitudes.obtener('s1'));
  assert.notStrictEqual(a, b);
  assert.deepStrictEqual(a, b);
});

test('Escenario: volcar reescribe solo las filas cambiadas y no repite el UPDATE', () => {
  const { solicitudes, ciclo, updates } = preparar();
  ciclo(() => {
    solicitudes.guardar(solicitud('s1'));
    solicitudes.guardar(solicitud('s2', { estudianteId: 'est-2' }));
  });
  assert.deepStrictEqual(updates(), [], 'la creacion es INSERT, no UPDATE');

  ciclo(() => {
    solicitudes.obtener('s1');
    solicitudes.obtener('s2').estado = 'pendiente_revision';
  });
  assert.deepStrictEqual(updates(), ['s2']);

  ciclo(() => {
    solicitudes.listarTodas();
  });
  assert.deepStrictEqual(updates(), ['s2'], 'sin cambios no hay UPDATE');
});

test('volcar dos veces en la misma unidad solo escribe la primera vez', () => {
  const { db, solicitudes, updates } = preparar();
  const unidad = crearUnidadDeTrabajo();
  unidad.correr(() => solicitudes.guardar(solicitud('s1')));
  enTransaccion(db, () => unidad.volcar(db));
  unidad.correr(() => {
    solicitudes.obtener('s1').estado = 'aprobada';
  });
  enTransaccion(db, () => unidad.volcar(db));
  enTransaccion(db, () => unidad.volcar(db));
  assert.deepStrictEqual(updates(), ['s1']);
});

test('un campo de datos modificado tambien se detecta como cambio', () => {
  const { solicitudes, ciclo, updates } = preparar();
  ciclo(() => solicitudes.guardar(solicitud('s1')));
  ciclo(() => {
    solicitudes.obtener('s1').ingresosHogar = 9999;
  });
  assert.deepStrictEqual(updates(), ['s1']);
  assert.equal(ciclo(() => solicitudes.obtener('s1')).ingresosHogar, 9999);
});

test('guardar un objeto distinto con el mismo id de uno ya cargado lo reemplaza en la unidad', () => {
  const { solicitudes, ciclo } = preparar();
  ciclo(() => solicitudes.guardar(solicitud('s1')));
  ciclo(() => {
    solicitudes.obtener('s1');
    solicitudes.guardar(solicitud('s1', { estado: 'aprobada' }));
    assert.equal(solicitudes.obtener('s1').estado, 'aprobada');
  });
  assert.equal(ciclo(() => solicitudes.obtener('s1')).estado, 'aprobada');
});

test('guardar una solicitud ya existente en la base, sin haberla cargado, no viola la clave primaria', () => {
  const { solicitudes, ciclo } = preparar();
  ciclo(() => solicitudes.guardar(solicitud('s1')));
  assert.doesNotThrow(() => ciclo(() => solicitudes.guardar(solicitud('s1', { estado: 'aprobada' }))));
  assert.equal(ciclo(() => solicitudes.obtener('s1')).estado, 'aprobada');
});

test('un repositorio SQLite usado fuera de una unidad de trabajo lanza ErrorSinUnidadDeTrabajo', () => {
  const { solicitudes } = preparar();
  assert.throws(
    () => solicitudes.obtener('s1'),
    (error) => error instanceof ErrorSinUnidadDeTrabajo && error.codigo === 'UNIDAD_DE_TRABAJO_SIN_CONTEXTO',
  );
});

test('una solicitud sin creadaEn se rechaza al guardar con un error claro', () => {
  const { solicitudes, ciclo } = preparar();
  const sinFecha = solicitud('s1');
  delete sinFecha.creadaEn;
  assert.throws(() => ciclo(() => solicitudes.guardar(sinFecha)), /creadaEn/);
});
