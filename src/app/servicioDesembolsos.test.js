'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { abrirBaseDeDatos } = require('../infra/baseDeDatos');
const { ejecutarMigraciones } = require('../infra/migraciones');
const { crearAuditoria } = require('../infra/auditoria');
const { crearRelojFijo } = require('../infra/reloj');
const { crearContextoApp } = require('./contextoApp');
const { crearServicioDesembolsos } = require('./servicioDesembolsos');

// Story 5.14 (P14): ejecucion de un desembolso. Pruebas del caso de uso con SQLite en memoria.

const DATOS = { periodoAcademico: '2026-1', ingresosHogar: '1500000', numeroDependientes: '2', estrato: '3', ocupacionAcudiente: 'docente' };
const DOCUMENTOS = [
  { tipo: 'identificacion', nombreArchivo: 'id.pdf' },
  { tipo: 'certificado_ingresos', nombreArchivo: 'ingresos.pdf' },
  { tipo: 'certificado_matricula', nombreArchivo: 'matricula.png' },
];
const TERMINOS = { monto: '1200000', numeroCuotas: '3', fechaPrimeraCuota: '2026-12-01' };

function preparar({ envolverAuditoria = (auditoria) => auditoria } = {}) {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  const insertar = db.prepare("INSERT INTO usuarios (nombre_usuario, hash_contrasena, rol, activo) VALUES (?, 'x', ?, 1)");
  const crear = (nombre, rol) => ({ id: Number(insertar.run(nombre, rol).lastInsertRowid), nombre_usuario: nombre, rol });
  const usuarios = {
    estudiante: crear('estudiante', 'estudiante'),
    otroEstudiante: crear('estudiante2', 'estudiante'),
    asesor: crear('asesor1', 'asesor_financiero'),
    otroAsesor: crear('asesor2', 'asesor_financiero'),
    comite: crear('comite', 'comite_becas'),
    direccion: crear('direccion', 'direccion_academica'),
  };
  const reloj = crearRelojFijo(new Date('2026-05-04T12:30:00.000Z'));
  const auditoria = envolverAuditoria(crearAuditoria({ db, reloj }));
  const contexto = crearContextoApp({ db, reloj, auditoria });
  return { db, usuarios, contexto, reloj, auditoria };
}

// Una solicitud aprobada con 3 cuotas; devuelve los ids de solicitud y de cada desembolso.
async function solicitudAprobada({ db, contexto, usuarios }) {
  const s = contexto.servicioSolicitudes;
  const creada = await s.crearSolicitud(usuarios.estudiante, DATOS);
  for (const documento of DOCUMENTOS) await s.adjuntarDocumento(usuarios.estudiante, creada.id, documento);
  await s.confirmarEnvio(usuarios.estudiante, creada.id);
  await contexto.servicioAsesor.reclamar(usuarios.asesor, creada.id);
  await contexto.servicioCondiciones.aprobarConCondiciones(usuarios.asesor, creada.id, TERMINOS);
  const cuotas = db.prepare('SELECT id FROM desembolsos WHERE solicitud_id = ? ORDER BY numero_cuota').all(creada.id);
  return { solicitudId: creada.id, cuotas: cuotas.map((c) => c.id) };
}

const filas = (db, sql, ...parametros) => db.prepare(sql).all(...parametros).map((f) => ({ ...f }));
const estadoCuota = (db, id) => db.prepare('SELECT estado, fecha_ejecucion FROM desembolsos WHERE id = ?').get(id);
const avisos = (db) => filas(db, "SELECT * FROM notifications WHERE tipo = 'desembolso' ORDER BY id");
const auditorias = (db) => filas(db, "SELECT * FROM audit_log WHERE accion = 'ejecutar_desembolso' ORDER BY id");

