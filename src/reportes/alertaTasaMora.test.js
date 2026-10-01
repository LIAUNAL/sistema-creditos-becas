'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { generarAlertaTasaMora, calcularTasaMora } = require('./alertaTasaMora');

const PERIODO = '2026-1';

function desembolsos(programados, ejecutados, vencidos, periodoAcademico = PERIODO) {
  const crear = (cantidad, estado) =>
    Array.from({ length: cantidad }, () => ({ periodoAcademico, estado }));
  return [...crear(programados, 'programado'), ...crear(ejecutados, 'ejecutado'), ...crear(vencidos, 'vencido')];
}

test('Escenario: El sistema recalcula la tasa de mora del periodo - genera una alerta indicando el periodo, la tasa calculada y el umbral configurado', () => {
  // 3 vencidos de 10 -> 0.3 > 0.1
  const alerta = generarAlertaTasaMora(PERIODO, 0.1, { desembolsos: desembolsos(2, 5, 3) });

  assert.deepEqual(alerta, { periodoAcademico: PERIODO, tasaMora: 0.3, umbral: 0.1 });
});

test('Escenario: El sistema recalcula la tasa de mora del periodo (2) - no genera ninguna alerta para ese periodo', () => {
  // 1 vencido de 10 -> 0.1 < 0.2
  const alerta = generarAlertaTasaMora(PERIODO, 0.2, { desembolsos: desembolsos(2, 7, 1) });

  assert.equal(alerta, null);
});

test('Supuesto: una tasa igual al umbral no supera el umbral y no genera alerta', () => {
  const alerta = generarAlertaTasaMora(PERIODO, 0.25, { desembolsos: desembolsos(1, 2, 1) });

  assert.equal(alerta, null);
});

test('Supuesto: solo cuentan los desembolsos del periodo consultado', () => {
  const datos = {
    desembolsos: [...desembolsos(1, 1, 0), ...desembolsos(0, 0, 10, '2025-2')],
  };

  assert.equal(calcularTasaMora(PERIODO, datos), 0);
  assert.equal(generarAlertaTasaMora(PERIODO, 0.1, datos), null);
});

test('Supuesto: estados fuera de programado/ejecutado/vencido no entran en el denominador', () => {
  const datos = {
    desembolsos: [...desembolsos(0, 1, 1), { periodoAcademico: PERIODO, estado: 'cancelado' }],
  };

  assert.equal(calcularTasaMora(PERIODO, datos), 0.5);
});

test('Supuesto: sin desembolsos en el periodo la tasa es 0 y no hay alerta', () => {
  assert.equal(calcularTasaMora(PERIODO), 0);
  assert.equal(generarAlertaTasaMora(PERIODO, 0), null);
});

test('Supuesto: un umbral no numérico lanza error en lugar de silenciar la alerta', () => {
  assert.throws(() => generarAlertaTasaMora(PERIODO, undefined), TypeError);
  assert.throws(() => generarAlertaTasaMora(PERIODO, Number.NaN), TypeError);
});
