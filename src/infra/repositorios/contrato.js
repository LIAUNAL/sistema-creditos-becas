'use strict';

const test = require('node:test');
const assert = require('node:assert');

// Suite de contrato de los puertos de persistencia de solicitud-credito (Story 5.7).
// Se escribe una sola vez y se corre contra cada implementacion (memoria y SQLite).
//
// `fabrica()` devuelve { repositorios: { solicitudes, documentos, decisiones }, ciclo(fn) }.
// `ciclo(fn)` corre `fn` como un caso de uso completo: en memoria es una llamada directa; en
// SQLite abre una unidad de trabajo nueva y vuelca sus cambios al terminar. Cada `ciclo` es,
// por tanto, una "peticion" distinta: lo escrito en uno debe observarse en los siguientes.

function solicitud(id, cambios = {}) {
  return {
    id,
    estudianteId: 'est-1',
    periodoAcademico: '2026-1',
    estado: 'borrador',
    ingresosHogar: 1500000,
    numeroDependientes: 2,
    estrato: 3,
    ocupacionAcudiente: 'docente',
    creadaEn: '2026-01-01T00:00:00.000Z',
    ...cambios,
  };
}

const ids = (lista) => lista.map((s) => s.id);

function definirSuiteDeContrato(nombre, fabrica) {
  const prueba = (descripcion, cuerpo) =>
    test(`[contrato ${nombre}] ${descripcion}`, async () => cuerpo(fabrica()));

  prueba('guardar y obtener devuelven la misma solicitud, y undefined si no existe', async ({ repositorios, ciclo }) => {
    const original = solicitud('s1');
    await ciclo(() => repositorios.solicitudes.guardar(original));

    const leida = await ciclo(() => repositorios.solicitudes.obtener('s1'));
    assert.deepStrictEqual(leida, solicitud('s1'));
    assert.equal(await ciclo(() => repositorios.solicitudes.obtener('no-existe')), undefined);
  });

  prueba('guardar de nuevo una solicitud existente reemplaza su estado', async ({ repositorios, ciclo }) => {
    await ciclo(() => repositorios.solicitudes.guardar(solicitud('s1')));
    await ciclo(() => {
      const s = repositorios.solicitudes.obtener('s1');
      s.estado = 'pendiente_revision';
      repositorios.solicitudes.guardar(s);
    });

    const leida = await ciclo(() => repositorios.solicitudes.obtener('s1'));
    assert.equal(leida.estado, 'pendiente_revision');
  });

  prueba('listarPorEstudiante devuelve solo las del estudiante, en orden de creacion', async ({ repositorios, ciclo }) => {
    await ciclo(() => {
      repositorios.solicitudes.guardar(solicitud('s1', { estudianteId: 'est-1', periodoAcademico: '2026-1' }));
      repositorios.solicitudes.guardar(solicitud('s2', { estudianteId: 'est-2' }));
      repositorios.solicitudes.guardar(solicitud('s3', { estudianteId: 'est-1', periodoAcademico: '2026-2' }));
    });

    assert.deepStrictEqual(ids(await ciclo(() => repositorios.solicitudes.listarPorEstudiante('est-1'))), ['s1', 's3']);
    assert.deepStrictEqual(ids(await ciclo(() => repositorios.solicitudes.listarPorEstudiante('est-2'))), ['s2']);
    assert.deepStrictEqual(await ciclo(() => repositorios.solicitudes.listarPorEstudiante('nadie')), []);
  });

  prueba('listarPorEstado y listarTodas reflejan el estado actual', async ({ repositorios, ciclo }) => {
    await ciclo(() => {
      repositorios.solicitudes.guardar(solicitud('s1', { estado: 'pendiente_revision' }));
      repositorios.solicitudes.guardar(solicitud('s2', { estado: 'borrador', estudianteId: 'est-2' }));
      repositorios.solicitudes.guardar(solicitud('s3', { estado: 'pendiente_revision', estudianteId: 'est-3' }));
    });
    await ciclo(() => {
      const s = repositorios.solicitudes.obtener('s1');
      s.estado = 'aprobada';
      repositorios.solicitudes.guardar(s);
    });

    assert.deepStrictEqual(ids(await ciclo(() => repositorios.solicitudes.listarPorEstado('pendiente_revision'))), ['s3']);
    assert.deepStrictEqual(ids(await ciclo(() => repositorios.solicitudes.listarPorEstado('aprobada'))), ['s1']);
    assert.deepStrictEqual(await ciclo(() => repositorios.solicitudes.listarPorEstado('rechazada')), []);
    assert.deepStrictEqual(ids(await ciclo(() => repositorios.solicitudes.listarTodas())), ['s1', 's2', 's3']);
  });

  prueba('las lecturas dentro del mismo ciclo ven lo guardado y mutado aun sin volcar', async ({ repositorios, ciclo }) => {
    const resultado = await ciclo(() => {
      repositorios.solicitudes.guardar(solicitud('s1', { estado: 'pendiente_revision' }));
      const antes = ids(repositorios.solicitudes.listarPorEstado('pendiente_revision'));
      repositorios.solicitudes.obtener('s1').estado = 'rechazada';
      const despues = ids(repositorios.solicitudes.listarPorEstado('pendiente_revision'));
      const rechazadas = ids(repositorios.solicitudes.listarPorEstado('rechazada'));
      return { antes, despues, rechazadas };
    });
    assert.deepStrictEqual(resultado, { antes: ['s1'], despues: [], rechazadas: ['s1'] });
  });

  prueba('buscarActivaPorEstudianteYPeriodo solo considera estados activos del periodo', async ({ repositorios, ciclo }) => {
    await ciclo(() => {
      repositorios.solicitudes.guardar(solicitud('s1', { estado: 'rechazada', periodoAcademico: '2026-1' }));
      repositorios.solicitudes.guardar(solicitud('s2', { estado: 'en_revision', periodoAcademico: '2026-2' }));
    });

    const buscar = (estudiante, periodo) =>
      ciclo(() => repositorios.solicitudes.buscarActivaPorEstudianteYPeriodo(estudiante, periodo));
    assert.equal(await buscar('est-1', '2026-1'), undefined);
    assert.equal((await buscar('est-1', '2026-2')).id, 's2');
    assert.equal(await buscar('est-1', '2027-1'), undefined);
    assert.equal(await buscar('est-9', '2026-2'), undefined);
  });

  prueba('documentos: guardar, listar, reemplazar por tipo y aislar por solicitud', async ({ repositorios, ciclo }) => {
    await ciclo(() => {
      repositorios.solicitudes.guardar(solicitud('s1'));
      repositorios.solicitudes.guardar(solicitud('s2', { estudianteId: 'est-2' }));
      repositorios.documentos.guardarDocumento('s1', { tipo: 'identificacion', nombreArchivo: 'id.pdf' });
      repositorios.documentos.guardarDocumento('s1', { tipo: 'certificado_ingresos', nombreArchivo: 'ing.pdf' });
      repositorios.documentos.guardarDocumento('s2', { tipo: 'identificacion', nombreArchivo: 'otro.png' });
    });
    await ciclo(() => {
      repositorios.documentos.guardarDocumento('s1', { tipo: 'identificacion', nombreArchivo: 'id-nuevo.jpg' });
    });

    assert.deepStrictEqual(await ciclo(() => repositorios.documentos.listarDocumentos('s1')), [
      { tipo: 'identificacion', nombreArchivo: 'id-nuevo.jpg' },
      { tipo: 'certificado_ingresos', nombreArchivo: 'ing.pdf' },
    ]);
    assert.deepStrictEqual(await ciclo(() => repositorios.documentos.listarDocumentos('s2')), [
      { tipo: 'identificacion', nombreArchivo: 'otro.png' },
    ]);
    assert.deepStrictEqual(await ciclo(() => repositorios.documentos.listarDocumentos('sin-docs')), []);
  });

  prueba('decisiones: aprobacion sin motivo, rechazo con motivo y fecha como Date', async ({ repositorios, ciclo }) => {
    const fecha = new Date('2026-03-04T10:20:30.000Z');
    await ciclo(() => {
      repositorios.solicitudes.guardar(solicitud('s1', { estado: 'aprobada' }));
      repositorios.solicitudes.guardar(solicitud('s2', { estado: 'rechazada', estudianteId: 'est-2' }));
      repositorios.decisiones.guardarDecision('s1', { tipo: 'aprobada', asesorId: 'ase-1', fecha });
      repositorios.decisiones.guardarDecision('s2', { tipo: 'rechazada', asesorId: 'ase-2', fecha, motivo: 'ingresos altos' });
    });

    const aprobada = await ciclo(() => repositorios.decisiones.obtenerDecision('s1'));
    const rechazada = await ciclo(() => repositorios.decisiones.obtenerDecision('s2'));
    assert.deepStrictEqual(aprobada, { tipo: 'aprobada', asesorId: 'ase-1', fecha });
    assert.deepStrictEqual(rechazada, { tipo: 'rechazada', asesorId: 'ase-2', fecha, motivo: 'ingresos altos' });
    assert.ok(rechazada.fecha instanceof Date);
    assert.equal(await ciclo(() => repositorios.decisiones.obtenerDecision('s9')), undefined);
  });
}

module.exports = { definirSuiteDeContrato, solicitud };
