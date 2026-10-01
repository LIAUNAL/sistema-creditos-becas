'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { performance } = require('node:perf_hooks');
const { CLAVES, levantarAplicacion, clienteConSesion } = require('./ayudaPruebasWeb');
const { TIPOS_HISTORIAL } = require('../evaluacion-elegibilidad/revisionComite');

// Story 5.18 (P18, NFR-002): con 10.000 registros por tipo en el periodo, las pantallas clave responden en
// menos de 5 s por el camino completo HTTP -> casos de uso -> SQLite (base `:memory:`). La carga se inserta con SQL
// por lotes dentro de UNA transaccion (rapido); la lectura pasa por la aplicacion real, sin atajos.

const LIMITE_MS = 5000;
const PERIODO = '2026-1';
const TOTAL = 10_000;
const APROBADAS = 6000; // solicitudes aprobadas (cada una con 1 o 2 cuotas: 10.000 desembolsos en total)
const PENDIENTES = 3000; // solicitudes pendientes de revision sin asignar (cola del asesor)
const CUOTA_UNO = 125_000;
const CUOTA_DOS = 100_000;
const VENCIDOS = 1500;
const BECAS_AUTOMATICAS = 7000;
const BECAS_COMITE = 3000;
const CASOS_EN_REVISION = 3000; // cola del comite
const AVISOS_ESTUDIANTE = 10_000;

const ahora = '2026-05-04T12:30:00.000Z';

