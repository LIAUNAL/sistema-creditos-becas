'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { abrirBaseDeDatos } = require('../baseDeDatos');
const { ejecutarMigraciones } = require('../migraciones');
const { crearRelojFijo } = require('../reloj');
const { crearNotificadorColector } = require('../notificadorColector');
const { ejecutarCasoDeUso } = require('../casoDeUso');
const { crearUnidadDeTrabajo } = require('../unidadDeTrabajo');
const { crearRepositorioSolicitudesSqlite } = require('./repositorioSolicitudesSqlite');
const { crearRepositorioDocumentosSqlite } = require('./repositorioDocumentosSqlite');
const { crearRepositorioDecisionesSqlite } = require('./repositorioDecisionesSqlite');
const { RegistroSolicitudCredito } = require('../../solicitud-credito/registroSolicitudCredito');
const { EnvioSolicitudCredito, ErrorDocumentosFaltantes } = require('../../solicitud-credito/envioSolicitud');
const {
  DecisionAsesorFinanciero,
  ErrorMotivoRechazoRequerido,
} = require('../../solicitud-credito/decisionAsesor');

const FECHA_DECISION = new Date('2026-03-04T10:20:30.000Z');
const DATOS = {
  estudianteId: 'est-1',
  periodoAcademico: '2026-1',
  ingresosHogar: 1500000,
  numeroDependientes: 2,
  estrato: 3,
  ocupacionAcudiente: 'docente',
};
const DOCUMENTOS = [
  { tipo: 'identificacion', nombreArchivo: 'id.pdf' },
  { tipo: 'certificado_ingresos', nombreArchivo: 'ingresos.pdf' },
  { tipo: 'certificado_matricula', nombreArchivo: 'matricula.png' },
];

// Modulos REALES + repositorios SQLite + colector + ejecutarCasoDeUso: el cableado de la app.
function montar() {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  const reloj = crearRelojFijo(new Date('2026-05-04T12:30:00.000Z'));
  const colector = crearNotificadorColector();
  const repositorios = {
    solicitudes: crearRepositorioSolicitudesSqlite({ db }),
    documentos: crearRepositorioDocumentosSqlite({ db }),
    decisiones: crearRepositorioDecisionesSqlite({ db }),
  };
  const registro = new RegistroSolicitudCredito({ repositorio: repositorios.solicitudes });
  const envio = new EnvioSolicitudCredito({ registro, notificador: colector, repositorio: repositorios.documentos });
  const decision = new DecisionAsesorFinanciero({
    registro,
    notificador: colector,
    reloj: () => new Date(FECHA_DECISION.getTime()),
    repositorio: repositorios.decisiones,
  });
  // Cada llamada es un caso de uso con su propia unidad de trabajo (identity map aislado).
  const caso = (operacion, extra = {}) =>
    ejecutarCasoDeUso({ db, colector, reloj, unidadDeTrabajo: crearUnidadDeTrabajo(), operacion, ...extra });
  return { db, reloj, colector, repositorios, registro, envio, decision, caso };
}

const outbox = (db) => db.prepare('SELECT tipo, destinatario_id, payload FROM notifications ORDER BY id').all();

async function crearBorrador(m) {
  return (await m.caso(() => m.registro.crear(DATOS))).id;
}

async function enviar(m, id) {
  await m.caso(() => {
    for (const documento of DOCUMENTOS) m.envio.adjuntarDocumento(id, documento);
    return m.envio.confirmarEnvio(id);
  });
}

async function pendienteDeRevision(m) {
  const id = await crearBorrador(m);
  await enviar(m, id);
  return id;
}

