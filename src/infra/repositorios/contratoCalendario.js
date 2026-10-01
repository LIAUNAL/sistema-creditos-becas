'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { CalendarioDesembolso, ErrorGeneracionCalendario } = require('../../desembolso/calendarioDesembolso');

// Suite de contrato del puerto de calendario de desembolso (Story 5.10).
// Se escribe una sola vez y se corre contra cada implementacion (memoria y SQLite), igual que
// contrato.js. `fabrica()` devuelve { repositorio, ciclo(fn), sembrar(...ids) }:
//   - `ciclo(fn)` corre `fn` como un caso de uso completo (en SQLite: unidad de trabajo nueva y
//     volcado al terminar), de modo que lo escrito en un ciclo se observa en los siguientes;
//   - `sembrar(...ids)` crea las solicitudes a las que apuntan las claves foraneas (no-op en memoria).

function desembolso(solicitudId, numeroCuota, cambios = {}) {
  return {
    id: `${solicitudId}-cuota-${numeroCuota}`,
    solicitudId,
    numeroCuota,
    fecha: `2026-12-${String(numeroCuota).padStart(2, '0')}`,
    monto: 300000.5,
    estado: 'programado',
    ...cambios,
  };
}

const COMPLETOS = { periodoAcademico: '2026-1', tipoCredito: 'credito' };
const ids = (lista) => lista.map((d) => d.id);

