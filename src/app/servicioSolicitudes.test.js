'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { abrirBaseDeDatos } = require('../infra/baseDeDatos');
const { ejecutarMigraciones } = require('../infra/migraciones');
const { crearRelojFijo } = require('../infra/reloj');
const { crearContextoApp } = require('./contextoApp');
const { idCanonicoEstudiante } = require('./servicioSolicitudes');

const DATOS = {
  periodoAcademico: '2026-1',
  ingresosHogar: '1500000',
  numeroDependientes: '2',
  estrato: '3',
  ocupacionAcudiente: 'docente',
};

function montar() {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  const contexto = crearContextoApp({ db, reloj: crearRelojFijo(new Date('2026-05-04T12:30:00.000Z')) });
  return { db, servicio: contexto.servicioSolicitudes };
}

const ana = { id: 7, nombre_usuario: 'ana', rol: 'estudiante' };
const luis = { id: 8, nombre_usuario: 'luis', rol: 'estudiante' };

test('el id canonico es estudianteId si existe y, si no, el id de usuario como texto', () => {
  assert.strictEqual(idCanonicoEstudiante(ana), '7');
  assert.strictEqual(idCanonicoEstudiante({ ...ana, estudianteId: 'est-99' }), 'est-99');
});

test('crearSolicitud normaliza los datos, asocia el id canonico y los listados solo ven lo propio', async () => {
  const { servicio } = montar();
  const creada = await servicio.crearSolicitud({ ...ana, estudianteId: 'est-99' }, DATOS);
  assert.strictEqual(creada.estudianteId, 'est-99');
  assert.strictEqual(creada.estado, 'borrador');
  assert.strictEqual(creada.ingresosHogar, 1500000);
  assert.strictEqual(creada.numeroDependientes, 2);
  assert.strictEqual(creada.estrato, 3);

  assert.deepStrictEqual((await servicio.listarMisSolicitudes({ ...ana, estudianteId: 'est-99' })).map((s) => s.id), [creada.id]);
  assert.deepStrictEqual(await servicio.listarMisSolicitudes(luis), []);
  assert.strictEqual(await servicio.obtenerSolicitud(luis, creada.id), undefined);
  await assert.rejects(servicio.confirmarEnvio(luis, creada.id), { codigo: 'RECURSO_NO_ENCONTRADO', estadoHttp: 404 });
});

test('un usuario que no es estudiante no puede crear solicitudes', async () => {
  const { servicio } = montar();
  await assert.rejects(servicio.crearSolicitud({ id: 1, rol: 'asesor_financiero' }, DATOS), {
    codigo: 'ROL_NO_PERMITIDO',
    estadoHttp: 403,
  });
});

test('los datos invalidos se reportan todos juntos con su campo', async () => {
  const { servicio, db } = montar();
  await assert.rejects(
    servicio.crearSolicitud(ana, { periodoAcademico: ' ', ingresosHogar: '-5', numeroDependientes: '1.5', estrato: '7' }),
    (error) => {
      assert.strictEqual(error.codigo, 'DATOS_INVALIDOS');
      assert.deepStrictEqual(Object.keys(error.errores).sort(), [
        'ingresosHogar',
        'numeroDependientes',
        'ocupacionAcudiente',
        'periodoAcademico',
        'estrato',
      ].sort());
      return true;
    },
  );
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM solicitudes').get().n, 0);
});

test('confirmarEnvio encola el aviso en la misma transaccion y un envio fallido no escribe nada', async () => {
  const { servicio, db } = montar();
  const { id } = await servicio.crearSolicitud(ana, DATOS);
  await servicio.adjuntarDocumento(ana, id, { tipo: 'identificacion', nombreArchivo: 'id.pdf' });
  await assert.rejects(servicio.confirmarEnvio(ana, id), { codigo: 'DOCUMENTOS_FALTANTES' });
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n, 0);

  await servicio.adjuntarDocumento(ana, id, { tipo: 'certificado_ingresos', nombreArchivo: 'i.pdf' });
  await servicio.adjuntarDocumento(ana, id, { tipo: 'certificado_matricula', nombreArchivo: 'm.png' });
  const enviada = await servicio.confirmarEnvio(ana, id);
  assert.strictEqual(enviada.estado, 'pendiente_revision');
  assert.deepStrictEqual(
    db.prepare('SELECT tipo, destinatario_id FROM notifications').all().map((f) => ({ ...f })),
    [{ tipo: 'envio', destinatario_id: '7' }],
  );
  const detalle = await servicio.obtenerSolicitud(ana, id);
  assert.deepStrictEqual(detalle.faltantes, []);
  assert.strictEqual(detalle.documentos.length, 3);
});
