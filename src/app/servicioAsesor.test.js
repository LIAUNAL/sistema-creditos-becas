'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { abrirBaseDeDatos } = require('../infra/baseDeDatos');
const { ejecutarMigraciones } = require('../infra/migraciones');
const { crearAuditoria } = require('../infra/auditoria');
const { crearRelojFijo } = require('../infra/reloj');
const { crearContextoApp } = require('./contextoApp');
const { crearServicioAsesor } = require('./servicioAsesor');

const DATOS = { periodoAcademico: '2026-1', ingresosHogar: '1500000', numeroDependientes: '2', estrato: '3', ocupacionAcudiente: 'docente' };
const DOCUMENTOS = [
  { tipo: 'identificacion', nombreArchivo: 'id.pdf' },
  { tipo: 'certificado_ingresos', nombreArchivo: 'ingresos.pdf' },
  { tipo: 'certificado_matricula', nombreArchivo: 'matricula.png' },
];

// `envolverAuditoria` permite forzar fallos de auditoria para probar la atomicidad.
function preparar({ envolverAuditoria = (auditoria) => auditoria } = {}) {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  const insertar = db.prepare("INSERT INTO usuarios (nombre_usuario, hash_contrasena, rol, activo) VALUES (?, 'x', ?, 1)");
  const crear = (nombre, rol) => ({ id: Number(insertar.run(nombre, rol).lastInsertRowid), nombre_usuario: nombre, rol });
  const usuarios = {
    estudiante: crear('estudiante', 'estudiante'),
    asesor: crear('asesor1', 'asesor_financiero'),
    otroAsesor: crear('asesor2', 'asesor_financiero'),
    comite: crear('comite', 'comite_becas'),
  };
  const reloj = crearRelojFijo(new Date('2026-05-04T12:30:00.000Z'));
  const auditoria = envolverAuditoria(crearAuditoria({ db, reloj }));
  const contexto = crearContextoApp({ db, reloj, auditoria });
  const servicio = crearServicioAsesor({ db, reloj, auditoria, ...contexto });
  return { db, usuarios, contexto, servicio, reloj };
}

async function solicitudEnviada({ contexto, usuarios }, periodo = '2026-1') {
  const s = contexto.servicioSolicitudes;
  const creada = await s.crearSolicitud(usuarios.estudiante, { ...DATOS, periodoAcademico: periodo });
  for (const documento of DOCUMENTOS) await s.adjuntarDocumento(usuarios.estudiante, creada.id, documento);
  await s.confirmarEnvio(usuarios.estudiante, creada.id);
  return creada.id;
}

const filas = (db, sql, ...parametros) => db.prepare(sql).all(...parametros).map((f) => ({ ...f }));
const estado = (db, id) => db.prepare('SELECT estado FROM solicitudes WHERE id = ?').get(id).estado;

test('solo el rol asesor_financiero puede usar los casos de uso del asesor (403)', async () => {
  const p = preparar();
  const id = await solicitudEnviada(p);
  for (const usuario of [p.usuarios.estudiante, p.usuarios.comite]) {
    await assert.rejects(p.servicio.listarCola(usuario), { estadoHttp: 403 });
    await assert.rejects(p.servicio.reclamar(usuario, id), { estadoHttp: 403 });
    await assert.rejects(p.servicio.obtenerParaAsesor(usuario, id), { estadoHttp: 403 });
    await assert.rejects(p.servicio.rechazar(usuario, id, { motivo: 'x' }), { estadoHttp: 403 });
  }
});

test('listarCola devuelve las sin asignar y las propias, sin datos socioeconomicos', async () => {
  const p = preparar();
  const propia = await solicitudEnviada(p, '2026-1');
  const libre = await solicitudEnviada(p, '2026-2');
  const ajena = await solicitudEnviada(p, '2026-3');
  await p.servicio.reclamar(p.usuarios.asesor, propia);
  await p.servicio.reclamar(p.usuarios.otroAsesor, ajena);

  const cola = await p.servicio.listarCola(p.usuarios.asesor);

  assert.deepStrictEqual(
    cola.map((e) => [e.id, e.asignadaAMi]),
    [[propia, true], [libre, false]],
  );
  assert.ok(!JSON.stringify(cola).includes('ingresosHogar'));
});