function definirSuiteDeContratoCalendario(nombre, fabrica) {
  const prueba = (descripcion, cuerpo) =>
    test(`[contrato calendario ${nombre}] ${descripcion}`, async () => cuerpo(fabrica()));

  prueba('guardar y obtenerPorSolicitud conservan fecha, monto, periodo y tipo de credito, en orden de cuota', async ({ repositorio, ciclo, sembrar }) => {
    sembrar('s1');
    const cuotas = [desembolso('s1', 2, COMPLETOS), desembolso('s1', 1, COMPLETOS)];
    await ciclo(() => repositorio.guardar('s1', cuotas));

    const leidos = await ciclo(() => repositorio.obtenerPorSolicitud('s1'));
    assert.deepStrictEqual(leidos, [desembolso('s1', 1, COMPLETOS), desembolso('s1', 2, COMPLETOS)]);
    assert.deepStrictEqual(await ciclo(() => repositorio.obtenerPorSolicitud('no-existe')), []);
  });

  prueba('los campos opcionales ausentes no aparecen en la forma devuelta', async ({ repositorio, ciclo, sembrar }) => {
    sembrar('s1');
    await ciclo(() => repositorio.guardar('s1', [desembolso('s1', 1)]));

    const [leido] = await ciclo(() => repositorio.obtenerPorSolicitud('s1'));
    assert.deepStrictEqual(leido, desembolso('s1', 1));
    assert.deepStrictEqual(Object.keys(leido).sort(), ['estado', 'fecha', 'id', 'monto', 'numeroCuota', 'solicitudId']);
  });

  prueba('las mutaciones de un desembolso obtenido se escriben al terminar el ciclo (write-back)', async ({ repositorio, ciclo, sembrar }) => {
    sembrar('s1');
    await ciclo(() => repositorio.guardar('s1', [desembolso('s1', 1, COMPLETOS), desembolso('s1', 2, COMPLETOS)]));
    await ciclo(() => {
      const [primero] = repositorio.obtenerPorSolicitud('s1');
      primero.estado = 'ejecutado';
      primero.fechaEjecucion = '2026-12-01';
    });

    const [primero, segundo] = await ciclo(() => repositorio.obtenerPorSolicitud('s1'));
    assert.deepStrictEqual(primero, desembolso('s1', 1, { ...COMPLETOS, estado: 'ejecutado', fechaEjecucion: '2026-12-01' }));
    assert.deepStrictEqual(segundo, desembolso('s1', 2, COMPLETOS));
  });

  prueba('dentro del mismo ciclo se lee lo guardado aun sin volcar', async ({ repositorio, ciclo, sembrar }) => {
    sembrar('s1');
    const dentro = await ciclo(() => {
      repositorio.guardar('s1', [desembolso('s1', 1)]);
      return ids(repositorio.obtenerPorSolicitud('s1'));
    });
    assert.deepStrictEqual(dentro, ['s1-cuota-1']);
  });

  prueba('listarTodos y listarPorEstado reflejan el estado actual y aislan por solicitud', async ({ repositorio, ciclo, sembrar }) => {
    sembrar('s1', 's2');
    await ciclo(() => {
      repositorio.guardar('s1', [desembolso('s1', 1), desembolso('s1', 2)]);
      repositorio.guardar('s2', [desembolso('s2', 1)]);
    });
    await ciclo(() => {
      repositorio.obtenerPorSolicitud('s1')[0].estado = 'vencido';
    });

    assert.deepStrictEqual(ids(await ciclo(() => repositorio.listarTodos())), ['s1-cuota-1', 's1-cuota-2', 's2-cuota-1']);
    assert.deepStrictEqual(ids(await ciclo(() => repositorio.listarPorEstado('programado'))), ['s1-cuota-2', 's2-cuota-1']);
    assert.deepStrictEqual(ids(await ciclo(() => repositorio.listarPorEstado('vencido'))), ['s1-cuota-1']);
    assert.deepStrictEqual(await ciclo(() => repositorio.listarPorEstado('ejecutado')), []);
    assert.deepStrictEqual(ids(await ciclo(() => repositorio.obtenerPorSolicitud('s2'))), ['s2-cuota-1']);
  });

  prueba('registrarError y listarErrores conservan el orden y la forma', async ({ repositorio, ciclo }) => {
    const primero = { solicitudId: 's1', codigo: 'MONTO_INVALIDO', mensaje: 'monto', registradoEn: '2026-05-04T12:30:00.000Z' };
    const segundo = { solicitudId: 's2', codigo: 'FECHA_INVALIDA', mensaje: 'fecha', registradoEn: '2026-05-04T12:31:00.000Z' };
    await ciclo(() => repositorio.registrarError(primero));
    await ciclo(() => repositorio.registrarError(segundo));

    assert.deepStrictEqual(await ciclo(() => repositorio.listarErrores()), [primero, segundo]);
  });

  prueba('CalendarioDesembolso sobre el repositorio: genera una vez, recarga igual y no duplica', async ({ repositorio, ciclo, sembrar }) => {
    sembrar('s1');
    const calendario = new CalendarioDesembolso({ repositorio });
    const solicitud = { id: 's1', estado: 'aprobada', monto: 1000, numeroCuotas: 3 };

    const generados = await ciclo(() => calendario.generar(solicitud, { fechaPrimeraCuota: '2026-12-31' }));
    assert.equal(generados.length, 3);
    const repetido = await ciclo(() => calendario.generar(solicitud, { fechaPrimeraCuota: '2027-01-15' }));

    assert.deepStrictEqual(ids(repetido), ids(generados));
    const recargados = await ciclo(() => calendario.obtenerPorSolicitud('s1'));
    assert.deepStrictEqual(recargados.map((d) => [d.numeroCuota, d.fecha, d.monto, d.estado]), [
      [1, '2026-12-31', 333.33, 'programado'],
      [2, '2027-01-31', 333.33, 'programado'],
      [3, '2027-02-28', 333.34, 'programado'],
    ]);
    assert.equal((await ciclo(() => repositorio.listarTodos())).length, 3);
  });

  prueba('CalendarioDesembolso con terminos invalidos registra el error y no crea desembolsos', async ({ repositorio, ciclo, sembrar }) => {
    sembrar('s1');
    const calendario = new CalendarioDesembolso({ repositorio, reloj: () => new Date('2026-05-04T12:30:00.000Z') });

    await ciclo(() => {
      assert.throws(
        () => calendario.generar({ id: 's1', estado: 'aprobada', monto: 0, numeroCuotas: 3 }, { fechaPrimeraCuota: '2026-12-01' }),
        (error) => error instanceof ErrorGeneracionCalendario && error.codigo === 'MONTO_INVALIDO',
      );
    });

    assert.deepStrictEqual(await ciclo(() => repositorio.listarTodos()), []);
    const [error, ...resto] = await ciclo(() => calendario.errores);
    assert.equal(resto.length, 0);
    assert.equal(error.solicitudId, 's1');
    assert.equal(error.codigo, 'MONTO_INVALIDO');
    assert.equal(error.registradoEn, '2026-05-04T12:30:00.000Z');
    assert.ok(error.mensaje.length > 0);
  });
}

module.exports = { definirSuiteDeContratoCalendario, desembolso };
