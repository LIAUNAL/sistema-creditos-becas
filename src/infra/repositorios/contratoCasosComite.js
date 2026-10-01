'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { crearRevisionComite, ESTADOS_CASO } = require('../../evaluacion-elegibilidad/revisionComite');

// Suite de contrato del puerto de casos del comite (Story 5.12).
// Se escribe una sola vez y se corre contra cada implementacion (memoria y SQLite), igual que
// contratoCalendario.js. `fabrica()` devuelve { repositorio, ciclo(fn), sembrar(...ids) }:
//   - `ciclo(fn)` corre `fn` como un caso de uso completo (en SQLite: unidad de trabajo nueva y
//     volcado al terminar) y es asincrono, porque `procesarResultado` lo es;
//   - `sembrar(...ids)` crea las solicitudes de beca a las que apunta cada caso (no-op en memoria).

const FECHA = new Date('2026-05-04T12:30:00.000Z');

function caso(id, cambios = {}) {
  return {
    id,
    estudiante: { estudianteId: 'est-1' },
    periodoAcademico: '2026-1',
    puntaje: 62.5,
    estado: ESTADOS_CASO.EN_REVISION_COMITE,
    historial: [{ tipo: 'ingreso_cola_comite', fecha: new Date(FECHA), puntaje: 62.5 }],
    ...cambios,
  };
}

const ids = (lista) => lista.map((c) => c.id);

function definirSuiteDeContratoCasosComite(nombre, fabrica) {
  const prueba = (descripcion, cuerpo) =>
    test(`[contrato casos comite ${nombre}] ${descripcion}`, async () => cuerpo(fabrica()));

  prueba('guardarCaso y obtenerCaso conservan la forma y devuelven las fechas como Date', async ({ repositorio, ciclo, sembrar }) => {
    sembrar('c1');
    await ciclo(() => repositorio.guardarCaso(caso('c1')));

    const leido = await ciclo(() => repositorio.obtenerCaso('c1'));
    assert.deepStrictEqual(leido, caso('c1'));
    assert.ok(leido.historial[0].fecha instanceof Date);
    assert.strictEqual(await ciclo(() => repositorio.obtenerCaso('no-existe')), undefined);
  });

  prueba('dentro del mismo ciclo se lee lo guardado aun sin volcar, siempre la misma instancia', async ({ repositorio, ciclo, sembrar }) => {
    sembrar('c1');
    const [primera, segunda] = await ciclo(() => {
      repositorio.guardarCaso(caso('c1'));
      return [repositorio.obtenerCaso('c1'), repositorio.obtenerCaso('c1')];
    });
    assert.strictEqual(primera, segunda);
    assert.deepStrictEqual(primera, caso('c1'));
  });

  prueba('las mutaciones de un caso obtenido se escriben al terminar el ciclo (write-back)', async ({ repositorio, ciclo, sembrar }) => {
    sembrar('c1');
    await ciclo(() => repositorio.guardarCaso(caso('c1')));
    const fechaDecision = new Date('2026-05-05T08:00:00.000Z');
    await ciclo(() => {
      const vivo = repositorio.obtenerCaso('c1');
      vivo.estado = ESTADOS_CASO.OTORGADA;
      vivo.historial.push({ tipo: 'decision_comite', fecha: fechaDecision, decision: 'otorgada', comentario: 'Cumple el perfil' });
    });

    const recargado = await ciclo(() => repositorio.obtenerCaso('c1'));
    assert.strictEqual(recargado.estado, 'otorgada');
    assert.deepStrictEqual(recargado.historial[1], {
      tipo: 'decision_comite',
      fecha: fechaDecision,
      decision: 'otorgada',
      comentario: 'Cumple el perfil',
    });
  });

  prueba('listarTodos y listarPorEstado reflejan el estado actual en orden de ingreso', async ({ repositorio, ciclo, sembrar }) => {
    sembrar('c1', 'c2', 'c3');
    await ciclo(() => {
      repositorio.guardarCaso(caso('c1'));
      repositorio.guardarCaso(caso('c2'));
      repositorio.guardarCaso(caso('c3'));
    });
    await ciclo(() => {
      repositorio.obtenerCaso('c2').estado = ESTADOS_CASO.DENEGADA;
    });

    assert.deepStrictEqual(ids(await ciclo(() => repositorio.listarTodos())), ['c1', 'c2', 'c3']);
    assert.deepStrictEqual(ids(await ciclo(() => repositorio.listarPorEstado('en_revision_comite'))), ['c1', 'c3']);
    assert.deepStrictEqual(ids(await ciclo(() => repositorio.listarPorEstado('denegada'))), ['c2']);
    assert.deepStrictEqual(await ciclo(() => repositorio.listarPorEstado('otorgada')), []);
  });

  prueba('un caso modificado y aun sin volcar aparece en listarPorEstado con su estado en memoria', async ({ repositorio, ciclo, sembrar }) => {
    sembrar('c1');
    await ciclo(() => repositorio.guardarCaso(caso('c1')));
    const dentro = await ciclo(() => {
      repositorio.obtenerCaso('c1').estado = ESTADOS_CASO.DENEGADA;
      return [ids(repositorio.listarPorEstado('en_revision_comite')), ids(repositorio.listarPorEstado('denegada'))];
    });
    assert.deepStrictEqual(dentro, [[], ['c1']]);
  });

  prueba('revisionComite sobre el repositorio: encola una vez, notifica una vez y recarga igual', async ({ repositorio, ciclo, sembrar }) => {
    sembrar('c1');
    const avisos = [];
    const revision = crearRevisionComite({
      notificador: { notificarCasoLimitrofe: (aviso) => avisos.push(aviso) },
      repositorio,
      reloj: () => new Date(FECHA),
    });
    const entrada = { id: 'c1', estudiante: { estudianteId: 'est-1' }, periodoAcademico: '2026-1' };
    const resultado = { clasificacion: 'limitrofe', decisionAutomatica: false, puntaje: 62.5 };

    await ciclo(() => revision.procesarResultado(entrada, resultado));
    const repetido = await ciclo(() => revision.procesarResultado(entrada, resultado));

    assert.strictEqual(repetido.enColaComite, true);
    assert.strictEqual(avisos.length, 1);
    assert.deepStrictEqual(ids(await ciclo(() => revision.listarCola())), ['c1']);

    await ciclo(() => revision.registrarDecision('c1', { decision: 'denegada', comentario: 'Ingresos por encima del umbral' }));

    assert.deepStrictEqual(await ciclo(() => revision.listarCola()), []);
    const recargado = await ciclo(() => revision.obtenerCaso('c1'));
    assert.strictEqual(recargado.estado, 'denegada');
    assert.strictEqual(recargado.historial.at(-1).comentario, 'Ingresos por encima del umbral');
    assert.ok(recargado.historial.at(-1).fecha instanceof Date);
    assert.strictEqual(recargado.periodoAcademico, '2026-1');
  });
}

module.exports = { definirSuiteDeContratoCasosComite, caso };