function sembrarVolumen(db, { estudianteId, comiteId }) {
  const datos = '{"ingresosHogar":1500000,"numeroDependientes":2,"estrato":3,"ocupacionAcudiente":"docente"}';
  const insertar = {
    solicitud: db.prepare('INSERT INTO solicitudes (id, estudiante_id, periodo_academico, estado, datos, creada_en) VALUES (?, ?, ?, ?, ?, ?)'),
    desembolso: db.prepare(
      `INSERT INTO desembolsos (id, solicitud_id, numero_cuota, fecha, monto, estado, fecha_ejecucion, periodo_academico, tipo_credito)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'credito')`,
    ),
    beca: db.prepare(
      `INSERT INTO scholarship_applications (id, estudiante_id, periodo_academico, promedio_acumulado, estrato, ingresos_hogar,
         clasificacion, puntaje, decision_automatica, campos_faltantes, creada_en, actualizada_en)
       VALUES (?, ?, ?, 3.5, 4, 3000000, ?, ?, ?, '[]', ?, ?)`,
    ),
    premio: db.prepare(
      'INSERT INTO scholarship_awards (id, application_id, estudiante_id, periodo_academico, origen, otorgada_en) VALUES (?, ?, ?, ?, ?, ?)',
    ),
    caso: db.prepare(
      'INSERT INTO casos_comite (id, estudiante_id, periodo_academico, puntaje, estado, historial, creada_en) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ),
    asignacion: db.prepare(
      "INSERT INTO asignaciones (tipo_recurso, recurso_id, usuario_id, rol, asignada_en) VALUES ('caso_comite', ?, ?, 'comite_becas', ?)",
    ),
    aviso: db.prepare(
      'INSERT INTO notifications (tipo, destinatario_tipo, destinatario_id, payload, creada_en) VALUES (?, ?, ?, ?, ?)',
    ),
  };

  db.exec('BEGIN');
  try {
    // Creditos: 6.000 aprobadas, 3.000 pendientes de revision y 1.000 rechazadas (10.000 solicitudes).
    for (let i = 0; i < TOTAL; i += 1) {
      const estado = i < APROBADAS ? 'aprobada' : i < APROBADAS + PENDIENTES ? 'pendiente_revision' : 'rechazada';
      insertar.solicitud.run(`sol-${i}`, `est-${i}`, PERIODO, estado, datos, ahora);
    }
    // Desembolsos: 10.000 (4.000 solicitudes con 2 cuotas y 2.000 con 1). Cuota 1 ejecutada; cuota 2 programada o vencida.
    for (let i = 0; i < APROBADAS; i += 1) {
      insertar.desembolso.run(`des-${i}-1`, `sol-${i}`, 1, '2026-05-01', CUOTA_UNO, 'ejecutado', '2026-05-04', PERIODO);
      if (i < 4000) {
        const vencido = i < VENCIDOS;
        insertar.desembolso.run(`des-${i}-2`, `sol-${i}`, 2, '2026-06-01', CUOTA_DOS, vencido ? 'vencido' : 'programado', null, PERIODO);
      }
    }
    // Becas: 10.000 otorgadas (7.000 automaticas, 3.000 por comite) y 3.000 casos limitrofes en revision.
    const totalBecas = BECAS_AUTOMATICAS + BECAS_COMITE + CASOS_EN_REVISION;
    for (let i = 0; i < totalBecas; i += 1) {
      const automatica = i < BECAS_AUTOMATICAS;
      const otorgada = i < BECAS_AUTOMATICAS + BECAS_COMITE;
      insertar.beca.run(`beca-${i}`, `est-${i}`, PERIODO, automatica ? 'elegible' : 'limitrofe', automatica ? 80 : 60, automatica ? 1 : 0, ahora, ahora);
      if (otorgada) insertar.premio.run(`premio-${i}`, `beca-${i}`, `est-${i}`, PERIODO, automatica ? 'automatica' : 'comite', ahora);
      if (!automatica) {
        const enRevision = !otorgada;
        const historial = JSON.stringify([{ tipo: TIPOS_HISTORIAL.INGRESO_COLA, fecha: ahora, puntaje: 60 }]);
        insertar.caso.run(`beca-${i}`, `est-${i}`, PERIODO, 60, enRevision ? 'en_revision_comite' : 'otorgada', historial, ahora);
        if (enRevision) {
          insertar.asignacion.run(`beca-${i}`, comiteId, ahora);
          insertar.aviso.run('caso_limitrofe', 'rol', 'comite_becas', JSON.stringify({ idCaso: `beca-${i}`, puntaje: 60 }), ahora);
        }
      }
    }
    // Avisos del estudiante de las pruebas (la bandeja muestra los 50 mas recientes).
    for (let i = 0; i < AVISOS_ESTUDIANTE; i += 1) {
      insertar.aviso.run('envio', 'estudiante', estudianteId, JSON.stringify({ solicitudId: `sol-${i}` }), ahora);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

describe('NFR-002: respuestas en menos de 5 s con 10.000 registros (Story 5.18)', () => {
  let app;
  let clientes;
  const mediciones = [];

  before(async () => {
    app = await levantarAplicacion();
    clientes = {
      estudiante: await clienteConSesion(app.base, 'estudiante', CLAVES.SEED_PASSWORD_ESTUDIANTE),
      asesor: await clienteConSesion(app.base, 'asesor_financiero', CLAVES.SEED_PASSWORD_ASESOR_FINANCIERO),
      comite: await clienteConSesion(app.base, 'comite_becas', CLAVES.SEED_PASSWORD_COMITE_BECAS),
      direccion: await clienteConSesion(app.base, 'direccion_academica', CLAVES.SEED_PASSWORD_DIRECCION_ACADEMICA),
    };
    const id = (nombre) => app.db.prepare('SELECT id FROM usuarios WHERE nombre_usuario = ?').get(nombre).id;
    const inicio = performance.now();
    sembrarVolumen(app.db, { estudianteId: String(id('estudiante')), comiteId: id('comite_becas') });
    mediciones.push(`siembra de la carga: ${Math.round(performance.now() - inicio)} ms`);
  });

  after(async () => {
    await app.cerrar();
  });

  // Mide la respuesta completa (incluido el cuerpo) y la registra para el informe.
  async function medir(nombre, cliente, ruta, estadoEsperado = 200) {
    const inicio = performance.now();
    const respuesta = await cliente.get(ruta);
    const ms = Math.round(performance.now() - inicio);
    mediciones.push(`${nombre}: ${ms} ms (${Math.round(respuesta.texto.length / 1024)} KiB)`);
    assert.strictEqual(respuesta.estado, estadoEsperado, `${nombre}: estado`);
    assert.ok(ms < LIMITE_MS, `${nombre} tardó ${ms} ms (límite ${LIMITE_MS} ms)`);
    return respuesta;
  }

  it('la carga sembrada tiene el volumen esperado', () => {
    const cuenta = (sql) => app.db.prepare(sql).get().n;
    assert.strictEqual(cuenta('SELECT COUNT(*) AS n FROM solicitudes'), TOTAL);
    assert.strictEqual(cuenta('SELECT COUNT(*) AS n FROM desembolsos'), TOTAL);
    assert.strictEqual(cuenta('SELECT COUNT(*) AS n FROM scholarship_awards'), TOTAL);
    assert.strictEqual(cuenta('SELECT COUNT(*) AS n FROM scholarship_applications'), TOTAL + CASOS_EN_REVISION);
  });

  it('reporte consolidado de direccion (JSON y pagina): totales correctos en menos de 5 s', async () => {
    const api = await medir('reporte consolidado JSON', clientes.direccion, `/api/reportes/consolidado?periodo=${PERIODO}`);
    const reporte = JSON.parse(api.texto);
    assert.strictEqual(reporte.periodoAcademico, PERIODO);
    assert.strictEqual(reporte.totalCreditosAprobados, APROBADAS);
    assert.strictEqual(reporte.totalBecasOtorgadas, TOTAL);
    assert.strictEqual(reporte.becasAutomaticas, BECAS_AUTOMATICAS);
    assert.strictEqual(reporte.becasComite, BECAS_COMITE);
    assert.strictEqual(reporte.montoTotalDesembolsado, APROBADAS * CUOTA_UNO);
    // 1.500 vencidos de 10.000 desembolsos del periodo: 15 % > 10 % por defecto.
    assert.strictEqual(reporte.mora.tasaMora, VENCIDOS / TOTAL);
    assert.strictEqual(reporte.mora.alerta, true);

    const pagina = await medir('reporte consolidado pagina', clientes.direccion, `/direccion/reportes?periodo=${PERIODO}`);
    assert.match(pagina.texto, /Créditos aprobados<\/dt><dd>6000</);
    assert.match(pagina.texto, /Becas otorgadas<\/dt><dd>10000</);
    assert.match(pagina.texto, /Monto total desembolsado<\/dt><dd>\$750\.000\.000</);
    assert.match(pagina.texto, /Alerta de mora en el periodo 2026-1/);
    await medir('aterrizaje de direccion (mora por periodo)', clientes.direccion, '/direccion');
  });

  it('cola del asesor con 3.000 solicitudes pendientes: menos de 5 s', async () => {
    const pagina = await medir('cola del asesor', clientes.asesor, '/asesor/cola');
    assert.ok(pagina.texto.includes('sol-6000'), 'la cola muestra solicitudes pendientes');
  });

  it('cola del comite con 3.000 casos en revision: menos de 5 s (pagina y API)', async () => {
    const pagina = await medir('cola del comite pagina', clientes.comite, '/comite');
    assert.ok(pagina.texto.includes('beca-10000'), 'la cola muestra los casos en revision');
    const api = await medir('cola del comite JSON', clientes.comite, '/api/comite/cola');
    assert.strictEqual(JSON.parse(api.texto).length, CASOS_EN_REVISION);
  });

  it('bandeja de avisos con 10.000 avisos del estudiante y 3.000 del comite: menos de 5 s', async () => {
    const estudiante = await medir('avisos del estudiante', clientes.estudiante, '/avisos');
    assert.match(estudiante.texto, /Su solicitud de crédito fue enviada a revisión\./);
    await medir('avisos del comite', clientes.comite, '/avisos');
    // El contador de la navegacion se calcula en cada pagina del usuario: tambien debe ser rapido.
    await medir('listado del estudiante (con contador de avisos)', clientes.estudiante, '/solicitudes');
  });

  it('informe de tiempos', (t) => {
    for (const linea of mediciones) t.diagnostic(linea);
    assert.ok(mediciones.length > 5);
  });
});