test('migracion 005 crea solicitudes, documentos y decisiones con sus restricciones e indices', () => {
  const { db } = montar();
  const nombres = (tipo) =>
    db.prepare('SELECT name FROM sqlite_master WHERE type = ? ORDER BY name').all(tipo).map((f) => f.name);
  assert.ok(['decisiones_solicitud', 'documentos_solicitud', 'solicitudes'].every((t) => nombres('table').includes(t)));
  assert.ok(nombres('index').includes('solicitudes_estudiante'));
  assert.ok(nombres('index').includes('solicitudes_estado'));

  const insertarSolicitud = () =>
    db
      .prepare(
        'INSERT INTO solicitudes (id, estudiante_id, periodo_academico, estado, datos, creada_en) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('s1', 'e1', '2026-1', 'borrador', '{}', '2026-01-01T00:00:00.000Z');
  const insertarDocumento = (solicitudId) =>
    db
      .prepare('INSERT INTO documentos_solicitud (solicitud_id, tipo, nombre_archivo) VALUES (?, ?, ?)')
      .run(solicitudId, 'identificacion', 'a.pdf');
  assert.throws(() => insertarDocumento('s1'), /FOREIGN KEY/);
  insertarSolicitud();
  assert.doesNotThrow(() => insertarDocumento('s1'));
  assert.throws(() => insertarDocumento('s1'), /UNIQUE/);
  assert.throws(
    () =>
      db
        .prepare('INSERT INTO decisiones_solicitud (solicitud_id, tipo, asesor_id, fecha) VALUES (?, ?, ?, ?)')
        .run('otra', 'aprobada', 'a1', '2026-01-01T00:00:00.000Z'),
    /FOREIGN KEY/,
  );
});

test('Escenario: pendiente_revision se observa igual al recargar desde SQLite', async () => {
  const m = montar();
  const id = await crearBorrador(m);
  assert.equal(await m.caso(() => m.registro.obtener(id).estado), 'borrador');

  await enviar(m, id);

  const recargada = await m.caso(() => ({
    solicitud: m.registro.obtener(id),
    documentos: m.envio.documentosDe(id),
  }));
  assert.equal(recargada.solicitud.estado, 'pendiente_revision');
  assert.deepStrictEqual(recargada.solicitud, {
    id,
    ...DATOS,
    estado: 'pendiente_revision',
    creadaEn: recargada.solicitud.creadaEn,
  });
  assert.deepStrictEqual(recargada.documentos, DOCUMENTOS);
  assert.deepStrictEqual(
    (await m.caso(() => m.repositorios.solicitudes.listarPorEstado('pendiente_revision'))).map((s) => s.id),
    [id],
  );
});

test('Escenario: aprobada se observa igual al recargar desde SQLite', async () => {
  const m = montar();
  const id = await pendienteDeRevision(m);

  const devuelta = await m.caso(() => m.decision.aprobar(id, { asesorId: 'ase-1' }));
  assert.equal(devuelta.estado, 'aprobada');

  const recargada = await m.caso(() => ({
    solicitud: m.registro.obtener(id),
    historial: m.decision.consultarHistorial(id),
  }));
  assert.equal(recargada.solicitud.estado, 'aprobada');
  assert.deepStrictEqual(recargada.historial, {
    solicitudId: id,
    estado: 'aprobada',
    decision: { tipo: 'aprobada', asesorId: 'ase-1', fecha: FECHA_DECISION },
  });
  assert.ok(recargada.historial.decision.fecha instanceof Date);
});

test('Escenario: rechazada se observa igual al recargar desde SQLite', async () => {
  const m = montar();
  const id = await pendienteDeRevision(m);

  await m.caso(() => m.decision.rechazar(id, { asesorId: 'ase-2', motivo: 'ingresos superiores al tope' }));

  const recargada = await m.caso(() => ({
    solicitud: m.registro.obtener(id),
    historial: m.decision.consultarHistorial(id),
  }));
  assert.equal(recargada.solicitud.estado, 'rechazada');
  assert.deepStrictEqual(recargada.historial.decision, {
    tipo: 'rechazada',
    asesorId: 'ase-2',
    fecha: FECHA_DECISION,
    motivo: 'ingresos superiores al tope',
  });
});

test('un rechazo sin motivo no cambia el estado ni escribe filas de outbox nuevas', async () => {
  const m = montar();
  const id = await pendienteDeRevision(m);
  const antes = outbox(m.db).length;

  await assert.rejects(
    m.caso(() => m.decision.rechazar(id, { asesorId: 'ase-2', motivo: '  ' })),
    ErrorMotivoRechazoRequerido,
  );

  assert.equal(await m.caso(() => m.registro.obtener(id).estado), 'pendiente_revision');
  assert.equal(await m.caso(() => m.decision.consultarHistorial(id)), undefined);
  assert.equal(outbox(m.db).length, antes);
});

test('Escenario: estado y filas de outbox se confirman juntos', async () => {
  const m = montar();
  const id = await crearBorrador(m);
  assert.equal(outbox(m.db).length, 0);

  await enviar(m, id);
  assert.deepStrictEqual(
    outbox(m.db).map((f) => [f.tipo, f.destinatario_id, JSON.parse(f.payload)]),
    [['envio', 'est-1', { estudianteId: 'est-1', solicitudId: id, estado: 'pendiente_revision' }]],
  );

  await m.caso(() => m.decision.aprobar(id, { asesorId: 'ase-1' }));
  assert.deepStrictEqual(
    outbox(m.db).map((f) => f.tipo),
    ['envio', 'decision'],
  );
  assert.equal(await m.caso(() => m.registro.obtener(id).estado), 'aprobada');
});

test('Escenario: si falla el volcado del estado no se confirma ni el estado ni el outbox', async () => {
  const m = montar();
  const id = await crearBorrador(m);
  await m.caso(() => {
    for (const documento of DOCUMENTOS) m.envio.adjuntarDocumento(id, documento);
  });

  await assert.rejects(
    m.caso(() => {
      m.envio.confirmarEnvio(id); // muta el estado y recolecta la notificacion
      m.repositorios.documentos.guardarDocumento('solicitud-inexistente', { tipo: 'identificacion', nombreArchivo: 'x.pdf' });
    }),
    /FOREIGN KEY/,
  );

  assert.equal(await m.caso(() => m.registro.obtener(id).estado), 'borrador');
  assert.equal(outbox(m.db).length, 0);
});

test('Escenario: si falla la insercion en el outbox tampoco se confirma el estado', async () => {
  const m = montar();
  const id = await crearBorrador(m);
  m.db.exec(`CREATE TRIGGER outbox_caido BEFORE INSERT ON notifications
             BEGIN SELECT RAISE(ABORT, 'outbox caido'); END`);

  await assert.rejects(
    m.caso(() => {
      for (const documento of DOCUMENTOS) m.envio.adjuntarDocumento(id, documento);
      return m.envio.confirmarEnvio(id);
    }),
    /outbox caido/,
  );

  assert.equal(await m.caso(() => m.registro.obtener(id).estado), 'borrador');
  assert.deepStrictEqual(await m.caso(() => m.envio.documentosDe(id)), []);
  assert.equal(outbox(m.db).length, 0);
});

test('Escenario: si la operacion lanza tras mutar, el estado y el outbox persisten y el error se propaga', async () => {
  const m = montar();
  const id = await crearBorrador(m);
  await m.caso(() => {
    for (const documento of DOCUMENTOS) m.envio.adjuntarDocumento(id, documento);
  });

  await assert.rejects(
    m.caso(() => {
      m.envio.confirmarEnvio(id);
      throw new Error('fallo despues de mutar');
    }),
    /fallo despues de mutar/,
  );

  assert.equal(await m.caso(() => m.registro.obtener(id).estado), 'pendiente_revision');
  assert.deepStrictEqual(
    outbox(m.db).map((f) => f.tipo),
    ['envio'],
  );
});

test('una operacion que falla antes de mutar no deja nada escrito', async () => {
  const m = montar();
  const id = await crearBorrador(m);

  await assert.rejects(
    m.caso(() => m.envio.confirmarEnvio(id)),
    ErrorDocumentosFaltantes,
  );

  assert.equal(await m.caso(() => m.registro.obtener(id).estado), 'borrador');
  assert.equal(outbox(m.db).length, 0);
});

test('Escenario: dos casos de uso intercalados no comparten el mapa de identidad', async () => {
  const m = montar();
  const id = await crearBorrador(m);

  let liberarA;
  const puertaA = new Promise((resolver) => {
    liberarA = resolver;
  });
  let cargadaPorB;
  const bCargo = new Promise((resolver) => {
    cargadaPorB = resolver;
  });

  const casoA = m.caso(async () => {
    const primera = m.registro.obtener(id);
    await puertaA; // B se ejecuta mientras A espera
    const segunda = m.registro.obtener(id);
    return { primera, segunda };
  });

  const casoB = m.caso(async () => {
    const propia = m.registro.obtener(id);
    propia.estado = 'cancelada';
    cargadaPorB(propia);
    return propia;
  });

  const instanciaDeB = await casoB;
  assert.strictEqual(await bCargo, instanciaDeB);
  liberarA();
  const { primera, segunda } = await casoA;

  assert.strictEqual(primera, segunda, 'A ve siempre la misma instancia');
  assert.notStrictEqual(primera, instanciaDeB, 'A y B no comparten instancia');
  assert.equal(primera.estado, 'borrador', 'el cambio de B no se filtra a A');
  // A solo leyo: su volcado no pisa el cambio confirmado por B.
  assert.equal(await m.caso(() => m.registro.obtener(id).estado), 'cancelada');
});
