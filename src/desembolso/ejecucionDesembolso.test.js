'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CalendarioDesembolso } = require('./calendarioDesembolso');
const {
  crearEjecucionDesembolso,
  ErrorEjecucionDesembolso,
  ESTADO_DESEMBOLSO_EJECUTADO,
} = require('./ejecucionDesembolso');

function crearNotificadorEspia() {
  const notificaciones = [];
  return {
    notificaciones,
    notificarDesembolso(notificacion) {
      notificaciones.push(notificacion);
    },
  };
}

function crearEjecucion(overrides = {}) {
  const notificador = overrides.notificador ?? crearNotificadorEspia();
  const ejecucion = crearEjecucionDesembolso({
    notificador,
    reloj: () => new Date('2026-03-15T10:00:00Z'),
  });
  return { ejecucion, notificador };
}

function desembolsosProgramados() {
  return new CalendarioDesembolso().generar(
    { id: 'sol-1', estado: 'aprobada', monto: 1000000, numeroCuotas: 4 },
    { fechaPrimeraCuota: '2026-02-15' }
  );
}

test('Escenario: El sistema procesa la ejecución - cambia el estado a ejecutado y notifica con fecha y monto', async () => {
  const { ejecucion, notificador } = crearEjecucion();
  const [desembolso] = desembolsosProgramados();
  assert.equal(desembolso.estado, 'programado');

  const resultado = await ejecucion.ejecutar(desembolso);

  assert.equal(resultado.estado, ESTADO_DESEMBOLSO_EJECUTADO);
  assert.equal(resultado.estado, 'ejecutado');
  assert.equal(resultado.fechaEjecucion, '2026-03-15');
  assert.equal(desembolso.estado, 'ejecutado', 'el desembolso del calendario queda actualizado');
  assert.equal(notificador.notificaciones.length, 1);
  assert.deepEqual(notificador.notificaciones[0], {
    solicitudId: 'sol-1',
    desembolsoId: desembolso.id,
    numeroCuota: 1,
    fecha: '2026-03-15',
    monto: 250000,
  });
});

test('Escenario: El estudiante consulta su historial de desembolsos - muestra fecha de ejecución y estado', async () => {
  const { ejecucion } = crearEjecucion();
  const desembolsos = desembolsosProgramados();
  await ejecucion.ejecutar(desembolsos[0]);

  const historial = ejecucion.consultarHistorial(desembolsos);

  assert.equal(historial.length, 4);
  assert.deepEqual(historial[0], {
    id: desembolsos[0].id,
    numeroCuota: 1,
    monto: 250000,
    estado: 'ejecutado',
    fechaEjecucion: '2026-03-15',
  });
  assert.equal(historial[1].estado, 'programado');
  assert.equal(historial[1].fechaEjecucion, null);
});

test('Un desembolso que no está programado no se ejecuta ni se notifica de nuevo', async () => {
  const { ejecucion, notificador } = crearEjecucion();
  const [desembolso] = desembolsosProgramados();
  await ejecucion.ejecutar(desembolso);

  await assert.rejects(
    () => ejecucion.ejecutar(desembolso),
    (error) => error instanceof ErrorEjecucionDesembolso && error.codigo === 'DESEMBOLSO_NO_PROGRAMADO'
  );
  assert.equal(notificador.notificaciones.length, 1);
});

test('Sin notificador válido no se puede crear la ejecución', () => {
  assert.throws(() => crearEjecucionDesembolso({}), TypeError);
  assert.throws(() => crearEjecucionDesembolso({ notificador: {} }), TypeError);
});
