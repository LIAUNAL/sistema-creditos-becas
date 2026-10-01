'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { abrirBaseDeDatos } = require('./baseDeDatos');
const { ejecutarMigraciones } = require('./migraciones');
const { crearRelojFijo } = require('./reloj');
const { crearNotificadorColector } = require('./notificadorColector');
const { crearUnidadDeTrabajo } = require('./unidadDeTrabajo');
const { ejecutarCasoDeUso } = require('./casoDeUso');

// Opcion aditiva `confirmarSiError` (P10): con `false`, un error de la operacion revierte TODO
// (sin volcado de la unidad de trabajo, sin filas de outbox y sin llamar a `persistir`).

function preparar() {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  const reloj = crearRelojFijo(new Date('2026-05-04T12:30:00.000Z'));
  return { db, reloj, colector: crearNotificadorColector() };
}

const filas = (db) => db.prepare('SELECT * FROM notifications ORDER BY id').all();

// Unidad de trabajo falsa: registra si se volco; `correr` solo ejecuta la funcion.
function unidadEspia() {
  const unidad = crearUnidadDeTrabajo();
  unidad.volcado = false;
  const volcar = unidad.volcar.bind(unidad);
  unidad.volcar = (db) => {
    unidad.volcado = true;
    volcar(db);
  };
  return unidad;
}

test('por defecto (confirmarSiError omitido) el estado se confirma aunque la operacion lance', async () => {
  const { db, reloj, colector } = preparar();
  const unidad = unidadEspia();
  let persistido = 0;

  await assert.rejects(
    ejecutarCasoDeUso({
      db,
      colector,
      reloj,
      unidadDeTrabajo: unidad,
      operacion: () => {
        colector.notificarDecision({ estudianteId: 'e1', solicitudId: 's1', estado: 'aprobada' });
        throw new Error('fallo tras mutar');
      },
      persistir: () => {
        persistido += 1;
      },
    }),
    /fallo tras mutar/,
  );

  assert.equal(unidad.volcado, true);
  assert.equal(persistido, 1);
  assert.equal(filas(db).length, 1);
});

test('confirmarSiError false: el error de la operacion no vuelca, no llama a persistir ni inserta outbox, y se relanza', async () => {
  const { db, reloj, colector } = preparar();
  const unidad = unidadEspia();
  const error = new Error('fallo tras mutar');
  let persistido = 0;

  await assert.rejects(
    ejecutarCasoDeUso({
      db,
      colector,
      reloj,
      unidadDeTrabajo: unidad,
      confirmarSiError: false,
      operacion: () => {
        colector.notificarDecision({ estudianteId: 'e1', solicitudId: 's1', estado: 'aprobada' });
        throw error;
      },
      persistir: () => {
        persistido += 1;
      },
    }),
    (lanzado) => lanzado === error,
  );

  assert.equal(unidad.volcado, false);
  assert.equal(persistido, 0);
  assert.equal(filas(db).length, 0);
});

test('confirmarSiError false: un error asincrono de la operacion tambien lo revierte todo', async () => {
  const { db, reloj, colector } = preparar();
  let persistido = 0;

  await assert.rejects(
    ejecutarCasoDeUso({
      db,
      colector,
      reloj,
      confirmarSiError: false,
      operacion: async () => {
        colector.notificarDecision({ estudianteId: 'e1', solicitudId: 's1', estado: 'aprobada' });
        await Promise.resolve();
        throw new Error('fallo asincrono');
      },
      persistir: () => {
        persistido += 1;
      },
    }),
    /fallo asincrono/,
  );

  assert.equal(persistido, 0);
  assert.equal(filas(db).length, 0);
});

test('confirmarSiError false: sin error confirma estado y outbox igual que siempre', async () => {
  const { db, reloj, colector } = preparar();
  const unidad = unidadEspia();
  let recibido;

  const resultado = await ejecutarCasoDeUso({
    db,
    colector,
    reloj,
    unidadDeTrabajo: unidad,
    confirmarSiError: false,
    operacion: () => {
      colector.notificarDecision({ estudianteId: 'e1', solicitudId: 's1', estado: 'aprobada' });
      return 'ok';
    },
    persistir: (argumentos) => {
      recibido = argumentos;
    },
  });

  assert.equal(resultado, 'ok');
  assert.equal(unidad.volcado, true);
  assert.deepStrictEqual(recibido, { resultado: 'ok', error: undefined });
  assert.equal(filas(db).length, 1);
});

test('confirmarSiError false: si persistir lanza se revierte todo y se propaga ese error', async () => {
  const { db, reloj, colector } = preparar();

  await assert.rejects(
    ejecutarCasoDeUso({
      db,
      colector,
      reloj,
      confirmarSiError: false,
      operacion: () => {
        colector.notificarDecision({ estudianteId: 'e1', solicitudId: 's1', estado: 'aprobada' });
      },
      persistir: () => {
        throw new Error('fallo al persistir');
      },
    }),
    /fallo al persistir/,
  );

  assert.equal(filas(db).length, 0);
});
