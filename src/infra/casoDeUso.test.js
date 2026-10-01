'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { abrirBaseDeDatos } = require('./baseDeDatos');
const { ejecutarMigraciones } = require('./migraciones');
const { crearRelojFijo } = require('./reloj');
const { crearNotificadorColector } = require('./notificadorColector');
const { ejecutarCasoDeUso, entregarPendientes } = require('./casoDeUso');
const { crearEjecucionDesembolso } = require('../desembolso/ejecucionDesembolso');

function preparar() {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  db.exec('CREATE TABLE desembolsos_prueba (id TEXT PRIMARY KEY, estado TEXT NOT NULL)');
  db.prepare('INSERT INTO desembolsos_prueba (id, estado) VALUES (?, ?)').run('d1', 'programado');
  const reloj = crearRelojFijo(new Date('2026-05-04T12:30:00.000Z'));
  return { db, reloj, colector: crearNotificadorColector() };
}

const estadoDe = (db, id = 'd1') =>
  db.prepare('SELECT estado FROM desembolsos_prueba WHERE id = ?').get(id)?.estado;
const filas = (db) => db.prepare('SELECT * FROM notifications ORDER BY id').all();

const guardarEstado = (db, desembolso) =>
  db
    .prepare('UPDATE desembolsos_prueba SET estado = ? WHERE id = ?')
    .run(desembolso.estado, desembolso.id);

test('migracion 004 crea notifications con sus restricciones', () => {
  const { db } = preparar();
  const insertar = (tipo, dt) =>
    db
      .prepare(
        'INSERT INTO notifications (tipo, destinatario_tipo, destinatario_id, payload, creada_en) VALUES (?, ?, ?, ?, ?)',
      )
      .run(tipo, dt, 'x', '{}', '2026-01-01T00:00:00.000Z');
  assert.doesNotThrow(() => insertar('envio', 'estudiante'));
  assert.throws(() => insertar('otro', 'estudiante'));
  assert.throws(() => insertar('envio', 'otro'));
  const fila = filas(db)[0];
  assert.equal(fila.intentos, 0);
  assert.equal(fila.entregada_en, null);
  assert.equal(fila.leida_en, null);
});

test('Escenario: el estado mutado persiste y la excepcion se propaga cuando el modulo lanza tras mutar', async () => {
  const { db, reloj, colector } = preparar();
  const desembolso = { id: 'd1', estado: 'programado' };
  const moduloQueLanza = async () => {
    desembolso.estado = 'ejecutado';
    colector.notificarDesembolso({ solicitudId: 's1', desembolsoId: 'd1' });
    throw new Error('fallo despues de mutar');
  };

  await assert.rejects(
    ejecutarCasoDeUso({
      db,
      colector,
      reloj,
      operacion: moduloQueLanza,
      persistir: () => guardarEstado(db, desembolso),
    }),
    /fallo despues de mutar/,
  );

  assert.equal(estadoDe(db), 'ejecutado');
  assert.equal(filas(db).length, 1);
});

test('Escenario: estado y filas del outbox confirman juntos (camino feliz)', async () => {
  const { db, reloj, colector } = preparar();
  const desembolso = { id: 'd1', estado: 'programado' };
  const resultado = await ejecutarCasoDeUso({
    db,
    colector,
    reloj,
    operacion: () => {
      desembolso.estado = 'ejecutado';
      colector.notificarDesembolso({ solicitudId: 's1', desembolsoId: 'd1' });
      return 'ok';
    },
    persistir: () => guardarEstado(db, desembolso),
  });
  assert.equal(resultado, 'ok');
  assert.equal(estadoDe(db), 'ejecutado');
  const [fila] = filas(db);
  assert.equal(fila.tipo, 'desembolso');
  assert.equal(fila.destinatario_tipo, 'solicitud');
  assert.equal(fila.destinatario_id, 's1');
  assert.equal(fila.creada_en, '2026-05-04T12:30:00.000Z');
  assert.deepEqual(JSON.parse(fila.payload), { solicitudId: 's1', desembolsoId: 'd1' });
});

test('Escenario: si falla la insercion en el outbox no se confirma ni el estado', async () => {
  const { db, reloj, colector } = preparar();
  db.exec(
    "CREATE TRIGGER falla_outbox BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT, 'outbox roto'); END",
  );
  const desembolso = { id: 'd1', estado: 'programado' };

  await assert.rejects(
    ejecutarCasoDeUso({
      db,
      colector,
      reloj,
      operacion: () => {
        desembolso.estado = 'ejecutado';
        colector.notificarDesembolso({ solicitudId: 's1', desembolsoId: 'd1' });
      },
      persistir: () => guardarEstado(db, desembolso),
    }),
    /outbox roto/,
  );

  assert.equal(estadoDe(db), 'programado');
  assert.equal(filas(db).length, 0);
});

test('Escenario: si falla el guardado del estado no se confirma ninguna fila del outbox', async () => {
  const { db, reloj, colector } = preparar();
  await assert.rejects(
    ejecutarCasoDeUso({
      db,
      colector,
      reloj,
      operacion: () => colector.notificarDesembolso({ solicitudId: 's1', desembolsoId: 'd1' }),
      persistir: () => {
        throw new Error('guardado roto');
      },
    }),
    /guardado roto/,
  );
  assert.equal(filas(db).length, 0);
  assert.equal(estadoDe(db), 'programado');
});