test('ejecutarDesembolso: el asesor asignado pasa la cuota a ejecutado con fecha del reloj, auditoria y aviso en una transaccion', async () => {
  const p = preparar();
  const { solicitudId, cuotas } = await solicitudAprobada(p);

  const resultado = await p.contexto.servicioDesembolsos.ejecutarDesembolso(p.usuarios.asesor, cuotas[0]);

  assert.strictEqual(resultado.estado, 'ejecutado');
  assert.strictEqual(resultado.fechaEjecucion, '2026-05-04');
  assert.deepStrictEqual({ ...estadoCuota(p.db, cuotas[0]) }, { estado: 'ejecutado', fecha_ejecucion: '2026-05-04' });
  assert.strictEqual(estadoCuota(p.db, cuotas[1]).estado, 'programado');
  const [aviso, ...otros] = avisos(p.db);
  assert.strictEqual(otros.length, 0);
  assert.strictEqual(aviso.destinatario_tipo, 'solicitud');
  assert.strictEqual(aviso.destinatario_id, solicitudId);
  assert.deepStrictEqual(JSON.parse(aviso.payload), {
    solicitudId,
    desembolsoId: cuotas[0],
    numeroCuota: 1,
    fecha: '2026-05-04',
    monto: 400000,
  });
  const [entrada, ...resto] = auditorias(p.db);
  assert.strictEqual(resto.length, 0);
  assert.strictEqual(entrada.actor, 'asesor1');
  assert.strictEqual(entrada.rol, 'asesor_financiero');
  assert.strictEqual(entrada.objetivo, `desembolso:${cuotas[0]}`);
  assert.strictEqual(entrada.fecha, '2026-05-04T12:30:00.000Z');
  assert.deepStrictEqual(JSON.parse(entrada.detalle), { solicitudId, numeroCuota: 1, monto: 400000 });
});

test('Decision documentada: si el modulo lanza DESPUES de mutar (STUB que lanza), el estado ejecutado queda persistido y el error se propaga', async () => {
  const p = preparar();
  const { cuotas } = await solicitudAprobada(p);
  const fallo = new Error('fallo del modulo tras mutar');
  const ejecucion = {
    async ejecutar(desembolso) {
      desembolso.estado = 'ejecutado';
      desembolso.fechaEjecucion = '2026-05-04';
      throw fallo;
    },
    consultarHistorial: p.contexto.ejecucion.consultarHistorial,
  };
  const servicio = crearServicioDesembolsos({ ...p.contexto, db: p.db, reloj: p.reloj, auditoria: p.auditoria, ejecucion });

  await assert.rejects(servicio.ejecutarDesembolso(p.usuarios.asesor, cuotas[0]), (error) => error === fallo);

  assert.deepStrictEqual({ ...estadoCuota(p.db, cuotas[0]) }, { estado: 'ejecutado', fecha_ejecucion: '2026-05-04' });
  assert.strictEqual(auditorias(p.db).length, 1, 'el estado final tambien deja su traza');
  assert.strictEqual(avisos(p.db).length, 0, 'el stub no notifico: no hay aviso que confirmar');
});

test('un error del modulo ANTES de mutar (estado no programado) no deja estado, auditoria ni aviso', async () => {
  const p = preparar();
  const { cuotas } = await solicitudAprobada(p);
  const ejecucion = {
    async ejecutar() {
      throw new Error('fallo antes de mutar');
    },
    consultarHistorial: p.contexto.ejecucion.consultarHistorial,
  };
  const servicio = crearServicioDesembolsos({ ...p.contexto, db: p.db, reloj: p.reloj, auditoria: p.auditoria, ejecucion });

  await assert.rejects(servicio.ejecutarDesembolso(p.usuarios.asesor, cuotas[0]), /fallo antes de mutar/);

  assert.strictEqual(estadoCuota(p.db, cuotas[0]).estado, 'programado');
  assert.strictEqual(auditorias(p.db).length, 0);
});

test('ejecutar dos veces da DESEMBOLSO_NO_PROGRAMADO (409) y no duplica aviso ni auditoria; una cuota vencida tambien', async () => {
  const p = preparar();
  const { cuotas } = await solicitudAprobada(p);
  const servicio = p.contexto.servicioDesembolsos;
  await servicio.ejecutarDesembolso(p.usuarios.asesor, cuotas[0]);

  await assert.rejects(servicio.ejecutarDesembolso(p.usuarios.asesor, cuotas[0]), { codigo: 'DESEMBOLSO_NO_PROGRAMADO' });
  p.db.prepare("UPDATE desembolsos SET estado = 'vencido' WHERE id = ?").run(cuotas[1]);
  await assert.rejects(servicio.ejecutarDesembolso(p.usuarios.asesor, cuotas[1]), { codigo: 'DESEMBOLSO_NO_PROGRAMADO' });

  assert.strictEqual(avisos(p.db).length, 1);
  assert.strictEqual(auditorias(p.db).length, 1);
  assert.strictEqual(estadoCuota(p.db, cuotas[1]).estado, 'vencido');
});

