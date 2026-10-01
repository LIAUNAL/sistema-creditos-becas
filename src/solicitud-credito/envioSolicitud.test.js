'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { RegistroSolicitudCredito } = require('./registroSolicitudCredito');
const {
  EnvioSolicitudCredito,
  ErrorDocumentosFaltantes,
  ErrorFormatoInvalido,
  ErrorEstadoInvalido,
  DOCUMENTOS_REQUERIDOS_POR_DEFECTO,
  FORMATOS_PERMITIDOS_POR_DEFECTO,
} = require('./envioSolicitud');

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

function escenario() {
  const registro = new RegistroSolicitudCredito();
  const notificaciones = [];
  const notificador = { notificarEnvio: (n) => notificaciones.push(n) };
  const envio = new EnvioSolicitudCredito({ registro, notificador });
  const solicitud = registro.crear(datosValidos());
  return { registro, envio, notificaciones, solicitud };
}

function adjuntarTodos(envio, solicitudId, omitir = []) {
  for (const tipo of DOCUMENTOS_REQUERIDOS_POR_DEFECTO) {
    if (!omitir.includes(tipo)) {
      envio.adjuntarDocumento(solicitudId, { tipo, nombreArchivo: `${tipo}.pdf` });
    }
  }
}

test('Escenario 1: con todos los documentos adjuntos, confirmar el envío cambia a pendiente_revision y notifica al estudiante', () => {
  const { envio, notificaciones, solicitud } = escenario();
  adjuntarTodos(envio, solicitud.id);

  const resultado = envio.confirmarEnvio(solicitud.id);

  assert.equal(resultado.estado, 'pendiente_revision');
  assert.equal(envio.registro.obtener(solicitud.id).estado, 'pendiente_revision');
  assert.equal(notificaciones.length, 1);
  assert.equal(notificaciones[0].estudianteId, 'est-001');
  assert.equal(notificaciones[0].solicitudId, solicitud.id);
});

test('Escenario 2: falta el certificado de ingresos -> rechaza, nombra el documento y permanece en borrador', () => {
  const { registro, envio, notificaciones, solicitud } = escenario();
  adjuntarTodos(envio, solicitud.id, ['certificado_ingresos']);

  assert.throws(
    () => envio.confirmarEnvio(solicitud.id),
    (error) => {
      assert.ok(error instanceof ErrorDocumentosFaltantes);
      assert.deepEqual(error.documentosFaltantes, ['certificado_ingresos']);
      assert.match(error.message, /certificado_ingresos/);
      return true;
    }
  );

  assert.equal(registro.obtener(solicitud.id).estado, 'borrador');
  assert.equal(notificaciones.length, 0, 'no se notifica confirmación de un envío rechazado');
});

test('Escenario 2 (varios): lista todos los documentos faltantes', () => {
  const { envio, solicitud } = escenario();

  assert.throws(
    () => envio.confirmarEnvio(solicitud.id),
    (error) => {
      assert.deepEqual(error.documentosFaltantes, [...DOCUMENTOS_REQUERIDOS_POR_DEFECTO]);
      return true;
    }
  );
});

test('Escenario 3: formato no soportado -> rechaza el archivo, solicita formato válido y conserva los documentos ya cargados', () => {
  const { envio, solicitud } = escenario();
  envio.adjuntarDocumento(solicitud.id, { tipo: 'identificacion', nombreArchivo: 'cedula.pdf' });

  assert.throws(
    () =>
      envio.adjuntarDocumento(solicitud.id, {
        tipo: 'certificado_ingresos',
        nombreArchivo: 'ingresos.exe',
      }),
    (error) => {
      assert.ok(error instanceof ErrorFormatoInvalido);
      assert.deepEqual(error.formatosPermitidos, [...FORMATOS_PERMITIDOS_POR_DEFECTO]);
      assert.match(error.message, /formato/i);
      for (const formato of FORMATOS_PERMITIDOS_POR_DEFECTO) {
        assert.ok(error.message.includes(formato), `el mensaje debe sugerir ${formato}`);
      }
      return true;
    }
  );

  const documentos = envio.documentosDe(solicitud.id);
  assert.deepEqual(
    documentos.map((d) => d.tipo),
    ['identificacion']
  );
});

test('Formato: la validación de extensión no distingue mayúsculas y rechaza archivos sin extensión', () => {
  const { envio, solicitud } = escenario();

  envio.adjuntarDocumento(solicitud.id, { tipo: 'identificacion', nombreArchivo: 'CEDULA.PDF' });
  assert.throws(
    () => envio.adjuntarDocumento(solicitud.id, { tipo: 'certificado_matricula', nombreArchivo: 'matricula' }),
    ErrorFormatoInvalido
  );
});

test('Configuración: documentos requeridos y formatos permitidos son entradas configurables', () => {
  const registro = new RegistroSolicitudCredito();
  const envio = new EnvioSolicitudCredito({
    registro,
    notificador: { notificarEnvio() {} },
    documentosRequeridos: ['identificacion'],
    formatosPermitidos: ['docx'],
  });
  const solicitud = registro.crear(datosValidos());

  assert.throws(
    () => envio.adjuntarDocumento(solicitud.id, { tipo: 'identificacion', nombreArchivo: 'a.pdf' }),
    ErrorFormatoInvalido
  );
  envio.adjuntarDocumento(solicitud.id, { tipo: 'identificacion', nombreArchivo: 'a.docx' });

  assert.equal(envio.confirmarEnvio(solicitud.id).estado, 'pendiente_revision');
});

test('Adjuntar un documento del mismo tipo reemplaza al anterior', () => {
  const { envio, solicitud } = escenario();
  envio.adjuntarDocumento(solicitud.id, { tipo: 'identificacion', nombreArchivo: 'v1.pdf' });
  envio.adjuntarDocumento(solicitud.id, { tipo: 'identificacion', nombreArchivo: 'v2.png' });

  const documentos = envio.documentosDe(solicitud.id);
  assert.equal(documentos.length, 1);
  assert.equal(documentos[0].nombreArchivo, 'v2.png');
});

test('Solo se puede adjuntar o confirmar sobre una solicitud en borrador', () => {
  const { envio, solicitud } = escenario();
  adjuntarTodos(envio, solicitud.id);
  envio.confirmarEnvio(solicitud.id);

  assert.throws(() => envio.confirmarEnvio(solicitud.id), ErrorEstadoInvalido);
  assert.throws(
    () => envio.adjuntarDocumento(solicitud.id, { tipo: 'identificacion', nombreArchivo: 'x.pdf' }),
    ErrorEstadoInvalido
  );
  assert.throws(() => envio.confirmarEnvio('no-existe'), ErrorEstadoInvalido);
});

test('Regresión 1.1: una solicitud pendiente_revision sigue contando como activa para el periodo', () => {
  const { registro, envio, solicitud } = escenario();
  adjuntarTodos(envio, solicitud.id);
  envio.confirmarEnvio(solicitud.id);

  assert.throws(() => registro.crear(datosValidos()), { codigo: 'SOLICITUD_EXISTENTE' });
});
