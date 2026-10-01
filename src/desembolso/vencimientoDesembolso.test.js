'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CalendarioDesembolso } = require('./calendarioDesembolso');
const { crearEjecucionDesembolso } = require('./ejecucionDesembolso');
const {
  crearRevisionVencimientos,
  ESTADO_DESEMBOLSO_VENCIDO,
  PLAZO_CONFIRMACION_DIAS_POR_DEFECTO,
} = require('./vencimientoDesembolso');
const { calcularTasaMora } = require('../reportes/alertaTasaMora');

function crearRevision(hoy, opciones = {}) {
  return crearRevisionVencimientos({ reloj: () => new Date(`${hoy}T10:00:00Z`), ...opciones });
}

function desembolsosProgramados() {
  return new CalendarioDesembolso().generar(
    { id: 'sol-1', estado: 'aprobada', monto: 1000000, numeroCuotas: 4 },
    { fechaPrimeraCuota: '2026-02-15' }
  );
}

test('Escenario: El sistema ejecuta la revisión periódica de vencimientos - programado fuera de plazo pasa a vencido y entra al conteo de mora del periodo', () => {
  const revision = crearRevision('2026-03-05');
  const [primero, segundo] = desembolsosProgramados();
  primero.periodoAcademico = '2026-1';
  segundo.periodoAcademico = '2026-1';

  // cuota 1: 2026-02-15 + 15 días = 2026-03-02 < 2026-03-05; cuota 2: 2026-03-15 aún no vence
  const resultado = revision.revisar([primero, segundo]);

  assert.equal(ESTADO_DESEMBOLSO_VENCIDO, 'vencido');
  assert.equal(primero.estado, 'vencido');
  assert.equal(segundo.estado, 'programado');
  assert.deepEqual(resultado.marcados, [primero]);
  assert.deepEqual(resultado.moraPorPeriodo, { '2026-1': 1 });
  assert.equal(revision.contarMoraPorPeriodo([primero, segundo], '2026-1'), 1);
});

test('Escenario: El sistema ejecuta la revisión periódica de vencimientos (2) - desembolso confirmado dentro del plazo permanece ejecutado', async () => {
  const revision = crearRevision('2026-06-01');
  const ejecucion = crearEjecucionDesembolso({
    notificador: { notificarDesembolso() {} },
    reloj: () => new Date('2026-02-16T10:00:00Z'),
  });
  const [desembolso] = desembolsosProgramados();
  desembolso.periodoAcademico = '2026-1';
  await ejecucion.ejecutar(desembolso);

  const resultado = revision.revisar([desembolso]);

  assert.equal(desembolso.estado, 'ejecutado');
  assert.deepEqual(resultado.marcados, []);
  assert.deepEqual(resultado.moraPorPeriodo, {});
  assert.equal(revision.contarMoraPorPeriodo([desembolso], '2026-1'), 0);
});

test('el plazo vence estrictamente después de fecha + plazo: el último día del plazo aún no es vencido', () => {
  const [desembolso] = desembolsosProgramados();

  crearRevision('2026-03-02').revisar([desembolso]);
  assert.equal(desembolso.estado, 'programado');

  crearRevision('2026-03-03').revisar([desembolso]);
  assert.equal(desembolso.estado, 'vencido');
});

test('el plazo por defecto son 15 días y es configurable por tipo de crédito', () => {
  assert.equal(PLAZO_CONFIRMACION_DIAS_POR_DEFECTO, 15);
  const revision = crearRevision('2026-02-25', { plazosPorTipoCredito: { beca: 5 } });
  const [credito] = desembolsosProgramados();
  const [beca] = new CalendarioDesembolso().generar(
    { id: 'sol-2', estado: 'aprobada', monto: 100, numeroCuotas: 1 },
    { fechaPrimeraCuota: '2026-02-15' }
  );
  beca.tipoCredito = 'beca';
  credito.tipoCredito = 'credito';

  revision.revisar([credito, beca]);

  assert.equal(beca.estado, 'vencido');
  assert.equal(credito.estado, 'programado', 'tipo sin plazo configurado usa el plazo por defecto');
});

test('la revisión es idempotente y no toca desembolsos ya vencidos', () => {
  const revision = crearRevision('2026-04-01');
  const [desembolso] = desembolsosProgramados();
  desembolso.periodoAcademico = '2026-1';

  revision.revisar([desembolso]);
  const segunda = revision.revisar([desembolso]);

  assert.equal(desembolso.estado, 'vencido');
  assert.deepEqual(segunda.marcados, []);
  assert.deepEqual(segunda.moraPorPeriodo, { '2026-1': 1 }, 'el conteo incluye los vencidos previos');
});

test('el periodo se toma del desembolso o, si falta, de opciones.periodoAcademico', () => {
  const revision = crearRevision('2026-04-01');
  const [desembolso] = desembolsosProgramados();

  const resultado = revision.revisar([desembolso], { periodoAcademico: '2026-1' });

  assert.equal(desembolso.periodoAcademico, '2026-1');
  assert.deepEqual(resultado.moraPorPeriodo, { '2026-1': 1 });
});

test('los desembolsos marcados alimentan calcularTasaMora de reportes sin adaptación', () => {
  const revision = crearRevision('2026-03-05');
  const desembolsos = desembolsosProgramados();
  desembolsos.forEach((d) => {
    d.periodoAcademico = '2026-1';
  });

  revision.revisar(desembolsos);

  assert.equal(calcularTasaMora('2026-1', { desembolsos }), 0.25);
});

test('un desembolso con fecha inválida no se marca vencido', () => {
  const revision = crearRevision('2026-12-31');
  const desembolso = { id: 'x', estado: 'programado', fecha: 'no-es-fecha' };

  const resultado = revision.revisar([desembolso]);

  assert.equal(desembolso.estado, 'programado');
  assert.deepEqual(resultado.marcados, []);
});