test('dos ejecuciones concurrentes de la misma cuota: una gana y la otra recibe 409; un solo aviso', async () => {
  const p = preparar();
  const { cuotas } = await solicitudAprobada(p);
  const servicio = p.contexto.servicioDesembolsos;

  const resultados = await Promise.allSettled([
    servicio.ejecutarDesembolso(p.usuarios.asesor, cuotas[0]),
    servicio.ejecutarDesembolso(p.usuarios.asesor, cuotas[0]),
  ]);

  assert.deepStrictEqual(resultados.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  assert.strictEqual(avisos(p.db).length, 1);
  assert.strictEqual(auditorias(p.db).length, 1);
});

test('atomicidad: si falla el volcado del estado, la auditoria o el outbox no se confirma ninguno', async () => {
  const variantes = [
    ['volcado del estado', "CREATE TRIGGER f BEFORE UPDATE ON desembolsos BEGIN SELECT RAISE(ABORT, 'fallo forzado'); END"],
    [
      'auditoria',
      "CREATE TRIGGER f BEFORE INSERT ON audit_log WHEN NEW.accion = 'ejecutar_desembolso' BEGIN SELECT RAISE(ABORT, 'fallo forzado'); END",
    ],
    [
      'outbox',
      "CREATE TRIGGER f BEFORE INSERT ON notifications WHEN NEW.tipo = 'desembolso' BEGIN SELECT RAISE(ABORT, 'fallo forzado'); END",
    ],
  ];
  for (const [nombre, trigger] of variantes) {
    const p = preparar();
    const { cuotas } = await solicitudAprobada(p);
    p.db.exec(trigger);

    await assert.rejects(p.contexto.servicioDesembolsos.ejecutarDesembolso(p.usuarios.asesor, cuotas[0]), /fallo forzado/, nombre);

    assert.deepStrictEqual({ ...estadoCuota(p.db, cuotas[0]) }, { estado: 'programado', fecha_ejecucion: null }, nombre);
    assert.strictEqual(auditorias(p.db).length, 0, nombre);
    assert.strictEqual(avisos(p.db).length, 0, nombre);
  }
});

test('permisos: otro asesor 403; estudiante, comite y direccion 403; id inexistente 404', async () => {
  const p = preparar();
  const { cuotas } = await solicitudAprobada(p);
  const servicio = p.contexto.servicioDesembolsos;

  await assert.rejects(servicio.ejecutarDesembolso(p.usuarios.otroAsesor, cuotas[0]), { estadoHttp: 403 });
  for (const usuario of [p.usuarios.estudiante, p.usuarios.comite, p.usuarios.direccion]) {
    await assert.rejects(servicio.ejecutarDesembolso(usuario, cuotas[0]), { estadoHttp: 403 });
  }
  await assert.rejects(servicio.ejecutarDesembolso(p.usuarios.asesor, 'no-existe'), { estadoHttp: 404 });

  assert.strictEqual(estadoCuota(p.db, cuotas[0]).estado, 'programado');
  assert.strictEqual(auditorias(p.db).length, 0);
  assert.strictEqual(avisos(p.db).length, 0);
});

test('listarDesembolsosDeSolicitud: el asesor asignado ve el calendario; otro asesor 403; solo el estudiante dueño ve su historial', async () => {
  const p = preparar();
  const { solicitudId, cuotas } = await solicitudAprobada(p);
  const servicio = p.contexto.servicioDesembolsos;
  await servicio.ejecutarDesembolso(p.usuarios.asesor, cuotas[0]);

  const delAsesor = await servicio.listarDesembolsosDeSolicitud(p.usuarios.asesor, solicitudId);
  const delEstudiante = await servicio.listarDesembolsosDeSolicitud(p.usuarios.estudiante, solicitudId);

  assert.deepStrictEqual(
    delAsesor.map((d) => [d.numeroCuota, d.fecha, d.monto, d.estado, d.fechaEjecucion]),
    [
      [1, '2026-12-01', 400000, 'ejecutado', '2026-05-04'],
      [2, '2027-01-01', 400000, 'programado', null],
      [3, '2027-02-01', 400000, 'programado', null],
    ],
  );
  assert.deepStrictEqual(delEstudiante, delAsesor.map((d) => ({ ...d })));
  await assert.rejects(servicio.listarDesembolsosDeSolicitud(p.usuarios.otroAsesor, solicitudId), { estadoHttp: 403 });
  await assert.rejects(servicio.listarDesembolsosDeSolicitud(p.usuarios.otroEstudiante, solicitudId), { estadoHttp: 404 });
  await assert.rejects(servicio.listarDesembolsosDeSolicitud(p.usuarios.comite, solicitudId), { estadoHttp: 403 });
  await assert.rejects(servicio.listarDesembolsosDeSolicitud(p.usuarios.estudiante, 'no-existe'), { estadoHttp: 404 });
});
