'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { crearNotificadorColector } = require('./notificadorColector');
const { DecisionAsesorFinanciero } = require('../solicitud-credito/decisionAsesor');
const { crearRevisionComite } = require('../evaluacion-elegibilidad/revisionComite');
const { crearEjecucionDesembolso } = require('../desembolso/ejecucionDesembolso');

const esperar = () => new Promise((resolve) => setImmediate(resolve));

test('Escenario: cada payload queda registrado en memoria y ninguna llamada lanza error', () => {
  const colector = crearNotificadorColector();
  const recolectadas = [];
  const llamadas = () => {
    colector.notificarEnvio({ estudianteId: 'e1', solicitudId: 's1', estado: 'pendiente_revision' });
    colector.notificarDecision({ estudianteId: 'e1', solicitudId: 's1', estado: 'aprobada' });
    colector.notificarCasoLimitrofe({ idCaso: 'c1', puntaje: 55 });
    colector.notificarDesembolso({
      solicitudId: 's1',
      desembolsoId: 'd1',
      numeroCuota: 1,
      fecha: '2026-03-15',
      monto: 250000,
    });
  };
  assert.doesNotThrow(() => colector.correrEnContexto(recolectadas, llamadas));

  assert.deepEqual(
    recolectadas.map((n) => [n.tipo, n.destinatarioTipo, n.destinatarioId]),
    [
      ['envio', 'estudiante', 'e1'],
      ['decision', 'estudiante', 'e1'],
      ['caso_limitrofe', 'rol', 'comite_becas'],
      ['desembolso', 'solicitud', 's1'],
    ],
  );
  assert.deepEqual(recolectadas[2].payload, { idCaso: 'c1', puntaje: 55 });
  assert.equal(recolectadas[3].payload.monto, 250000);
});

test('el colector no guarda referencias vivas al payload original', () => {
  const colector = crearNotificadorColector();
  const recolectadas = [];
  const payload = { idCaso: 'c1', puntaje: 55 };
  colector.correrEnContexto(recolectadas, () => colector.notificarCasoLimitrofe(payload));
  payload.puntaje = 99;
  assert.equal(recolectadas[0].payload.puntaje, 55);
});

test('llamar un metodo fuera de un caso de uso lanza NOTIFICADOR_SIN_CONTEXTO', () => {
  const colector = crearNotificadorColector();
  for (const [metodo, payload] of [
    ['notificarEnvio', { estudianteId: 'e1', solicitudId: 's1', estado: 'x' }],
    ['notificarDecision', { estudianteId: 'e1', solicitudId: 's1', estado: 'x' }],
    ['notificarCasoLimitrofe', { idCaso: 'c1', puntaje: 1 }],
    ['notificarDesembolso', { solicitudId: 's1' }],
  ]) {
    assert.throws(
      () => colector[metodo](payload),
      (error) => error.codigo === 'NOTIFICADOR_SIN_CONTEXTO',
      metodo,
    );
  }
});

test('dos casos de uso concurrentes intercalados no mezclan sus payloads', async () => {
  const colector = crearNotificadorColector();
  const a = [];
  const b = [];
  await Promise.all([
    colector.correrEnContexto(a, async () => {
      colector.notificarCasoLimitrofe({ idCaso: 'A1', puntaje: 1 });
      await esperar();
      colector.notificarCasoLimitrofe({ idCaso: 'A2', puntaje: 2 });
    }),
    colector.correrEnContexto(b, async () => {
      await esperar();
      colector.notificarCasoLimitrofe({ idCaso: 'B1', puntaje: 3 });
      await esperar();
      colector.notificarCasoLimitrofe({ idCaso: 'B2', puntaje: 4 });
    }),
  ]);
  assert.deepEqual(a.map((n) => n.payload.idCaso), ['A1', 'A2']);
  assert.deepEqual(b.map((n) => n.payload.idCaso), ['B1', 'B2']);
});

test('contrato: los modulos reales aceptan el colector y lo invocan con su firma', async () => {
  const colector = crearNotificadorColector();
  const recolectadas = [];

  // validacion de constructor de los modulos reales
  assert.doesNotThrow(
    () => new DecisionAsesorFinanciero({ registro: {}, notificador: colector }),
  );
  assert.doesNotThrow(() => crearRevisionComite({ notificador: colector }));
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
  await colector.correrEnContexto(recolectadas, () => ejecucion.ejecutar(desembolso));
  assert.equal(recolectadas.length, 1);
  assert.deepEqual(recolectadas[0].payload, {
    solicitudId: 's1',
    desembolsoId: 'd1',
    numeroCuota: 1,
    fecha: '2026-03-15',
    monto: 1000,
  });
});
