'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { abrirBaseDeDatos } = require('./baseDeDatos');
const { ejecutarMigraciones } = require('./migraciones');
const { crearAuditoria } = require('./auditoria');
const { crearAsignaciones } = require('./asignaciones');
const { crearRelojFijo } = require('./reloj');

function preparar() {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  const insertar = db.prepare(
    "INSERT INTO usuarios (nombre_usuario, hash_contrasena, rol, activo) VALUES (?, 'x', ?, 1)",
  );
  const crear = (nombre, rol) => ({
    id: Number(insertar.run(nombre, rol).lastInsertRowid),
    nombre_usuario: nombre,
    rol,
  });
  const reloj = crearRelojFijo(new Date('2026-05-04T12:30:00.000Z'));
  const auditoria = crearAuditoria({ db, reloj });
  const asignaciones = crearAsignaciones({ db, reloj, auditoria });
  return {
    db,
    auditoria,
    asignaciones,
    asesor1: crear('asesor1', 'asesor_financiero'),
    asesor2: crear('asesor2', 'asesor_financiero'),
    comite1: crear('comite1', 'comite_becas'),
    comite2: crear('comite2', 'comite_becas'),
    estudiante: crear('estudiante1', 'estudiante'),
    direccion: crear('direccion1', 'direccion_academica'),
  };
}

test('la migracion 003 crea la tabla asignaciones con unicidad por recurso y usuario', () => {
  const { db, asesor1 } = preparar();
  const columnas = db.prepare('PRAGMA table_info(asignaciones)').all().map((c) => c.name);
  assert.deepStrictEqual(columnas, [
    'id',
    'tipo_recurso',
    'recurso_id',
    'usuario_id',
    'rol',
    'asignada_en',
  ]);
  const insertar = db.prepare(
    "INSERT INTO asignaciones (tipo_recurso, recurso_id, usuario_id, rol, asignada_en) VALUES (?, ?, ?, 'asesor_financiero', 'ahora')",
  );
  insertar.run('solicitud_credito', 's1', asesor1.id);
  assert.throws(() => insertar.run('solicitud_credito', 's1', asesor1.id), /UNIQUE/);
  assert.throws(() => insertar.run('otro_tipo', 's2', asesor1.id), /CHECK/);
});

test('asignar guarda la asignacion con la fecha del reloj y registra "asignar" en audit_log', () => {
  const { asignaciones, auditoria, asesor1, direccion } = preparar();
  const actor = { nombre_usuario: direccion.nombre_usuario, rol: direccion.rol };
  const resultado = asignaciones.asignar({
    tipoRecurso: 'solicitud_credito',
    recursoId: 'sol-1',
    usuarioId: asesor1.id,
    rol: 'asesor_financiero',
    actor,
  });
  assert.strictEqual(resultado.creada, true);
  assert.strictEqual(asignaciones.estaAsignado(asesor1.id, 'solicitud_credito', 'sol-1'), true);
  const [fila] = asignaciones.listarPorRecurso('solicitud_credito', 'sol-1');
  assert.strictEqual(fila.usuarioId, asesor1.id);
  assert.strictEqual(fila.rol, 'asesor_financiero');
  assert.strictEqual(fila.asignadaEn, '2026-05-04T12:30:00.000Z');
  const [entrada] = auditoria.listar();
  assert.strictEqual(entrada.accion, 'asignar');
  assert.strictEqual(entrada.actor, 'direccion1');
  assert.strictEqual(entrada.objetivo, 'solicitud_credito:sol-1');
  assert.deepStrictEqual(entrada.detalle, { usuarioId: asesor1.id, rol: 'asesor_financiero' });
});

test('asignar es idempotente: repetirla no duplica la fila ni la entrada de auditoria', () => {
  const { asignaciones, auditoria, comite1 } = preparar();
  const datos = {
    tipoRecurso: 'caso_comite',
    recursoId: 'caso-1',
    usuarioId: comite1.id,
    rol: 'comite_becas',
    actor: { nombre_usuario: 'sistema', rol: 'sistema' },
  };
  assert.strictEqual(asignaciones.asignar(datos).creada, true);
  assert.strictEqual(asignaciones.asignar(datos).creada, false);
  assert.strictEqual(asignaciones.listarPorRecurso('caso_comite', 'caso-1').length, 1);
  assert.strictEqual(auditoria.listar().length, 1);
});

