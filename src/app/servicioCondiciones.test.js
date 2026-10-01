'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { abrirBaseDeDatos } = require('../infra/baseDeDatos');
const { ejecutarMigraciones } = require('../infra/migraciones');
const { crearAuditoria } = require('../infra/auditoria');
const { crearRelojFijo } = require('../infra/reloj');
const { crearUnidadDeTrabajo } = require('../infra/unidadDeTrabajo');
const { crearContextoApp } = require('./contextoApp');
const { crearServicioCondiciones } = require('./servicioCondiciones');

const DATOS = { periodoAcademico: '2026-1', ingresosHogar: '1500000', numeroDependientes: '2', estrato: '3', ocupacionAcudiente: 'docente' };
const DOCUMENTOS = [
  { tipo: 'identificacion', nombreArchivo: 'id.pdf' },
  { tipo: 'certificado_ingresos', nombreArchivo: 'ingresos.pdf' },
  { tipo: 'certificado_matricula', nombreArchivo: 'matricula.png' },
];
const TERMINOS = { monto: '1200000', numeroCuotas: '4', fechaPrimeraCuota: '2026-12-01' };

// `envolverAuditoria` y `envolverDecision` permiten forzar fallos para probar la atomicidad.
function preparar({ envolverAuditoria = (a) => a, envolverDecision = (d) => d } = {}) {
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
  const servicio = crearServicioCondiciones({ db, reloj, auditoria, ...contexto, decision: envolverDecision(contexto.decision) });
  return { db, usuarios, contexto, servicio, reloj };
}

async function solicitudReclamada(p, periodo = '2026-1') {
  const s = p.contexto.servicioSolicitudes;
  const creada = await s.crearSolicitud(p.usuarios.estudiante, { ...DATOS, periodoAcademico: periodo });
  for (const documento of DOCUMENTOS) await s.adjuntarDocumento(p.usuarios.estudiante, creada.id, documento);
  await s.confirmarEnvio(p.usuarios.estudiante, creada.id);
  await p.contexto.servicioAsesor.reclamar(p.usuarios.asesor, creada.id);
  return creada.id;
}

const cuenta = (db, tabla) => db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get().n;
const estado = (db, id) => db.prepare('SELECT estado FROM solicitudes WHERE id = ?').get(id).estado;
const auditoriasAprobar = (db) => db.prepare("SELECT * FROM audit_log WHERE accion = 'aprobar'").all();

