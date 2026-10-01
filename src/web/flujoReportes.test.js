'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  CLAVES,
  levantarAplicacion,
  crearUsuario,
  clienteConSesion,
  crearCliente,
  crearSolicitudEnviada,
} = require('./ayudaPruebasWeb');

// Story 5.17 (P17): reporte consolidado, alerta de mora y umbral por periodo para direccion academica.
// Servidor real en puerto efimero y SQLite en memoria. Los datos se crean por los flujos reales cuando es
// barato (solicitudes aprobadas, desembolsos, premios automatico y del comite) y por SQL cuando se necesita
// control fino o volumen.

async function entorno(t, opciones = {}) {
  const app = await levantarAplicacion(opciones);
  t.after(app.cerrar);
  return app;
}

const estudiante = (app) => clienteConSesion(app.base, 'estudiante', CLAVES.SEED_PASSWORD_ESTUDIANTE);
const asesor = (app) => clienteConSesion(app.base, 'asesor_financiero', CLAVES.SEED_PASSWORD_ASESOR_FINANCIERO);
const comite = (app) => clienteConSesion(app.base, 'comite_becas', CLAVES.SEED_PASSWORD_COMITE_BECAS);
const direccion = (app) =>
  clienteConSesion(app.base, 'direccion_academica', CLAVES.SEED_PASSWORD_DIRECCION_ACADEMICA);

const RUTA = '/direccion/reportes';
const RUTA_UMBRAL = '/direccion/reportes/umbral';
const API = '/api/reportes/consolidado';
const json = (respuesta) => JSON.parse(respuesta.texto);

const ELEGIBLE = Object.freeze({ periodoAcademico: '2026-1', promedioAcumulado: '4.5', estrato: '2', ingresosHogar: '1500000' });
const LIMITROFE = Object.freeze({ periodoAcademico: '2026-1', promedioAcumulado: '3.5', estrato: '4', ingresosHogar: '3000000' });
const TERMINOS = Object.freeze({ monto: '1200000', numeroCuotas: '3', fechaPrimeraCuota: '2026-03-01' });

// ---------------------------------------------------------------- Ayudas de datos por SQL

let contador = 0;
const siguiente = () => {
  contador += 1;
  return contador;
};

