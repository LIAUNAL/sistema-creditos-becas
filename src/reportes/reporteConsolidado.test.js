'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { generarReporteConsolidado } = require('./reporteConsolidado');

const PERIODO = '2026-1';

test('Escenario: Dirección académica consulta el reporte de ese periodo - totales de créditos aprobados, becas otorgadas y monto desembolsado', () => {
  const datos = {
    solicitudes: [
      { id: 'sol-1', periodoAcademico: PERIODO, estado: 'aprobada' },
      { id: 'sol-2', periodoAcademico: PERIODO, estado: 'aprobada' },
      { id: 'sol-3', periodoAcademico: PERIODO, estado: 'enviada' },
      { id: 'sol-4', periodoAcademico: '2025-2', estado: 'aprobada' },
    ],
    becas: [
      { id: 'bec-1', periodoAcademico: PERIODO, estado: 'otorgada' },
      { id: 'bec-2', periodoAcademico: PERIODO, estado: 'otorgada' },
      { id: 'bec-3', periodoAcademico: PERIODO, estado: 'rechazada' },
      { id: 'bec-4', periodoAcademico: '2025-2', estado: 'otorgada' },
    ],
    desembolsos: [
      { solicitudId: 'sol-1', monto: 250000.5, estado: 'desembolsado' },
      { solicitudId: 'sol-2', monto: 100000.25, estado: 'desembolsado' },
      { solicitudId: 'sol-2', monto: 100000, estado: 'programado' },
      { solicitudId: 'sol-4', monto: 999999, estado: 'desembolsado' },
    ],
  };

  const reporte = generarReporteConsolidado(PERIODO, datos);

  assert.deepEqual(reporte, {
    periodoAcademico: PERIODO,
    totalCreditosAprobados: 2,
    totalBecasOtorgadas: 2,
    montoTotalDesembolsado: 350000.75,
  });
});

test('Escenario: Dirección académica consulta el reporte de ese periodo (2) - periodo sin solicitudes devuelve totales en cero, sin error', () => {
  const datos = {
    solicitudes: [{ id: 'sol-9', periodoAcademico: '2025-2', estado: 'aprobada' }],
    becas: [{ id: 'bec-9', periodoAcademico: '2025-2', estado: 'otorgada' }],
    desembolsos: [{ solicitudId: 'sol-9', monto: 500, estado: 'desembolsado' }],
  };

  const reporte = generarReporteConsolidado(PERIODO, datos);

  assert.deepEqual(reporte, {
    periodoAcademico: PERIODO,
    totalCreditosAprobados: 0,
    totalBecasOtorgadas: 0,
    montoTotalDesembolsado: 0,
  });
});

test('Escenario (2) sin datos: entradas ausentes o vacías también dan totales en cero, sin error', () => {
  for (const datos of [undefined, {}, { solicitudes: [], becas: [], desembolsos: [] }]) {
    const reporte = generarReporteConsolidado(PERIODO, datos);
    assert.equal(reporte.totalCreditosAprobados, 0);
    assert.equal(reporte.totalBecasOtorgadas, 0);
    assert.equal(reporte.montoTotalDesembolsado, 0);
  }
});

test('La suma del monto desembolsado es exacta en centavos', () => {
  const datos = {
    solicitudes: [{ id: 'sol-1', periodoAcademico: PERIODO, estado: 'aprobada' }],
    desembolsos: [
      { solicitudId: 'sol-1', monto: 0.1, estado: 'desembolsado' },
      { solicitudId: 'sol-1', monto: 0.2, estado: 'desembolsado' },
    ],
  };

  assert.equal(generarReporteConsolidado(PERIODO, datos).montoTotalDesembolsado, 0.3);
});