function nadaConfirmado(p, id) {
  assert.equal(estado(p.db, id), 'pendiente_revision');
  assert.equal(cuenta(p.db, 'desembolsos'), 0);
  assert.equal(cuenta(p.db, 'condiciones_credito'), 0);
  assert.equal(cuenta(p.db, 'decisiones_solicitud'), 0);
  assert.equal(p.db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE tipo = 'decision'").get().n, 0);
  assert.equal(auditoriasAprobar(p.db).length, 0);
}

test('solo el asesor asignado aprueba: otro asesor 403, rol ajeno 403, inexistente 404', async () => {
  const p = preparar();
  const id = await solicitudReclamada(p);

  await assert.rejects(p.servicio.aprobarConCondiciones(p.usuarios.otroAsesor, id, TERMINOS), { estadoHttp: 403 });
  for (const usuario of [p.usuarios.estudiante, p.usuarios.comite]) {
    await assert.rejects(p.servicio.aprobarConCondiciones(usuario, id, TERMINOS), { estadoHttp: 403 });
  }
  await assert.rejects(p.servicio.aprobarConCondiciones(p.usuarios.asesor, 'no-existe', TERMINOS), { estadoHttp: 404 });
  nadaConfirmado(p, id);
});

test('aprueba con terminos validos: devuelve el resumen y confirma estado, terminos, calendario, auditoria y aviso', async () => {
  const p = preparar();
  const id = await solicitudReclamada(p);

  const resultado = await p.servicio.aprobarConCondiciones(p.usuarios.asesor, id, TERMINOS);

  assert.deepStrictEqual(resultado, { id, estado: 'aprobada', desembolsos: 4 });
  assert.equal(estado(p.db, id), 'aprobada');
  assert.equal(cuenta(p.db, 'desembolsos'), 4);
  assert.equal(cuenta(p.db, 'condiciones_credito'), 1);
  const [auditoria, ...resto] = auditoriasAprobar(p.db);
  assert.equal(resto.length, 0);
  assert.equal(auditoria.objetivo, `solicitud_credito:${id}`);
  assert.equal(auditoria.rol, 'asesor_financiero');
  assert.deepStrictEqual(JSON.parse(auditoria.detalle), { monto: 1200000, numeroCuotas: 4, fechaPrimeraCuota: '2026-12-01' });
  assert.equal(p.db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE tipo = 'decision'").get().n, 1);
});

test('los terminos se validan ANTES de aprobar: con terminos invalidos no se llama a la decision', async () => {
  const llamadas = [];
  const p = preparar({
    envolverDecision: (decision) => ({
      aprobar: (...argumentos) => {
        llamadas.push(argumentos);
        return decision.aprobar(...argumentos);
      },
    }),
  });
  const id = await solicitudReclamada(p);

  await assert.rejects(
    p.servicio.aprobarConCondiciones(p.usuarios.asesor, id, { ...TERMINOS, monto: '0' }),
    { codigo: 'MONTO_INVALIDO' },
  );

  assert.deepStrictEqual(llamadas, []);
  nadaConfirmado(p, id);
  const [error, ...resto] = p.db.prepare('SELECT * FROM calendar_errors').all();
  assert.equal(resto.length, 0);
  assert.equal(error.solicitud_id, id);
  assert.equal(error.codigo, 'MONTO_INVALIDO');
  assert.equal(error.registrado_en, '2026-05-04T12:30:00.000Z');
  assert.ok(error.mensaje.length > 0);
});

test('atomicidad: si la decision falla DESPUES de generar el calendario no se confirma nada', async () => {
  const llamadas = [];
  const p = preparar({
    envolverDecision: () => ({
      aprobar: () => {
        llamadas.push('aprobar');
        throw new Error('fallo forzado tras generar');
      },
    }),
  });
  const id = await solicitudReclamada(p);

  await assert.rejects(p.servicio.aprobarConCondiciones(p.usuarios.asesor, id, TERMINOS), /fallo forzado tras generar/);

  assert.deepStrictEqual(llamadas, ['aprobar']);
  nadaConfirmado(p, id);
  assert.equal(cuenta(p.db, 'calendar_errors'), 0, 'un fallo que no es del calendario no se registra como error de calendario');
});

test('atomicidad: si falla la auditoria dentro de la transaccion se revierte la aprobacion completa', async () => {
  let fallar = false;
  const p = preparar({
    envolverAuditoria: (auditoria) => ({
      ...auditoria,
      registrar: (entrada) => {
        if (fallar && entrada.accion === 'aprobar') throw new Error('fallo forzado de auditoria');
        return auditoria.registrar(entrada);
      },
    }),
  });
  const id = await solicitudReclamada(p);
  fallar = true;

  await assert.rejects(p.servicio.aprobarConCondiciones(p.usuarios.asesor, id, TERMINOS), /fallo forzado de auditoria/);

  nadaConfirmado(p, id);
  fallar = false;
  assert.deepStrictEqual(
    await p.servicio.aprobarConCondiciones(p.usuarios.asesor, id, TERMINOS),
    { id, estado: 'aprobada', desembolsos: 4 },
  );
});

test('un segundo intento sobre una solicitud aprobada da 409 y no duplica nada', async () => {
  const p = preparar();
  const id = await solicitudReclamada(p);
  await p.servicio.aprobarConCondiciones(p.usuarios.asesor, id, TERMINOS);

  await assert.rejects(
    p.servicio.aprobarConCondiciones(p.usuarios.asesor, id, { ...TERMINOS, numeroCuotas: '6' }),
    { codigo: 'SOLICITUD_NO_EN_REVISION' },
  );

  assert.equal(cuenta(p.db, 'desembolsos'), 4);
  assert.equal(cuenta(p.db, 'condiciones_credito'), 1);
  assert.equal(auditoriasAprobar(p.db).length, 1);
  assert.equal(cuenta(p.db, 'notifications'), 2, 'envio + decision, sin un aviso nuevo');
});

test('los desembolsos recargados desde SQLite en una unidad nueva conservan fecha, monto, periodo y tipo de credito', async () => {
  const p = preparar();
  const id = await solicitudReclamada(p, '2027-1');
  await p.servicio.aprobarConCondiciones(p.usuarios.asesor, id, TERMINOS);

  const recargados = crearUnidadDeTrabajo().correr(() => p.contexto.repositorios.calendario.obtenerPorSolicitud(id));

  assert.deepStrictEqual(
    recargados.map(({ numeroCuota, fecha, monto, estado: e, periodoAcademico, tipoCredito }) => ({ numeroCuota, fecha, monto, e, periodoAcademico, tipoCredito })),
    [
      { numeroCuota: 1, fecha: '2026-12-01', monto: 300000, e: 'programado', periodoAcademico: '2027-1', tipoCredito: 'credito' },
      { numeroCuota: 2, fecha: '2027-01-01', monto: 300000, e: 'programado', periodoAcademico: '2027-1', tipoCredito: 'credito' },
      { numeroCuota: 3, fecha: '2027-02-01', monto: 300000, e: 'programado', periodoAcademico: '2027-1', tipoCredito: 'credito' },
      { numeroCuota: 4, fecha: '2027-03-01', monto: 300000, e: 'programado', periodoAcademico: '2027-1', tipoCredito: 'credito' },
    ],
  );
  const condiciones = crearUnidadDeTrabajo().correr(() => p.contexto.repositorios.condiciones.obtenerCondiciones(id));
  assert.deepStrictEqual(condiciones, {
    monto: 1200000,
    numeroCuotas: 4,
    fechaPrimeraCuota: '2026-12-01',
    tipoCredito: 'credito',
    creadaEn: '2026-05-04T12:30:00.000Z',
  });
});

test('los montos de las cuotas suman exactamente el total aprobado en centavos', async () => {
  for (const [monto, cuotas] of [['1000.01', '3'], ['100', '7'], ['0.05', '4'], ['999999.99', '12']]) {
    const p = preparar();
    const id = await solicitudReclamada(p);
    await p.servicio.aprobarConCondiciones(p.usuarios.asesor, id, { monto, numeroCuotas: cuotas, fechaPrimeraCuota: '2026-12-01' });

    const filas = p.db.prepare('SELECT monto FROM desembolsos WHERE solicitud_id = ?').all(id);
    assert.equal(filas.length, Number(cuotas));
    const centavos = filas.reduce((suma, f) => suma + Math.round(f.monto * 100), 0);
    assert.equal(centavos, Math.round(Number(monto) * 100), `${monto} en ${cuotas} cuotas`);
  }
});
