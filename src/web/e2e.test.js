'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { CLAVES, DATOS_FORMULARIO, DOCUMENTOS, levantarAplicacion, clienteConSesion } = require('./ayudaPruebasWeb');

// Story 5.18 (P18): pruebas de humo de punta a punta. Todo ocurre por HTTP contra el servidor real con una
// base limpia (SQLite en memoria): solo se leen datos del estado de la aplicacion a traves de sus paginas y
// de su API, nunca se escribe en la base desde la prueba.

const PERIODO = '2026-1';

const entrar = (app) => ({
  estudiante: () => clienteConSesion(app.base, 'estudiante', CLAVES.SEED_PASSWORD_ESTUDIANTE),
  asesor: () => clienteConSesion(app.base, 'asesor_financiero', CLAVES.SEED_PASSWORD_ASESOR_FINANCIERO),
  comite: () => clienteConSesion(app.base, 'comite_becas', CLAVES.SEED_PASSWORD_COMITE_BECAS),
  direccion: () => clienteConSesion(app.base, 'direccion_academica', CLAVES.SEED_PASSWORD_DIRECCION_ACADEMICA),
});

const json = (respuesta) => JSON.parse(respuesta.texto);

test('Scenario: un credito pasa de solicitud a desembolso ejecutado, y el estudiante, direccion y los avisos lo reflejan', async (t) => {
  const app = await levantarAplicacion();
  t.after(app.cerrar);
  const roles = entrar(app);
  const estudiante = await roles.estudiante();
  const asesor = await roles.asesor();
  const direccion = await roles.direccion();

  // El estudiante registra la solicitud, adjunta los tres documentos y la envia a revision.
  const registro = await estudiante.post('/solicitudes', DATOS_FORMULARIO);
  assert.strictEqual(registro.estado, 303);
  const id = /^\/solicitudes\/([^/]+)$/.exec(registro.ubicacion)[1];
  for (const documento of DOCUMENTOS) {
    assert.strictEqual((await estudiante.post(`/solicitudes/${id}/documentos`, documento)).estado, 303);
  }
  assert.strictEqual((await estudiante.post(`/solicitudes/${id}/enviar`)).estado, 303);

  // El asesor la ve en su cola, la reclama y la aprueba con terminos.
  assert.ok((await asesor.get('/asesor/cola')).texto.includes(id), 'la solicitud enviada aparece en la cola del asesor');
  assert.strictEqual((await asesor.post(`/asesor/solicitudes/${id}/reclamar`)).estado, 303);
  const aprobacion = await asesor.post(`/asesor/solicitudes/${id}/aprobar`, {
    monto: '1200000',
    numeroCuotas: '3',
    fechaPrimeraCuota: '2026-12-01',
  });
  assert.strictEqual(aprobacion.estado, 303);

  // El estudiante ve la solicitud aprobada con su calendario programado.
  const antes = (await estudiante.get(`/solicitudes/${id}`)).texto;
  assert.match(antes, /Aprobada/);
  assert.match(antes, /Programado/);
  assert.doesNotMatch(antes, /Ejecutado/);

  // El asesor ejecuta la primera cuota (la fila del calendario sale de la pagina de detalle del propio asesor).
  const detalle = (await asesor.get(`/asesor/solicitudes/${id}`)).texto;
  const rutaEjecutar = /action="(\/asesor\/desembolsos\/[^/"]+\/ejecutar)"/.exec(detalle);
  assert.ok(rutaEjecutar, 'el detalle ofrece la accion de ejecutar la primera cuota');
  const ejecucion = await asesor.post(rutaEjecutar[1]);
  assert.strictEqual(ejecucion.estado, 303);
  assert.strictEqual(ejecucion.ubicacion, `/asesor/solicitudes/${id}`);

  // El estudiante ve la cuota ejecutada.
  const despues = (await estudiante.get(`/solicitudes/${id}`)).texto;
  assert.match(despues, /Ejecutado/);

  // Direccion: el reporte (pagina y JSON) cuenta el credito y el monto desembolsado (la primera cuota: 400.000).
  const reporte = json(await direccion.get(`/api/reportes/consolidado?periodo=${PERIODO}`));
  assert.strictEqual(reporte.totalCreditosAprobados, 1);
  assert.strictEqual(reporte.montoTotalDesembolsado, 400000);
  const pagina = (await direccion.get(`/direccion/reportes?periodo=${PERIODO}`)).texto;
  assert.match(pagina, /Monto total desembolsado<\/dt><dd>\$400\.000</);

  // Avisos del estudiante: envio, aprobacion y desembolso.
  const avisos = (await estudiante.get('/avisos')).texto;
  assert.match(avisos, /Su solicitud de crédito fue enviada a revisión\./);
  assert.match(avisos, /Su solicitud de crédito fue aprobada\./);
  assert.match(avisos, /Se ejecutó la cuota 1 de su crédito por \$400\.000/);
});

test('Scenario: una beca limitrofe llega al comite, se otorga y direccion la cuenta en el reporte', async (t) => {
  const app = await levantarAplicacion();
  t.after(app.cerrar);
  const roles = entrar(app);
  const estudiante = await roles.estudiante();
  const comite = await roles.comite();
  const direccion = await roles.direccion();

  // Promedio 3.5, estrato 4, ingresos 3.000.000: puntaje limitrofe (entre 50 y 70), sin decision automatica.
  const solicitud = await estudiante.post('/becas', {
    periodoAcademico: PERIODO,
    promedioAcumulado: '3.5',
    estrato: '4',
    ingresosHogar: '3000000',
  });
  assert.strictEqual(solicitud.estado, 303);
  const id = /^\/becas\/([^/]+)$/.exec(solicitud.ubicacion)[1];
  assert.match((await estudiante.get(`/becas/${id}`)).texto, /comité/i, 'el estudiante ve que su caso lo revisa el comité');

  // Aun sin decision: la beca no cuenta.
  const sinDecision = json(await direccion.get(`/api/reportes/consolidado?periodo=${PERIODO}`));
  assert.strictEqual(sinDecision.totalBecasOtorgadas, 0);

  // El comite ve el caso en su cola, lo abre y decide otorgar.
  const cola = json(await comite.get('/api/comite/cola'));
  assert.deepStrictEqual(cola.map((caso) => caso.id), [id]);
  assert.strictEqual((await comite.get(`/comite/casos/${id}`)).estado, 200);
  const decision = await comite.post(`/comite/casos/${id}/decision`, {
    decision: 'otorgada',
    comentario: 'Cumple el perfil socioeconómico',
  });
  assert.strictEqual(decision.estado, 303);
  assert.deepStrictEqual(json(await comite.get('/api/comite/cola')), [], 'el caso decidido sale de la cola');

  // El estudiante ve el resultado y direccion cuenta una beca otorgada por el comite.
  const estado = (await estudiante.get(`/becas/${id}`)).texto;
  assert.match(estado, /El comité de becas otorgó la beca\./);
  assert.match(estado, /Cumple el perfil socioeconómico/);
  const reporte = json(await direccion.get(`/api/reportes/consolidado?periodo=${PERIODO}`));
  assert.strictEqual(reporte.totalBecasOtorgadas, 1);
  assert.strictEqual(reporte.becasComite, 1);
  assert.strictEqual(reporte.becasAutomaticas, 0);
  const pagina = (await direccion.get(`/direccion/reportes?periodo=${PERIODO}`)).texto;
  assert.match(pagina, /Becas otorgadas<\/dt><dd>1</);
});