test('asignar rechaza tipo de recurso, usuario o actor invalidos', () => {
  const { asignaciones } = preparar();
  const actor = { nombre_usuario: 'sistema', rol: 'sistema' };
  assert.throws(
    () => asignaciones.asignar({ tipoRecurso: 'otro', recursoId: '1', usuarioId: 1, rol: 'x', actor }),
    { codigo: 'TIPO_RECURSO_INVALIDO' },
  );
  assert.throws(
    () =>
      asignaciones.asignar({
        tipoRecurso: 'caso_comite',
        recursoId: '1',
        usuarioId: 9999,
        rol: 'comite_becas',
        actor,
      }),
    { codigo: 'USUARIO_NO_ENCONTRADO' },
  );
});

test('reclamar: un asesor toma una solicitud sin asignar y queda en asignaciones y audit_log', () => {
  const { asignaciones, auditoria, asesor1 } = preparar();
  const resultado = asignaciones.reclamar({ solicitudId: 'sol-9', usuario: asesor1 });
  assert.strictEqual(resultado.creada, true);
  assert.strictEqual(asignaciones.estaAsignado(asesor1.id, 'solicitud_credito', 'sol-9'), true);
  const [entrada] = auditoria.listar();
  assert.strictEqual(entrada.accion, 'asignar');
  assert.strictEqual(entrada.actor, 'asesor1');
});

test('reclamar falla si la solicitud ya esta asignada a otro asesor', () => {
  const { asignaciones, asesor1, asesor2 } = preparar();
  asignaciones.reclamar({ solicitudId: 'sol-9', usuario: asesor1 });
  assert.throws(() => asignaciones.reclamar({ solicitudId: 'sol-9', usuario: asesor2 }), {
    codigo: 'SOLICITUD_YA_ASIGNADA',
  });
  assert.strictEqual(asignaciones.estaAsignado(asesor2.id, 'solicitud_credito', 'sol-9'), false);
  // Reclamar de nuevo la propia es idempotente.
  assert.strictEqual(asignaciones.reclamar({ solicitudId: 'sol-9', usuario: asesor1 }).creada, false);
});

test('reclamar solo lo puede hacer un asesor financiero', () => {
  const { asignaciones, estudiante, comite1 } = preparar();
  for (const usuario of [estudiante, comite1]) {
    assert.throws(() => asignaciones.reclamar({ solicitudId: 's', usuario }), {
      codigo: 'ROL_NO_PERMITIDO',
      estadoHttp: 403,
    });
  }
});

test('asignarComiteACaso asigna a todos los integrantes activos del comite (regla Q5 por defecto)', () => {
  const { db, asignaciones, comite1, comite2, asesor1 } = preparar();
  db.prepare(
    "INSERT INTO usuarios (nombre_usuario, hash_contrasena, rol, activo) VALUES ('comite_baja', 'x', 'comite_becas', 0)",
  ).run();
  asignaciones.asignarComiteACaso({
    casoId: 'caso-5',
    actor: { nombre_usuario: 'sistema', rol: 'sistema' },
  });
  assert.strictEqual(asignaciones.estaAsignado(comite1.id, 'caso_comite', 'caso-5'), true);
  assert.strictEqual(asignaciones.estaAsignado(comite2.id, 'caso_comite', 'caso-5'), true);
  assert.strictEqual(asignaciones.estaAsignado(asesor1.id, 'caso_comite', 'caso-5'), false);
  assert.strictEqual(asignaciones.listarPorRecurso('caso_comite', 'caso-5').length, 2);
});

test('estaAsignado no confunde recursos de distinto tipo ni ids numericos con texto', () => {
  const { asignaciones, asesor1 } = preparar();
  asignaciones.reclamar({ solicitudId: 7, usuario: asesor1 });
  assert.strictEqual(asignaciones.estaAsignado(asesor1.id, 'solicitud_credito', '7'), true);
  assert.strictEqual(asignaciones.estaAsignado(asesor1.id, 'caso_comite', '7'), false);
});