test('si la operacion tiene exito pero persistir lanza, se revierte todo y se propaga el error de persistencia', async () => {
  const { db, reloj, colector } = preparar();
  await assert.rejects(
    ejecutarCasoDeUso({
      db,
      colector,
      reloj,
      operacion: () => colector.notificarDesembolso({ solicitudId: 's1', desembolsoId: 'd1' }),
      persistir: ({ resultado, error }) => {
        assert.equal(error, undefined);
        assert.equal(resultado, undefined);
        db.prepare("UPDATE desembolsos_prueba SET estado = 'ejecutado'").run();
        throw new Error('persistir fallo');
      },
    }),
    /persistir fallo/,
  );
  assert.equal(estadoDe(db), 'programado');
  assert.equal(filas(db).length, 0);
});

test('persistir recibe el resultado y el error de la operacion', async () => {
  const { db, reloj, colector } = preparar();
  let recibido;
  await ejecutarCasoDeUso({
    db,
    colector,
    reloj,
    operacion: () => 7,
    persistir: (datos) => {
      recibido = datos;
    },
  });
  assert.deepEqual(recibido, { resultado: 7, error: undefined });
});

test('persistir asincrono se rechaza (ninguna transaccion cruza un await)', async () => {
  const { db, reloj, colector } = preparar();
  await assert.rejects(
    ejecutarCasoDeUso({
      db,
      colector,
      reloj,
      operacion: () => colector.notificarDesembolso({ solicitudId: 's1', desembolsoId: 'd1' }),
      persistir: async () => {},
    }),
    (error) => error.codigo === 'TRANSACCION_ASINCRONA',
  );
  assert.equal(filas(db).length, 0);
});

test('Escenario: la entrega posterior al commit marca las filas y un fallo no revierte el estado', async () => {
  const { db, reloj, colector } = preparar();
  const desembolso = { id: 'd1', estado: 'programado' };
  await ejecutarCasoDeUso({
    db,
    colector,
    reloj,
    operacion: () => {
      desembolso.estado = 'ejecutado';
      colector.notificarDesembolso({ solicitudId: 's1', desembolsoId: 'd1' });
      colector.notificarCasoLimitrofe({ idCaso: 'c1', puntaje: 50 });
    },
    persistir: () => guardarEstado(db, desembolso),
  });
  assert.equal(filas(db).length, 2);

  // la primera entrega falla, la segunda funciona
  let llamadas = 0;
  const resumen = await entregarPendientes({
    db,
    reloj,
    entregar: async () => {
      llamadas += 1;
      if (llamadas === 1) throw new Error('canal caido');
    },
  });
  assert.deepEqual(resumen, { entregadas: 1, fallidas: 1 });
  const [fallida, entregada] = filas(db);
  assert.equal(fallida.entregada_en, null);
  assert.equal(fallida.intentos, 1);
  assert.equal(fallida.ultimo_error, 'canal caido');
  assert.equal(entregada.entregada_en, '2026-05-04T12:30:00.000Z');
  assert.equal(estadoDe(db), 'ejecutado');

  // reintento: solo queda la pendiente; la entrega por defecto es un no-op exitoso
  const segunda = await entregarPendientes({ db, reloj });
  assert.deepEqual(segunda, { entregadas: 1, fallidas: 0 });
  assert.equal(filas(db).every((f) => f.entregada_en !== null), true);
  assert.deepEqual(await entregarPendientes({ db, reloj }), { entregadas: 0, fallidas: 0 });
});

test('entregarPendientes respeta el limite', async () => {
  const { db, reloj, colector } = preparar();
  await ejecutarCasoDeUso({
    db,
    colector,
    reloj,
    operacion: () => {
      colector.notificarCasoLimitrofe({ idCaso: 'c1', puntaje: 1 });
      colector.notificarCasoLimitrofe({ idCaso: 'c2', puntaje: 2 });
      colector.notificarCasoLimitrofe({ idCaso: 'c3', puntaje: 3 });
    },
    persistir: () => {},
  });
  const resumen = await entregarPendientes({ db, reloj, limite: 2 });
  assert.deepEqual(resumen, { entregadas: 2, fallidas: 0 });
});

test('el modulo real crearEjecucionDesembolso con el colector persiste ejecutado y una fila del outbox', async () => {
  const { db, reloj, colector } = preparar();
  const ejecucion = crearEjecucionDesembolso({
    notificador: colector,
    reloj: () => new Date('2026-03-15T10:00:00Z'),
  });
  const desembolso = {
    id: 'd1',
    solicitudId: 's1',
    numeroCuota: 1,
    monto: 1000,
    estado: 'programado',
  };

  await ejecutarCasoDeUso({
    db,
    colector,
    reloj,
    operacion: () => ejecucion.ejecutar(desembolso),
    persistir: () => guardarEstado(db, desembolso),
  });

  assert.equal(estadoDe(db), 'ejecutado');
  const [fila] = filas(db);
  assert.equal(fila.tipo, 'desembolso');
  assert.equal(JSON.parse(fila.payload).fecha, '2026-03-15');
});

test('dos casos de uso concurrentes escriben cada uno solo sus notificaciones', async () => {
  const { db, reloj, colector } = preparar();
  const esperar = () => new Promise((resolve) => setImmediate(resolve));
  const caso = (id) =>
    ejecutarCasoDeUso({
      db,
      colector,
      reloj,
      operacion: async () => {
        colector.notificarCasoLimitrofe({ idCaso: `${id}-1`, puntaje: 1 });
        await esperar();
        colector.notificarCasoLimitrofe({ idCaso: `${id}-2`, puntaje: 2 });
      },
      persistir: () => {},
    });
  await Promise.all([caso('A'), caso('B')]);
  const ids = filas(db).map((f) => JSON.parse(f.payload).idCaso);
  assert.deepEqual([...ids].sort(), ['A-1', 'A-2', 'B-1', 'B-2']);
});
