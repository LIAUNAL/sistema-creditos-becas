'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { abrirBaseDeDatos } = require('./baseDeDatos');
const { ejecutarMigraciones } = require('./migraciones');
const { MIGRACIONES } = require('./versiones/indice');

// Story 5.15 (P15): la migracion 009 reconstruye `notifications` para permitir el tipo `desembolso_vencido`.
// SQLite no puede alterar un CHECK: se copia la tabla conservando datos, ids e indices.

const filas = (db, sql) => db.prepare(sql).all().map((f) => ({ ...f }));

function baseHastaVersion8() {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db, MIGRACIONES.filter((m) => m.version <= 8));
  return db;
}

const insertar = (db, tipo, destinatarioTipo, destinatarioId, extra = {}) =>
  db
    .prepare(
      `INSERT INTO notifications (tipo, destinatario_tipo, destinatario_id, payload, creada_en, entregada_en, intentos, ultimo_error, leida_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      tipo,
      destinatarioTipo,
      destinatarioId,
      JSON.stringify({ n: destinatarioId }),
      '2026-05-04T12:00:00.000Z',
      extra.entregadaEn ?? null,
      extra.intentos ?? 0,
      extra.ultimoError ?? null,
      extra.leidaEn ?? null,
    );

test('la migracion 009 conserva las filas existentes, sus ids y sus indices', () => {
  const db = baseHastaVersion8();
  insertar(db, 'envio', 'estudiante', 'e1');
  insertar(db, 'decision', 'estudiante', 'e1', { entregadaEn: '2026-05-04T13:00:00.000Z', leidaEn: '2026-05-05T08:00:00.000Z' });
  insertar(db, 'desembolso', 'solicitud', 's1', { intentos: 2, ultimoError: 'fallo previo' });
  insertar(db, 'caso_limitrofe', 'rol', 'comite_becas');
  // Deja un hueco: la secuencia AUTOINCREMENT (4) queda por encima del mayor id vivo (3).
  db.prepare('DELETE FROM notifications WHERE id = 4').run();
  const antes = filas(db, 'SELECT * FROM notifications ORDER BY id');

  // Solo hasta la 009: las migraciones posteriores (010 en adelante) tienen sus propias pruebas.
  const aplicadas = ejecutarMigraciones(db, MIGRACIONES.filter((m) => m.version <= 9));

  assert.deepStrictEqual(aplicadas, [9]);
  assert.deepStrictEqual(filas(db, 'SELECT * FROM notifications ORDER BY id'), antes);
  assert.deepStrictEqual(
    filas(db, "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'notifications' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((f) => f.name),
    ['notifications_destinatario', 'notifications_pendientes'],
  );
  const nueva = insertar(db, 'desembolso_vencido', 'solicitud', 's1');
  assert.strictEqual(Number(nueva.lastInsertRowid), 5, 'la secuencia de ids continua donde iba');
  db.close();
});

test('la migracion 009 permite el tipo desembolso_vencido y sigue rechazando tipos y destinatarios desconocidos', () => {
  const db = baseHastaVersion8();
  assert.throws(() => insertar(db, 'desembolso_vencido', 'solicitud', 's1'), /CHECK constraint failed/);
  ejecutarMigraciones(db);

  assert.doesNotThrow(() => insertar(db, 'desembolso_vencido', 'solicitud', 's1'));
  for (const tipo of ['envio', 'decision', 'caso_limitrofe', 'desembolso']) {
    assert.doesNotThrow(() => insertar(db, tipo, tipo === 'caso_limitrofe' ? 'rol' : 'estudiante', 'x'), tipo);
  }
  assert.throws(() => insertar(db, 'inventado', 'solicitud', 's1'), /CHECK constraint failed/);
  assert.throws(() => insertar(db, 'envio', 'otro', 's1'), /CHECK constraint failed/);
  db.close();
});

test('la migracion 009 es una base nueva tambien (desde cero) y se registra una sola vez', () => {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  assert.deepStrictEqual(ejecutarMigraciones(db), []);
  assert.strictEqual(filas(db, 'SELECT version FROM schema_migrations WHERE version = 9').length, 1);
  assert.doesNotThrow(() => insertar(db, 'desembolso_vencido', 'solicitud', 's1'));
  db.close();
});