function sembrarSolicitud(db, { id = `sol-${siguiente()}`, periodo = '2026-1', estado = 'aprobada', estudianteId = 'est-ayuda', datos = '{}' } = {}) {
  db.prepare(
    'INSERT INTO solicitudes (id, estudiante_id, periodo_academico, estado, datos, creada_en) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, estudianteId, periodo, estado, datos, '2026-01-01T00:00:00.000Z');
  return id;
}

function sembrarDesembolso(db, { solicitudId, numero = siguiente(), estado, periodo = '2026-1', monto = 100000 }) {
  const id = `des-${siguiente()}`;
  db.prepare(
    `INSERT INTO desembolsos (id, solicitud_id, numero_cuota, fecha, monto, estado, fecha_ejecucion, periodo_academico, tipo_credito)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'credito')`,
  ).run(id, solicitudId, numero, '2026-02-01', monto, estado, periodo);
  return id;
}

// Una solicitud con una cuota por cada estado indicado (todas del mismo periodo).
function sembrarCuotas(db, estados, periodo = '2026-1', montoCuota = 100000) {
  const solicitudId = sembrarSolicitud(db, { periodo });
  estados.forEach((estado, indice) =>
    sembrarDesembolso(db, { solicitudId, numero: indice + 1, estado, periodo, monto: montoCuota }),
  );
  return solicitudId;
}

function sembrarPremio(db, { periodo = '2026-1', origen = 'automatica' } = {}) {
  const id = `beca-${siguiente()}`;
  db.prepare(
    `INSERT INTO scholarship_applications (id, estudiante_id, periodo_academico, clasificacion, decision_automatica, creada_en, actualizada_en)
     VALUES (?, ?, ?, 'elegible', 1, ?, ?)`,
  ).run(id, `est-${id}`, periodo, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
  db.prepare(
    'INSERT INTO scholarship_awards (id, application_id, estudiante_id, periodo_academico, origen, otorgada_en) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(`premio-${id}`, id, `est-${id}`, periodo, origen, '2026-01-02T00:00:00.000Z');
}

const configurarUmbral = (db, periodo, umbral) =>
  db.prepare("INSERT INTO configuracion_mora (periodo_academico, umbral, actualizada_en, actualizada_por) VALUES (?, ?, '2026-01-01T00:00:00.000Z', 'prueba')").run(periodo, umbral);

// Valor de un par `<dt>etiqueta</dt><dd>valor</dd>` de la pagina.
function dato(texto, etiqueta) {
  const coincidencia = new RegExp(`<dt>${etiqueta}</dt>\\s*<dd>(.*?)</dd>`, 's').exec(texto);
  assert.ok(coincidencia, `no aparece el dato "${etiqueta}"`);
  return coincidencia[1].replace(/<[^>]+>/g, '').trim();
}

const bannerDeAlerta = (texto) => /<div id="alerta-mora"[^>]*>[\s\S]*?<\/div>/.exec(texto)?.[0] ?? null;
const auditorias = (db) => db.prepare("SELECT * FROM audit_log WHERE accion = 'configurar_umbral_mora' ORDER BY id").all();
const filasUmbral = (db) => db.prepare('SELECT * FROM configuracion_mora ORDER BY periodo_academico').all();

// Solicitud enviada, reclamada y aprobada por el asesor (genera su calendario de desembolsos).
async function solicitudAprobada(app, datos = {}, terminos = TERMINOS) {
  const alumno = await estudiante(app);
  const id = await crearSolicitudEnviada(alumno, datos);
  const cliente = await asesor(app);
  await cliente.post(`/asesor/solicitudes/${id}/reclamar`);
  const aprobacion = await cliente.post(`/asesor/solicitudes/${id}/aprobar`, terminos);
  assert.strictEqual(aprobacion.estado, 303);
  return id;
}

// ---------------------------------------------------------------- Scenarios de la spec

test('Scenario: dirección académica abre el reporte y el total de becas cuenta ambos orígenes leyendo scholarship_awards', async (t) => {
  const app = await entorno(t);
  await crearUsuario(app.db, 'estudiante2', 'estudiante', 'clave-estudiante-2');
  await solicitudAprobada(app);
  // Beca automatica (perfil elegible) del estudiante 1 y beca del comite (perfil limitrofe) del estudiante 2.
  const alumno = await estudiante(app);
  assert.strictEqual((await alumno.post('/becas', ELEGIBLE)).estado, 303);
  const alumno2 = await clienteConSesion(app.base, 'estudiante2', 'clave-estudiante-2');
  const presentada = await alumno2.post('/becas', LIMITROFE);
  const idCaso = /^\/becas\/([^/]+)$/.exec(presentada.ubicacion)[1];
  const decision = await (await comite(app)).post(`/comite/casos/${idCaso}/decision`, { decision: 'otorgada', comentario: 'Cumple el perfil' });
  assert.strictEqual(decision.estado, 303);

  const origenes = app.db.prepare('SELECT origen FROM scholarship_awards ORDER BY origen').all().map((f) => f.origen);
  assert.deepStrictEqual(origenes, ['automatica', 'comite']);

  const pagina = await (await direccion(app)).get(`${RUTA}?periodo=2026-1`);

  assert.strictEqual(pagina.estado, 200, pagina.texto);
  assert.strictEqual(dato(pagina.texto, 'Créditos aprobados'), '1');
  assert.strictEqual(dato(pagina.texto, 'Becas otorgadas'), '2');
  assert.strictEqual(dato(pagina.texto, 'Becas automáticas'), '1');
  assert.strictEqual(dato(pagina.texto, 'Becas por comité'), '1');
  assert.strictEqual(dato(pagina.texto, 'Monto total desembolsado'), '$0');
  for (const prohibido of ['estrato', 'ingresos', 'promedio', 'puntaje']) {
    assert.ok(!pagina.texto.toLowerCase().includes(prohibido), `aparece ${prohibido}`);
  }
});

test('Scenario: un periodo sin registros muestra todos los totales en cero, sin error', async (t) => {
  const app = await entorno(t);

  const pagina = await (await direccion(app)).get(`${RUTA}?periodo=2030-9`);

  assert.strictEqual(pagina.estado, 200, pagina.texto);
  assert.strictEqual(dato(pagina.texto, 'Créditos aprobados'), '0');
  assert.strictEqual(dato(pagina.texto, 'Becas otorgadas'), '0');
  assert.strictEqual(dato(pagina.texto, 'Becas automáticas'), '0');
  assert.strictEqual(dato(pagina.texto, 'Becas por comité'), '0');
  assert.strictEqual(dato(pagina.texto, 'Monto total desembolsado'), '$0');
  assert.ok(pagina.texto.includes('Sin alerta de mora para este periodo'));
  assert.strictEqual(bannerDeAlerta(pagina.texto), null);
});

test('Scenario: con un umbral configurado por periodo y una tasa de mora superior se muestra la alerta con periodo, tasa y umbral', async (t) => {
  const app = await entorno(t);
  sembrarCuotas(app.db, ['ejecutado', 'vencido', 'vencido']);
  const cliente = await direccion(app);
  const guardado = await cliente.post(RUTA_UMBRAL, { periodo: '2026-1', umbral: '0.5' });
  assert.strictEqual(guardado.estado, 303);
  assert.strictEqual(guardado.ubicacion, `${RUTA}?periodo=2026-1`);

  const pagina = await cliente.get(`${RUTA}?periodo=2026-1`);

  assert.strictEqual(pagina.estado, 200);
  const banner = bannerDeAlerta(pagina.texto);
  assert.ok(banner, 'falta el banner de alerta');
  assert.ok(banner.includes('role="alert"'));
  assert.ok(banner.includes('2026-1'));
  assert.ok(banner.includes('66,7 %'));
  assert.ok(banner.includes('50 %'));
  assert.ok(!pagina.texto.includes('Sin alerta de mora para este periodo'));
});

test('Scenario: con una tasa de mora por debajo del umbral no se muestra alerta', async (t) => {
  const app = await entorno(t);
  sembrarCuotas(app.db, ['ejecutado', 'ejecutado', 'ejecutado', 'ejecutado', 'ejecutado', 'ejecutado', 'ejecutado', 'ejecutado', 'ejecutado', 'ejecutado', 'programado', 'vencido']); // 1/12 = 8,3 %

  const pagina = await (await direccion(app)).get(`${RUTA}?periodo=2026-1`);

  assert.strictEqual(pagina.estado, 200);
  assert.strictEqual(bannerDeAlerta(pagina.texto), null);
  assert.ok(pagina.texto.includes('Sin alerta de mora para este periodo'));
  assert.strictEqual(dato(pagina.texto, 'Tasa de mora calculada'), '8,3 %');
});

test('Scenario: un usuario que no es de dirección académica recibe 403 en el reporte, el umbral y el JSON', async (t) => {
  const app = await entorno(t);
  for (const abrir of [estudiante, comite, asesor]) {
    const cliente = await abrir(app);
    assert.strictEqual((await cliente.get(RUTA)).estado, 403);
    assert.strictEqual((await cliente.get(`${API}?periodo=2026-1`)).estado, 403);
    assert.strictEqual((await cliente.post(RUTA_UMBRAL, { periodo: '2026-1', umbral: '0.5' })).estado, 403);
  }
  assert.deepStrictEqual(filasUmbral(app.db), []);
});

// ---------------------------------------------------------------- Reglas adicionales

test('un usuario sin sesión es redirigido a /login en la pagina y recibe 401 en el JSON', async (t) => {
  const app = await entorno(t);
  const anonimo = crearCliente(app.base);

  const pagina = await anonimo.get(RUTA);
  assert.strictEqual(pagina.estado, 303);
  assert.strictEqual(pagina.ubicacion, '/login');
  assert.strictEqual((await anonimo.get(`${API}?periodo=2026-1`)).estado, 401);
});

test('una tasa exactamente igual al umbral no muestra alerta (estrictamente mayor)', async (t) => {
  const app = await entorno(t);
  sembrarCuotas(app.db, ['ejecutado', 'ejecutado', 'ejecutado', 'vencido']); // 1/4 = 0,25
  configurarUmbral(app.db, '2026-1', 0.25);
  const cliente = await direccion(app);

  const igual = await cliente.get(`${RUTA}?periodo=2026-1`);
  assert.strictEqual(bannerDeAlerta(igual.texto), null);
  assert.strictEqual(dato(igual.texto, 'Tasa de mora calculada'), '25 %');

  configurarUmbral(app.db, '2026-2', 0.2);
  sembrarCuotas(app.db, ['ejecutado', 'ejecutado', 'ejecutado', 'vencido'], '2026-2');
  assert.ok(bannerDeAlerta((await cliente.get(`${RUTA}?periodo=2026-2`)).texto), 'un umbral menor si alerta');
});

test('el umbral configurado del periodo prevalece sobre el por defecto y los demás periodos usan el por defecto', async (t) => {
  const app = await entorno(t);
  sembrarCuotas(app.db, ['ejecutado', 'ejecutado', 'ejecutado', 'vencido'], '2026-1'); // 25 %
  sembrarCuotas(app.db, ['ejecutado', 'ejecutado', 'ejecutado', 'vencido'], '2026-2'); // 25 %
  configurarUmbral(app.db, '2026-1', 0.5);
  const cliente = await direccion(app);

  const configurado = await cliente.get(`${RUTA}?periodo=2026-1`);
  assert.strictEqual(bannerDeAlerta(configurado.texto), null);
  assert.strictEqual(dato(configurado.texto, 'Umbral de mora vigente'), '50 %');

  const porDefecto = await cliente.get(`${RUTA}?periodo=2026-2`);
  assert.ok(bannerDeAlerta(porDefecto.texto), 'el 25 % supera el 10 % por defecto');
  assert.strictEqual(dato(porDefecto.texto, 'Umbral de mora vigente'), '10 %');
});

test('el umbral por defecto es configurable por entorno y el del periodo lo supera', async (t) => {
  const app = await entorno(t, { umbralMoraDefecto: 0.3 });
  sembrarCuotas(app.db, ['ejecutado', 'ejecutado', 'ejecutado', 'vencido'], '2026-1'); // 25 %
  sembrarCuotas(app.db, ['ejecutado', 'vencido'], '2026-2'); // 50 %
  const cliente = await direccion(app);

  const bajo = await cliente.get(`${RUTA}?periodo=2026-1`);
  assert.strictEqual(bannerDeAlerta(bajo.texto), null);
  assert.strictEqual(dato(bajo.texto, 'Umbral de mora vigente'), '30 %');
  assert.ok(bannerDeAlerta((await cliente.get(`${RUTA}?periodo=2026-2`)).texto));

  configurarUmbral(app.db, '2026-2', 0.9);
  assert.strictEqual(bannerDeAlerta((await cliente.get(`${RUTA}?periodo=2026-2`)).texto), null);
});

test('guardar el umbral lo persiste con auditoria atómica (umbral anterior y nuevo) y vuelve al mismo periodo', async (t) => {
  const app = await entorno(t);
  const cliente = await direccion(app);

  const primero = await cliente.post(RUTA_UMBRAL, { periodo: '2026-1', umbral: '0.25' });
  assert.strictEqual(primero.estado, 303);
  const segundo = await cliente.post(RUTA_UMBRAL, { periodo: '2026-1', umbral: '0,4' });
  assert.strictEqual(segundo.estado, 303);

  const filas = filasUmbral(app.db);
  assert.strictEqual(filas.length, 1);
  assert.strictEqual(filas[0].periodo_academico, '2026-1');
  assert.strictEqual(filas[0].umbral, 0.4);
  assert.strictEqual(filas[0].actualizada_por, 'direccion_academica');
  assert.strictEqual(filas[0].actualizada_en, '2026-05-04T12:30:00.000Z');
  const entradas = auditorias(app.db);
  assert.strictEqual(entradas.length, 2);
  assert.deepStrictEqual(
    entradas.map((e) => [e.actor, e.rol, e.objetivo, JSON.parse(e.detalle)]),
    [
      ['direccion_academica', 'direccion_academica', 'periodo:2026-1', { periodoAcademico: '2026-1', umbralAnterior: 0.1, umbralNuevo: 0.25 }],
      ['direccion_academica', 'direccion_academica', 'periodo:2026-1', { periodoAcademico: '2026-1', umbralAnterior: 0.25, umbralNuevo: 0.4 }],
    ],
  );
});

test('un umbral invalido (cero, negativo, mayor que 1, texto o vacio) responde 400 con resumen de errores y no guarda nada', async (t) => {
  const app = await entorno(t);
  const cliente = await direccion(app);

  for (const umbral of ['0', '-0.2', '1.5', 'abc', '', '0.1.2', '1e-1']) {
    const respuesta = await cliente.post(RUTA_UMBRAL, { periodo: '2026-1', umbral });
    assert.strictEqual(respuesta.estado, 400, `umbral ${JSON.stringify(umbral)}`);
    assert.ok(respuesta.texto.includes('role="alert"'));
    assert.ok(respuesta.texto.includes('href="#umbral"'));
    assert.ok(respuesta.texto.includes('<h1>'));
  }
  const sinPeriodo = await cliente.post(RUTA_UMBRAL, { periodo: '  ', umbral: '0.2' });
  assert.strictEqual(sinPeriodo.estado, 400);
  assert.deepStrictEqual(filasUmbral(app.db), []);
  assert.deepStrictEqual(auditorias(app.db), []);
});

test('el umbral 1 es valido (nunca alerta) y el 0,05 tambien', async (t) => {
  const app = await entorno(t);
  const cliente = await direccion(app);
  assert.strictEqual((await cliente.post(RUTA_UMBRAL, { periodo: '2026-1', umbral: '1' })).estado, 303);
  assert.strictEqual((await cliente.post(RUTA_UMBRAL, { periodo: '2026-2', umbral: '0.05' })).estado, 303);
  assert.deepStrictEqual(filasUmbral(app.db).map((f) => [f.periodo_academico, f.umbral]), [['2026-1', 1], ['2026-2', 0.05]]);
});

test('guardar el umbral sin token CSRF se rechaza y no guarda nada', async (t) => {
  const app = await entorno(t);
  const cliente = await direccion(app);

  const respuesta = await cliente.post(RUTA_UMBRAL, { periodo: '2026-1', umbral: '0.5' }, { conToken: false });

  assert.strictEqual(respuesta.estado, 403);
  assert.deepStrictEqual(filasUmbral(app.db), []);
  assert.deepStrictEqual(auditorias(app.db), []);
});

test('la pagina trae un formulario de umbral con CSRF, etiqueta asociada y el periodo consultado', async (t) => {
  const app = await entorno(t);

  const pagina = await (await direccion(app)).get(`${RUTA}?periodo=2026-1`);

  assert.ok(pagina.texto.includes(`action="${RUTA_UMBRAL}"`));
  assert.ok(/<form method="post" action="\/direccion\/reportes\/umbral">\s*<input type="hidden" name="_csrf" value="[^"]+">/.test(pagina.texto));
  assert.ok(pagina.texto.includes('<label for="umbral">'));
  assert.ok(pagina.texto.includes('name="periodo" value="2026-1"'));
  assert.ok(!/<script/i.test(pagina.texto));
  assert.ok(!/ style=/i.test(pagina.texto));
});

test('el periodo por defecto es el más reciente y el selector lista los periodos con datos', async (t) => {
  const app = await entorno(t);
  sembrarSolicitud(app.db, { periodo: '2025-2' });
  sembrarSolicitud(app.db, { periodo: '2026-2' });
  sembrarPremio(app.db, { periodo: '2026-1' });
  sembrarCuotas(app.db, ['programado'], '2025-1');
  const cliente = await direccion(app);

  const pagina = await cliente.get(RUTA);

  assert.strictEqual(pagina.estado, 200);
  assert.ok(pagina.texto.includes('<h1>Reportes de dirección académica</h1>'));
  assert.strictEqual(dato(pagina.texto, 'Periodo académico'), '2026-2');
  const opciones = [...pagina.texto.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(opciones, ['2026-2', '2026-1', '2025-2', '2025-1']);
});

test('sin ningún dato la pagina responde sin error e invita a consultar un periodo', async (t) => {
  const app = await entorno(t);

  const pagina = await (await direccion(app)).get(RUTA);

  assert.strictEqual(pagina.estado, 200, pagina.texto);
  assert.ok(pagina.texto.includes('Aún no hay periodos con datos'));
});

test('el total de becas distingue visiblemente las automáticas de las del comité y conserva el total del módulo', async (t) => {
  const app = await entorno(t);
  for (let i = 0; i < 3; i += 1) sembrarPremio(app.db, { origen: 'automatica' });
  for (let i = 0; i < 2; i += 1) sembrarPremio(app.db, { origen: 'comite' });
  sembrarPremio(app.db, { origen: 'comite', periodo: '2026-2' });

  const pagina = await (await direccion(app)).get(`${RUTA}?periodo=2026-1`);

  assert.strictEqual(dato(pagina.texto, 'Becas otorgadas'), '5');
  assert.strictEqual(dato(pagina.texto, 'Becas automáticas'), '3');
  assert.strictEqual(dato(pagina.texto, 'Becas por comité'), '2');
});

test('los créditos y el monto desembolsado son solo del periodo consultado y el monto usa formato de pesos', async (t) => {
  const app = await entorno(t);
  sembrarCuotas(app.db, ['ejecutado', 'ejecutado', 'programado', 'vencido'], '2026-1', 1200000);
  sembrarCuotas(app.db, ['ejecutado'], '2026-2', 999);
  sembrarSolicitud(app.db, { periodo: '2026-1', estado: 'rechazada' });
  sembrarSolicitud(app.db, { periodo: '2026-1', estado: 'en_revision' });

  const pagina = await (await direccion(app)).get(`${RUTA}?periodo=2026-1`);

  assert.strictEqual(dato(pagina.texto, 'Créditos aprobados'), '1');
  assert.strictEqual(dato(pagina.texto, 'Monto total desembolsado'), '$2.400.000');
});

test('los desembolsos sin periodo se excluyen de la tasa y se cuentan en un diagnóstico', async (t) => {
  const app = await entorno(t);
  const solicitudId = sembrarCuotas(app.db, ['ejecutado', 'ejecutado', 'ejecutado', 'vencido']); // 25 %
  for (let n = 10; n < 16; n += 1) {
    sembrarDesembolso(app.db, { solicitudId, numero: n, estado: 'vencido', periodo: null });
  }
  const cliente = await direccion(app);

  const pagina = await cliente.get(`${RUTA}?periodo=2026-1`);

  assert.strictEqual(dato(pagina.texto, 'Tasa de mora calculada'), '25 %');
  assert.ok(pagina.texto.includes('6 desembolsos sin periodo académico no se incluyen en la tasa de mora'));
  const api = json(await cliente.get(`${API}?periodo=2026-1`));
  assert.strictEqual(api.mora.sinPeriodo, 6);
  assert.strictEqual(api.mora.tasaMora, 0.25);
});

test('sin desembolsos sin periodo no aparece el diagnóstico', async (t) => {
  const app = await entorno(t);
  sembrarCuotas(app.db, ['ejecutado']);

  const pagina = await (await direccion(app)).get(`${RUTA}?periodo=2026-1`);

  assert.ok(!pagina.texto.includes('sin periodo académico'));
});

test('el parámetro periodo se escapa y un periodo demasiado largo responde 400', async (t) => {
  const app = await entorno(t);
  const cliente = await direccion(app);
  const hostil = '"><b>x</b>';

  const pagina = await cliente.get(`${RUTA}?periodo=${encodeURIComponent(hostil)}`);

  assert.strictEqual(pagina.estado, 200);
  assert.ok(!pagina.texto.includes(hostil));
  assert.ok(pagina.texto.includes('&quot;&gt;&lt;b&gt;x&lt;/b&gt;'));
  const largo = await cliente.get(`${RUTA}?periodo=${'9'.repeat(40)}`);
  assert.strictEqual(largo.estado, 400);
  assert.ok(!largo.texto.includes('9'.repeat(40)));
  const redireccion = await cliente.post(RUTA_UMBRAL, { periodo: hostil, umbral: '0.2' });
  assert.strictEqual(redireccion.estado, 303);
  assert.strictEqual(redireccion.ubicacion, `${RUTA}?periodo=${encodeURIComponent(hostil)}`);
});

test('el reporte y la alerta solo contienen agregados: ni datos socioeconómicos ni identificadores de estudiantes', async (t) => {
  const app = await entorno(t);
  const secretos = JSON.stringify({ ingresosHogar: 98765432, estrato: 6, ocupacionAcudiente: 'ocupacion-secreta' });
  const solicitudId = sembrarSolicitud(app.db, { estudianteId: 'EST-SECRETO-777', datos: secretos });
  sembrarDesembolso(app.db, { solicitudId, numero: 1, estado: 'vencido' });
  sembrarDesembolso(app.db, { solicitudId, numero: 2, estado: 'ejecutado' });
  const cliente = await direccion(app);

  const pagina = await cliente.get(`${RUTA}?periodo=2026-1`);
  const api = await cliente.get(`${API}?periodo=2026-1`);

  assert.ok(bannerDeAlerta(pagina.texto), 'el 50 % supera el umbral y la alerta debe estar');
  for (const respuesta of [pagina, api]) {
    for (const prohibido of ['EST-SECRETO-777', solicitudId, '98765432', 'ocupacion-secreta', 'estrato', 'ingresos', 'promedio', 'puntaje', 'estudiante_id', 'estudianteId']) {
      assert.ok(!respuesta.texto.includes(prohibido), `aparece ${prohibido}`);
    }
  }
  assert.deepStrictEqual(Object.keys(json(api)).sort(), [
    'becasAutomaticas',
    'becasComite',
    'montoTotalDesembolsado',
    'mora',
    'periodoAcademico',
    'totalBecasOtorgadas',
    'totalCreditosAprobados',
  ]);
  assert.deepStrictEqual(Object.keys(json(api).mora).sort(), ['alerta', 'origenUmbral', 'sinPeriodo', 'tasaMora', 'umbral']);
});

test('GET /api/reportes/consolidado devuelve los agregados del periodo, con el periodo más reciente por defecto', async (t) => {
  const app = await entorno(t);
  sembrarCuotas(app.db, ['ejecutado', 'ejecutado', 'vencido'], '2026-1', 500000);
  sembrarPremio(app.db, { origen: 'automatica' });
  sembrarPremio(app.db, { origen: 'comite' });
  const cliente = await direccion(app);

  const respuesta = await cliente.get(`${API}?periodo=2026-1`);

  assert.strictEqual(respuesta.estado, 200);
  assert.ok(respuesta.cabeceras.get('content-type').startsWith('application/json'));
  assert.deepStrictEqual(json(respuesta), {
    periodoAcademico: '2026-1',
    totalCreditosAprobados: 1,
    totalBecasOtorgadas: 2,
    becasAutomaticas: 1,
    becasComite: 1,
    montoTotalDesembolsado: 1000000,
    mora: { tasaMora: 1 / 3, umbral: 0.1, origenUmbral: 'por_defecto', alerta: true, sinPeriodo: 0 },
  });
  assert.strictEqual(json(await cliente.get(API)).periodoAcademico, '2026-1');
  assert.strictEqual((await cliente.get(`${API}?periodo=2030-1`)).estado, 200);
});

test('GET /api/reportes/consolidado sin periodo y sin datos responde 400', async (t) => {
  const app = await entorno(t);

  const respuesta = await (await direccion(app)).get(API);

  assert.strictEqual(respuesta.estado, 400);
  assert.strictEqual(json(respuesta).codigo, 'DATOS_INVALIDOS');
});

test('el inicio de dirección enlaza al reporte (también desde la navegación) y ya no promete informes futuros', async (t) => {
  const app = await entorno(t);

  const pagina = await (await direccion(app)).get('/direccion');

  assert.strictEqual(pagina.estado, 200);
  assert.ok(pagina.texto.includes(`href="${RUTA}"`));
  assert.ok(pagina.texto.includes('informes consolidados'));
  assert.ok(!pagina.texto.includes('estarán disponibles'));
  assert.ok((pagina.texto.match(new RegExp(`href="${RUTA}"`, 'g')) ?? []).length >= 2, 'enlace en la navegación y en el contenido');
});

test('los datos creados por los flujos reales de vencimiento alimentan la tasa de mora del reporte', async (t) => {
  const app = await entorno(t);
  // Cuotas el 01-01, 01-02 y 01-03 de 2026: con el reloj en 2026-05-04 y la primera ejecutada, quedan 2 vencidas.
  const id = await solicitudAprobada(app, { periodoAcademico: '2026-1' }, { ...TERMINOS, fechaPrimeraCuota: '2026-01-01' });
  const cuota1 = app.db.prepare('SELECT id FROM desembolsos WHERE solicitud_id = ? AND numero_cuota = 1').get(id).id;
  assert.strictEqual((await (await asesor(app)).post(`/asesor/desembolsos/${cuota1}/ejecutar`)).estado, 303);
  const cliente = await direccion(app);
  assert.strictEqual((await cliente.post('/direccion/vencimientos/revisar')).estado, 303);

  const pagina = await cliente.get(`${RUTA}?periodo=2026-1`);

  assert.strictEqual(dato(pagina.texto, 'Tasa de mora calculada'), '66,7 %');
  assert.ok(bannerDeAlerta(pagina.texto));
  assert.strictEqual(dato(pagina.texto, 'Monto total desembolsado'), '$400.000');
});

// ---------------------------------------------------------------- NFR-002 (volumen)

test('NFR-002: el reporte de un periodo con 10.000 solicitudes, desembolsos y becas responde en menos de 5 s con totales correctos', async (t) => {
  const app = await entorno(t);
  const TOTAL = 10000;
  app.db.exec('BEGIN');
  const solicitud = app.db.prepare(
    "INSERT INTO solicitudes (id, estudiante_id, periodo_academico, estado, datos, creada_en) VALUES (?, ?, '2026-1', ?, '{}', '2026-01-01T00:00:00.000Z')",
  );
  const desembolso = app.db.prepare(
    `INSERT INTO desembolsos (id, solicitud_id, numero_cuota, fecha, monto, estado, fecha_ejecucion, periodo_academico, tipo_credito)
     VALUES (?, ?, 1, '2026-02-01', 100, ?, NULL, '2026-1', 'credito')`,
  );
  const aplicacion = app.db.prepare(
    `INSERT INTO scholarship_applications (id, estudiante_id, periodo_academico, clasificacion, decision_automatica, creada_en, actualizada_en)
     VALUES (?, ?, '2026-1', 'elegible', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  );
  const premio = app.db.prepare(
    "INSERT INTO scholarship_awards (id, application_id, estudiante_id, periodo_academico, origen, otorgada_en) VALUES (?, ?, ?, '2026-1', ?, '2026-01-02T00:00:00.000Z')",
  );
  const cursor = ['ejecutado', 'ejecutado', 'vencido', 'programado', 'programado'];
  for (let i = 0; i < TOTAL; i += 1) {
    solicitud.run(`v-sol-${i}`, `v-est-${i}`, i % 2 === 0 ? 'aprobada' : 'rechazada');
    desembolso.run(`v-des-${i}`, `v-sol-${i}`, cursor[i % 5]);
    aplicacion.run(`v-app-${i}`, `v-est-${i}`);
    premio.run(`v-pre-${i}`, `v-app-${i}`, `v-est-${i}`, i % 2 === 0 ? 'automatica' : 'comite');
  }
  app.db.exec('COMMIT');
  const cliente = await direccion(app);

  const inicio = performance.now();
  const api = await cliente.get(`${API}?periodo=2026-1`);
  const pagina = await cliente.get(`${RUTA}?periodo=2026-1`);
  const duracion = performance.now() - inicio;

  assert.strictEqual(api.estado, 200);
  assert.deepStrictEqual(json(api), {
    periodoAcademico: '2026-1',
    totalCreditosAprobados: 5000,
    totalBecasOtorgadas: 10000,
    becasAutomaticas: 5000,
    becasComite: 5000,
    montoTotalDesembolsado: 400000,
    mora: { tasaMora: 0.2, umbral: 0.1, origenUmbral: 'por_defecto', alerta: true, sinPeriodo: 0 },
  });
  assert.strictEqual(pagina.estado, 200);
  assert.strictEqual(dato(pagina.texto, 'Becas otorgadas'), '10000');
  assert.ok(duracion < 5000, `el reporte tardo ${Math.round(duracion)} ms`);
});
