'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CalendarioDesembolso,
  ErrorGeneracionCalendario,
} = require('./calendarioDesembolso');

function solicitudAprobada(overrides = {}) {
  return {
    id: 'sol-1',
    estado: 'aprobada',
    monto: 1000000,
    numeroCuotas: 4,
    ...overrides,
  };
}

const OPCIONES = { fechaPrimeraCuota: '2026-02-15' };

test('Escenario: El sistema genera el calendario - un desembolso programado por cuota con fecha y monto', () => {
  const calendario = new CalendarioDesembolso();

  const desembolsos = calendario.generar(solicitudAprobada(), OPCIONES);

  assert.equal(desembolsos.length, 4);
  for (const desembolso of desembolsos) {
    assert.equal(desembolso.estado, 'programado');
    assert.equal(desembolso.solicitudId, 'sol-1');
    assert.equal(typeof desembolso.monto, 'number');
    assert.ok(desembolso.monto > 0);
    assert.match(desembolso.fecha, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.deepEqual(
    desembolsos.map((d) => d.numeroCuota),
    [1, 2, 3, 4]
  );
  assert.deepEqual(
    desembolsos.map((d) => d.fecha),
    ['2026-02-15', '2026-03-15', '2026-04-15', '2026-05-15']
  );
  assert.deepEqual(calendario.obtenerPorSolicitud('sol-1'), desembolsos);
});

test('Escenario: El sistema genera el calendario - los montos suman el monto aprobado', () => {
  const calendario = new CalendarioDesembolso();

  const desembolsos = calendario.generar(
    solicitudAprobada({ monto: 1000, numeroCuotas: 3 }),
    OPCIONES
  );

  const total = desembolsos.reduce((suma, d) => suma + d.monto, 0);
  assert.equal(Math.round(total * 100), 100000);
});

test('Escenario: El sistema genera el calendario - ajusta el día al fin de mes más corto', () => {
  const calendario = new CalendarioDesembolso();

  const desembolsos = calendario.generar(solicitudAprobada({ numeroCuotas: 3 }), {
    fechaPrimeraCuota: '2026-01-31',
  });

  assert.deepEqual(
    desembolsos.map((d) => d.fecha),
    ['2026-01-31', '2026-02-28', '2026-03-31']
  );
});

for (const monto of [0, -500, NaN, Infinity, '1000', null, undefined]) {
  test(`Escenario: El sistema intenta generar el calendario - rechaza monto inválido (${String(monto)}) sin desembolsos parciales`, () => {
    const calendario = new CalendarioDesembolso();

    assert.throws(
      () => calendario.generar(solicitudAprobada({ monto }), OPCIONES),
      (error) => {
        assert.ok(error instanceof ErrorGeneracionCalendario);
        assert.equal(error.codigo, 'MONTO_INVALIDO');
        return true;
      }
    );

    assert.deepEqual(calendario.obtenerPorSolicitud('sol-1'), []);
    assert.equal(calendario.errores.length, 1);
    assert.equal(calendario.errores[0].solicitudId, 'sol-1');
    assert.equal(calendario.errores[0].codigo, 'MONTO_INVALIDO');
    assert.equal(typeof calendario.errores[0].registradoEn, 'string');
  });
}

test('Escenario: El sistema intenta generar el calendario - rechaza número de cuotas inválido sin desembolsos parciales', () => {
  const calendario = new CalendarioDesembolso();

  for (const numeroCuotas of [0, -1, 2.5, undefined]) {
    assert.throws(
      () => calendario.generar(solicitudAprobada({ numeroCuotas }), OPCIONES),
      (error) => error.codigo === 'CUOTAS_INVALIDAS'
    );
  }
  assert.deepEqual(calendario.obtenerPorSolicitud('sol-1'), []);
  assert.equal(calendario.errores.length, 4);
});

test('Rechaza una solicitud que no está aprobada y registra el error', () => {
  const calendario = new CalendarioDesembolso();

  assert.throws(
    () => calendario.generar(solicitudAprobada({ estado: 'borrador' }), OPCIONES),
    (error) => error.codigo === 'SOLICITUD_NO_APROBADA'
  );
  assert.deepEqual(calendario.obtenerPorSolicitud('sol-1'), []);
  assert.equal(calendario.errores.length, 1);
});

test('Rechaza una fecha de primera cuota inválida sin desembolsos parciales', () => {
  const calendario = new CalendarioDesembolso();

  assert.throws(
    () => calendario.generar(solicitudAprobada(), { fechaPrimeraCuota: 'mañana' }),
    (error) => error.codigo === 'FECHA_INVALIDA'
  );
  assert.deepEqual(calendario.obtenerPorSolicitud('sol-1'), []);
});

test('Una reaprobación no duplica los desembolsos (nota técnica de la story)', () => {
  const calendario = new CalendarioDesembolso();

  const primero = calendario.generar(solicitudAprobada(), OPCIONES);
  const segundo = calendario.generar(solicitudAprobada(), OPCIONES);

  assert.deepEqual(segundo, primero);
  assert.equal(calendario.obtenerPorSolicitud('sol-1').length, 4);
  assert.equal(calendario.errores.length, 0);
});
