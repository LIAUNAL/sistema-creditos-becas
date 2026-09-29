'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RegistroSolicitudCredito,
  ErrorCamposFaltantes,
  ErrorSolicitudExistente,
} = require('./registroSolicitudCredito');

function datosValidos(overrides = {}) {
  return {
    estudianteId: 'est-001',
    periodoAcademico: '2026-1',
    ingresosHogar: 2500000,
    numeroDependientes: 3,
    estrato: 2,
    ocupacionAcudiente: 'Comerciante',
    ...overrides,
  };
}

test('Criterio 1: formulario completo crea la solicitud en estado borrador, con id único, asociada al estudiante', () => {
  const registro = new RegistroSolicitudCredito();

  const solicitud = registro.crear(datosValidos());

  assert.equal(solicitud.estado, 'borrador');
  assert.equal(solicitud.estudianteId, 'est-001');
  assert.equal(typeof solicitud.id, 'string');
  assert.ok(solicitud.id.length > 0, 'debe tener un identificador único asignado');

  // Queda realmente persistida y recuperable por su id.
  assert.deepEqual(registro.obtener(solicitud.id), solicitud);
});

test('Criterio 1 (unicidad): dos solicitudes distintas reciben ids distintos', () => {
  const registro = new RegistroSolicitudCredito();

  const s1 = registro.crear(datosValidos({ estudianteId: 'est-001', periodoAcademico: '2026-1' }));
  const s2 = registro.crear(datosValidos({ estudianteId: 'est-002', periodoAcademico: '2026-1' }));

  assert.notEqual(s1.id, s2.id);
});

test('Criterio 2: una segunda solicitud para el mismo periodo académico se rechaza y expone el estado de la existente', () => {
  const registro = new RegistroSolicitudCredito();
  const primera = registro.crear(datosValidos({ periodoAcademico: '2026-1' }));

  assert.throws(
    () => registro.crear(datosValidos({ periodoAcademico: '2026-1' })),
    (error) => {
      assert.ok(error instanceof ErrorSolicitudExistente);
      assert.equal(error.codigo, 'SOLICITUD_EXISTENTE');
      assert.equal(error.solicitudExistente.id, primera.id);
      assert.equal(error.solicitudExistente.estado, 'borrador');
      return true;
    }
  );
});

test('Criterio 2 (no bloquea otro periodo): el mismo estudiante SÍ puede solicitar en un periodo académico distinto', () => {
  const registro = new RegistroSolicitudCredito();
  registro.crear(datosValidos({ periodoAcademico: '2026-1' }));

  const segunda = registro.crear(datosValidos({ periodoAcademico: '2026-2' }));

  assert.equal(segunda.periodoAcademico, '2026-2');
  assert.equal(segunda.estado, 'borrador');
});

test('Criterio 3: campos socioeconómicos obligatorios vacíos bloquean el envío y se listan los campos faltantes', () => {
  const registro = new RegistroSolicitudCredito();

  assert.throws(
    () =>
      registro.crear(
        datosValidos({
          ingresosHogar: undefined,
          numeroDependientes: '',
          estrato: 2,
          ocupacionAcudiente: 'Comerciante',
        })
      ),
    (error) => {
      assert.ok(error instanceof ErrorCamposFaltantes);
      assert.equal(error.codigo, 'CAMPOS_FALTANTES');
      assert.deepEqual(error.camposFaltantes, ['ingresosHogar', 'numeroDependientes']);
      return true;
    }
  );
});

test('Criterio 3: una solicitud con todos los campos socioeconómicos vacíos no queda registrada', () => {
  const registro = new RegistroSolicitudCredito();

  assert.throws(() =>
    registro.crear({
      estudianteId: 'est-003',
      periodoAcademico: '2026-1',
    })
  );

  // Nada debió quedar persistido: no hay solicitud activa para ese estudiante/periodo.
  assert.equal(
    registro.buscarActivaPorEstudianteYPeriodo('est-003', '2026-1'),
    undefined
  );
});