test('reclamar y rechazar escriben auditoria, estado y outbox en una sola transaccion', async () => {
  const p = preparar();
  const id = await solicitudEnviada(p);
  await p.servicio.reclamar(p.usuarios.asesor, id);

  const resultado = await p.servicio.rechazar(p.usuarios.asesor, id, { motivo: '  Documentos ilegibles ' });

  assert.strictEqual(resultado.estado, 'rechazada');
  assert.strictEqual(estado(p.db, id), 'rechazada');
  const [rechazo] = filas(p.db, "SELECT * FROM audit_log WHERE accion = 'rechazar'");
  assert.strictEqual(rechazo.objetivo, `solicitud_credito:${id}`);
  assert.strictEqual(rechazo.fecha, '2026-05-04T12:30:00.000Z');
  assert.deepStrictEqual(JSON.parse(rechazo.detalle), { motivo: 'Documentos ilegibles' });
  assert.strictEqual(filas(p.db, "SELECT * FROM notifications WHERE tipo = 'decision'").length, 1);
});

test('si falla la auditoria del rechazo no se confirma ni el estado, ni la decision, ni el aviso', async () => {
  const p = preparar({
    envolverAuditoria: (auditoria) => ({
      ...auditoria,
      registrar(entrada) {
        if (entrada.accion === 'rechazar') throw new Error('fallo forzado de auditoria');
        return auditoria.registrar(entrada);
      },
    }),
  });
  const id = await solicitudEnviada(p);
  await p.servicio.reclamar(p.usuarios.asesor, id);

  await assert.rejects(p.servicio.rechazar(p.usuarios.asesor, id, { motivo: 'x' }), /fallo forzado de auditoria/);

  assert.strictEqual(estado(p.db, id), 'pendiente_revision');
  assert.strictEqual(filas(p.db, 'SELECT * FROM decisiones_solicitud').length, 0);
  assert.strictEqual(filas(p.db, "SELECT * FROM notifications WHERE tipo = 'decision'").length, 0);
  assert.strictEqual(filas(p.db, "SELECT * FROM audit_log WHERE accion = 'rechazar'").length, 0);
});

test('si falla el outbox tampoco se confirma la auditoria ni el estado', async () => {
  const p = preparar();
  const id = await solicitudEnviada(p);
  await p.servicio.reclamar(p.usuarios.asesor, id);
  p.db.exec('ALTER TABLE notifications RENAME TO notifications_rota');

  await assert.rejects(p.servicio.rechazar(p.usuarios.asesor, id, { motivo: 'x' }));

  assert.strictEqual(estado(p.db, id), 'pendiente_revision');
  assert.strictEqual(filas(p.db, "SELECT * FROM audit_log WHERE accion = 'rechazar'").length, 0);
  assert.strictEqual(filas(p.db, 'SELECT * FROM decisiones_solicitud').length, 0);
});

test('si falla la auditoria de la asignacion no queda asignada y el estado no cambia', async () => {
  const p = preparar({
    envolverAuditoria: (auditoria) => ({
      ...auditoria,
      registrar(entrada) {
        if (entrada.accion === 'asignar') throw new Error('fallo forzado de auditoria');
        return auditoria.registrar(entrada);
      },
    }),
  });
  const id = await solicitudEnviada(p);

  await assert.rejects(p.servicio.reclamar(p.usuarios.asesor, id), /fallo forzado de auditoria/);

  assert.strictEqual(filas(p.db, 'SELECT * FROM asignaciones').length, 0);
  assert.strictEqual(estado(p.db, id), 'pendiente_revision');
});

test('rechazar sin motivo lanza DATOS_INVALIDOS (400) sin tocar el estado', async () => {
  const p = preparar();
  const id = await solicitudEnviada(p);
  await p.servicio.reclamar(p.usuarios.asesor, id);

  await assert.rejects(p.servicio.rechazar(p.usuarios.asesor, id, { motivo: '  ' }), (error) => {
    assert.strictEqual(error.codigo, 'DATOS_INVALIDOS');
    assert.strictEqual(error.estadoHttp, 400);
    assert.ok(error.errores.motivo);
    return true;
  });
  assert.strictEqual(estado(p.db, id), 'pendiente_revision');
});

test('obtenerParaAsesor devuelve undefined para una no reclamada o de otro asesor', async () => {
  const p = preparar();
  const id = await solicitudEnviada(p);
  assert.strictEqual(await p.servicio.obtenerParaAsesor(p.usuarios.asesor, id), undefined);
  await p.servicio.reclamar(p.usuarios.asesor, id);
  assert.strictEqual(await p.servicio.obtenerParaAsesor(p.usuarios.otroAsesor, id), undefined);
  const detalle = await p.servicio.obtenerParaAsesor(p.usuarios.asesor, id);
  assert.strictEqual(detalle.solicitud.ingresosHogar, 1500000);
  assert.strictEqual(detalle.documentos.length, 3);
});
