'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { RegistroSolicitudCredito } = require('./registroSolicitudCredito');
const {
  DecisionAsesorFinanciero,
  ErrorMotivoRechazoRequerido,
  ErrorAsesorRequerido,
  ErrorSolicitudNoEnRevision,
} = require('./decisionAsesor');

const FECHA = new Date('2026-10-01T10:00:00Z');

function escenario({ estado = 'pendiente_revision' } = {}) {
  const registro = new RegistroSolicitudCredito();
  const notificaciones = [];
  const notificador = { notificarDecision: (n) => notificaciones.push(n) };
  const decision = new DecisionAsesorFinanciero({ registro, notificador, reloj: () => FECHA });
  const solicitud = registro.crear({
    estudianteId: 'est-001',
    periodoAcademico: '2026-1',
    ingresosHogar: 2500000,
    numeroDependientes: 3,
    estrato: 2,
    ocupacionAcudiente: 'Comerciante',
  });
  solicitud.estado = estado;
  return { registro, decision, notificaciones, solicitud };
}

test('Escenario 1: el asesor aprueba -> estado aprobada, registra asesor y fecha, y notifica al estudiante', () => {
  const { registro, decision, notificaciones, solicitud } = escenario();

  const resultado = decision.aprobar(solicitud.id, { asesorId: 'ase-007' });

  assert.equal(resultado.estado, 'aprobada');
  assert.equal(registro.obtener(solicitud.id).estado, 'aprobada');
  assert.deepEqual(resultado.decision, { tipo: 'aprobada', asesorId: 'ase-007', fecha: FECHA });
  assert.equal(notificaciones.length, 1);
  assert.equal(notificaciones[0].estudianteId, 'est-001');
  assert.equal(notificaciones[0].solicitudId, solicitud.id);
  assert.equal(notificaciones[0].estado, 'aprobada');
});

test('Escenario 2: rechazo sin motivo -> bloquea la acción y exige un motivo; la solicitud no cambia', () => {
  const { registro, decision, notificaciones, solicitud } = escenario();

  for (const motivo of [undefined, '', '   ']) {
    assert.throws(
      () => decision.rechazar(solicitud.id, { asesorId: 'ase-007', motivo }),
      (error) => error instanceof ErrorMotivoRechazoRequerido && error.codigo === 'MOTIVO_RECHAZO_REQUERIDO'
    );
  }

  assert.equal(registro.obtener(solicitud.id).estado, 'pendiente_revision');
  assert.equal(decision.consultarHistorial(solicitud.id), undefined);
  assert.equal(notificaciones.length, 0);
});

test('Escenario 3: solicitud rechazada con motivo -> el historial muestra asesor, fecha y motivo', () => {
  const { decision, notificaciones, solicitud } = escenario();

  decision.rechazar(solicitud.id, { asesorId: 'ase-007', motivo: 'Ingresos no verificables' });
  const historial = decision.consultarHistorial(solicitud.id);

  assert.equal(historial.estado, 'rechazada');
  assert.deepEqual(historial.decision, {
    tipo: 'rechazada',
    asesorId: 'ase-007',
    fecha: FECHA,
    motivo: 'Ingresos no verificables',
  });
  assert.equal(notificaciones.length, 1);
  assert.equal(notificaciones[0].estado, 'rechazada');
});

test('Supuesto: solo se decide sobre solicitudes en pendiente_revision', () => {
  const { decision, solicitud } = escenario({ estado: 'borrador' });
  assert.throws(() => decision.aprobar(solicitud.id, { asesorId: 'a' }), ErrorSolicitudNoEnRevision);
  assert.throws(() => decision.aprobar('no-existe', { asesorId: 'a' }), ErrorSolicitudNoEnRevision);
});

test('Supuesto: se exige la identidad del asesor', () => {
  const { decision, solicitud } = escenario();
  assert.throws(() => decision.aprobar(solicitud.id, {}), ErrorAsesorRequerido);
  assert.throws(() => decision.rechazar(solicitud.id, { motivo: 'x' }), ErrorAsesorRequerido);
});

test('Supuesto: una solicitud ya decidida no admite otra decisión', () => {
  const { decision, solicitud } = escenario();
  decision.aprobar(solicitud.id, { asesorId: 'a' });
  assert.throws(() => decision.rechazar(solicitud.id, { asesorId: 'a', motivo: 'x' }), ErrorSolicitudNoEnRevision);
});
