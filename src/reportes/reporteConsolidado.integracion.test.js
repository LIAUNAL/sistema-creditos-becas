'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { generarReporteConsolidado } = require('./reporteConsolidado');
const { CalendarioDesembolso } = require('../desembolso/calendarioDesembolso');
const { crearEjecucionDesembolso } = require('../desembolso/ejecucionDesembolso');
const { crearRevisionVencimientos } = require('../desembolso/vencimientoDesembolso');

const PERIODO = '2026-1';

test('El monto total desembolsado del reporte suma solo las cuotas `ejecutado` del calendario real', async () => {
  const calendario = new CalendarioDesembolso();
  const solicitud = { id: 'sol-1', estado: 'aprobada', monto: 1000.01, numeroCuotas: 4, periodoAcademico: PERIODO };
  // Cuotas: 250 (01-08), 250 (01-09), 250 (01-10), 250.01 (01-11).
  const desembolsos = calendario.generar(solicitud, { fechaPrimeraCuota: '2026-08-01' });

  const ejecucion = crearEjecucionDesembolso({
    notificador: { notificarDesembolso: async () => {} },
    reloj: () => new Date('2026-10-01T12:00:00Z'),
  });
  await ejecucion.ejecutar(desembolsos[0]);
  await ejecucion.ejecutar(desembolsos[3]);

  // Con "hoy" = 2026-10-01 y plazo de 15 días, la cuota 2 queda vencida y la 3 programada.
  const revision = crearRevisionVencimientos({ reloj: () => new Date('2026-10-01T12:00:00Z') });
  revision.revisar(desembolsos, { periodoAcademico: PERIODO });

  assert.deepEqual(
    desembolsos.map((d) => d.estado),
    ['ejecutado', 'vencido', 'programado', 'ejecutado']
  );

  const reporte = generarReporteConsolidado(PERIODO, { solicitudes: [solicitud], desembolsos });

  assert.equal(reporte.montoTotalDesembolsado, 500.01);
});
