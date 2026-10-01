'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { CLAVES, levantarAplicacion, crearUsuario, crearCliente, clienteConSesion } = require('./ayudaPruebasWeb');
const { DEFAULT_CONFIGURACION } = require('../app/configuracionElegibilidad');
const { calcularElegibilidad } = require('../evaluacion-elegibilidad/calculoElegibilidad');

// Story 5.13 (P13): pantallas de becas del estudiante, pagina de estado, pantallas del comite y aterrizaje
// de direccion. Cada prueba levanta su propia aplicacion (servidor real en puerto efimero + SQLite en memoria).

async function entorno(t) {
  const app = await levantarAplicacion();
  t.after(app.cerrar);
  return app;
}

const estudiante = (app) => clienteConSesion(app.base, 'estudiante', CLAVES.SEED_PASSWORD_ESTUDIANTE);
const asesor = (app) => clienteConSesion(app.base, 'asesor_financiero', CLAVES.SEED_PASSWORD_ASESOR_FINANCIERO);
const comite = (app) => clienteConSesion(app.base, 'comite_becas', CLAVES.SEED_PASSWORD_COMITE_BECAS);
const direccion = (app) =>
  clienteConSesion(app.base, 'direccion_academica', CLAVES.SEED_PASSWORD_DIRECCION_ACADEMICA);

async function otroEstudiante(app) {
  await crearUsuario(app.db, 'estudiante2', 'estudiante', 'clave-estudiante-2');
  return clienteConSesion(app.base, 'estudiante2', 'clave-estudiante-2');
}

// Integrante del comite creado DESPUES de escalar un caso: no queda asignado a el.
async function integranteTardio(app) {
  await crearUsuario(app.db, 'comite2', 'comite_becas', 'clave-comite2');
  return clienteConSesion(app.base, 'comite2', 'clave-comite2');
}

const json = (respuesta) => JSON.parse(respuesta.texto);

// Con la configuracion por defecto: elegible >= 70, limitrofe entre 50 y 70, no elegible < 50.
const ELEGIBLE = Object.freeze({ periodoAcademico: '2026-1', promedioAcumulado: '4.5', estrato: '2', ingresosHogar: '1500000' });
const NO_ELEGIBLE = Object.freeze({ periodoAcademico: '2026-1', promedioAcumulado: '2', estrato: '6', ingresosHogar: '5500000' });
const LIMITROFE = Object.freeze({ periodoAcademico: '2026-2', promedioAcumulado: '3.5', estrato: '4', ingresosHogar: '3000000' });
const SIN_PROMEDIO = Object.freeze({ periodoAcademico: '2026-3', promedioAcumulado: '', estrato: '4', ingresosHogar: '3000000' });
const SIN_ESTRATO_NI_INGRESOS = Object.freeze({ periodoAcademico: '2026-3', promedioAcumulado: '3.5', estrato: '', ingresosHogar: '' });

const PUNTAJE_LIMITROFE = calcularElegibilidad(
  { promedioAcumulado: 3.5, estrato: 4, ingresosHogar: 3000000 },
  DEFAULT_CONFIGURACION,
).puntaje;
const PUNTAJE_ELEGIBLE = calcularElegibilidad(
  { promedioAcumulado: 4.5, estrato: 2, ingresosHogar: 1500000 },
  DEFAULT_CONFIGURACION,
).puntaje;
const COMENTARIO = 'Cumple el perfil socioeconomico del programa';

const aplicaciones = (db) => db.prepare('SELECT * FROM scholarship_applications ORDER BY creada_en, id').all();
const casosComite = (db) => db.prepare('SELECT * FROM casos_comite ORDER BY rowid').all();
const premios = (db) => db.prepare('SELECT * FROM scholarship_awards ORDER BY id').all();

// El puntaje (57.49999999999999 / 83.75) no debe aparecer ni redondeado ni con la palabra que lo nombra.
function assertSinPuntaje(texto, contexto = '') {
  assert.ok(!/puntaje/i.test(texto), `aparece la palabra puntaje ${contexto}`);
  for (const numero of [PUNTAJE_LIMITROFE, PUNTAJE_ELEGIBLE]) {
    // Solo formas con decimales: un entero suelto (57, 84) puede coincidir con texto aleatorio como el token CSRF.
    for (const forma of [String(numero), numero.toFixed(1), numero.toFixed(2)]) {
      assert.ok(!texto.includes(forma), `aparece el numero ${forma} ${contexto}`);
    }
  }
}

// Presenta una solicitud de beca por el formulario HTML y devuelve su id (sale de la redireccion).
async function presentar(cliente, datos) {
  const respuesta = await cliente.post('/becas', datos);
  const coincidencia = /^\/becas\/([^/]+)$/.exec(respuesta.ubicacion ?? '');
  assert.strictEqual(respuesta.estado, 303, respuesta.texto);
  assert.ok(coincidencia, `ubicacion inesperada: ${respuesta.ubicacion}`);
  return coincidencia[1];
}

const decidir = (cliente, id, datos) => cliente.post(`/comite/casos/${id}/decision`, datos);

// ---------------------------------------------------------------- Scenarios de la spec

test('Scenario: el estudiante abre su pagina de estado y ve solo la etiqueta, nunca el puntaje numerico', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);

  const casos = [
    { datos: ELEGIBLE, etiqueta: 'elegible', otras: ['no_elegible', 'limitrofe en revisión', 'datos_incompletos'] },
    { datos: NO_ELEGIBLE, etiqueta: 'no_elegible', otras: ['limitrofe en revisión', 'datos_incompletos'], periodo: '2026-4' },
    { datos: LIMITROFE, etiqueta: 'limitrofe en revisión', otras: ['no_elegible', 'datos_incompletos'] },
    { datos: SIN_PROMEDIO, etiqueta: 'datos_incompletos', otras: ['no_elegible', 'limitrofe en revisión'] },
  ];
  for (const { datos, etiqueta, otras, periodo } of casos) {
    const id = await presentar(cliente, { ...datos, periodoAcademico: periodo ?? datos.periodoAcademico });
    const pagina = await cliente.get(`/becas/${id}`);

    assert.strictEqual(pagina.estado, 200, pagina.texto);
    assert.ok(pagina.texto.includes(`<strong>${etiqueta}</strong>`), `falta la etiqueta ${etiqueta}`);
    for (const otra of otras) assert.ok(!pagina.texto.includes(otra), `no debe aparecer ${otra} en ${etiqueta}`);
    assertSinPuntaje(pagina.texto, `en ${etiqueta}`);
    assert.ok(pagina.texto.includes('<html lang="es">'));
    assert.ok(pagina.texto.includes('<h1>'));
  }
});

test('Scenario: una evaluacion datos_incompletos indica que datos faltan y con su categoria', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);

  const unoFaltante = await cliente.get(`/becas/${await presentar(cliente, SIN_PROMEDIO)}`);
  assert.strictEqual(unoFaltante.estado, 200);
  assert.match(unoFaltante.texto, /Promedio acumulado[^<]*\(dato académico\)/);
  assert.ok(!unoFaltante.texto.includes('Estrato'));
  assert.ok(!unoFaltante.texto.includes('Ingresos'));

  const dosFaltantes = await cliente.get(`/becas/${await presentar(cliente, { ...SIN_ESTRATO_NI_INGRESOS, periodoAcademico: '2026-4' })}`);
  assert.match(dosFaltantes.texto, /Estrato[^<]*\(dato socioeconómico\)/);
  assert.match(dosFaltantes.texto, /Ingresos mensuales del hogar[^<]*\(dato socioeconómico\)/);
  assert.ok(!dosFaltantes.texto.includes('Promedio acumulado'));
});

test('Scenario: un integrante del comite ve en la cola solo los casos que le fueron asignados', async (t) => {
  const app = await entorno(t);
  const miembro = await comite(app);
  const id = await presentar(await estudiante(app), LIMITROFE);
  const tardio = await integranteTardio(app);

  const propia = await miembro.get('/comite');
  assert.strictEqual(propia.estado, 200, propia.texto);
  assert.ok(propia.texto.includes(`href="/comite/casos/${id}"`));
  assert.ok(propia.texto.includes(id.slice(0, 8)));
  assert.ok(propia.texto.includes('2026-2'));
  assert.ok(propia.texto.includes('2026-05-04'));
  assert.ok(propia.texto.includes('<caption>'));
  assert.ok(!propia.texto.includes('57.5'), 'la cola no muestra el puntaje');

  const ajena = await tardio.get('/comite');
  assert.strictEqual(ajena.estado, 200);
  assert.ok(!ajena.texto.includes(id));
  assert.ok(!ajena.texto.includes('2026-2'));
  assert.ok(ajena.texto.includes('No hay casos pendientes'));
});

test('Scenario: un estudiante sin solicitud de beca ve el mensaje de que no hay evaluacion, sin error', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);

  const pagina = await cliente.get('/becas');

  assert.strictEqual(pagina.estado, 200, pagina.texto);
  assert.ok(pagina.texto.includes('Aún no tiene una evaluación de beca'));
  assert.ok(pagina.texto.includes('href="/becas/nueva"'));
  assert.ok(!/role="alert"/.test(pagina.texto));
  assert.ok(!/<table/.test(pagina.texto));
});

// ---------------------------------------------------------------- Estudiante: solicitar y listar

test('el listado muestra el periodo y la etiqueta de estado de cada solicitud y enlaza a su pagina de estado', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const idElegible = await presentar(cliente, ELEGIBLE);
  const idLimitrofe = await presentar(cliente, LIMITROFE);

  const pagina = await cliente.get('/becas');

  assert.strictEqual(pagina.estado, 200);
  assert.ok(pagina.texto.includes('<caption>'));
  assert.ok(pagina.texto.includes(`href="/becas/${idElegible}"`));
  assert.ok(pagina.texto.includes(`href="/becas/${idLimitrofe}"`));
  assert.ok(pagina.texto.includes('2026-1') && pagina.texto.includes('2026-2'));
  assert.ok(pagina.texto.includes('limitrofe en revisión'));
  assert.ok(pagina.texto.includes('href="/becas/nueva"'));
  assert.ok(!pagina.texto.includes('Aún no tiene una evaluación'));
  assertSinPuntaje(pagina.texto, 'en el listado');
});

test('el listado solo incluye las solicitudes del propio estudiante', async (t) => {
  const app = await entorno(t);
  const primero = await estudiante(app);
  const segundo = await otroEstudiante(app);
  const idAjeno = await presentar(segundo, { ...ELEGIBLE, periodoAcademico: '2025-2' });
  await presentar(primero, ELEGIBLE);

  const pagina = await primero.get('/becas');

  assert.ok(!pagina.texto.includes(idAjeno));
  assert.ok(!pagina.texto.includes('2025-2'));
  assert.ok((await segundo.get('/becas')).texto.includes('2025-2'));
});

test('el formulario de solicitud es accesible, lleva el campo CSRF y no exige los datos que pueden faltar', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);

  const pagina = await cliente.get('/becas/nueva');

  assert.strictEqual(pagina.estado, 200, pagina.texto);
  assert.match(pagina.texto, /<form method="post" action="\/becas">/);
  assert.match(pagina.texto, /<input type="hidden" name="_csrf" value="[^"]+">/);
  for (const campo of ['periodoAcademico', 'promedioAcumulado', 'estrato', 'ingresosHogar']) {
    assert.ok(pagina.texto.includes(`<label for="${campo}">`), `falta la etiqueta de ${campo}`);
    assert.ok(pagina.texto.includes(`name="${campo}"`), `falta el campo ${campo}`);
  }
  assert.match(pagina.texto, /id="periodoAcademico"[^>]*required/);
  assert.ok(!/id="promedioAcumulado"[^>]*required/.test(pagina.texto));
  assert.ok(!/<script|style=/.test(pagina.texto));
});

test('presentar la solicitud con datos validos guarda la solicitud y redirige (PRG 303) a su pagina de estado', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);

  const respuesta = await cliente.post('/becas', LIMITROFE);

  assert.strictEqual(respuesta.estado, 303, respuesta.texto);
  const [fila] = aplicaciones(app.db);
  assert.strictEqual(respuesta.ubicacion, `/becas/${fila.id}`);
  assert.strictEqual(fila.clasificacion, 'limitrofe');
  assert.strictEqual(fila.periodo_academico, '2026-2');
});

test('datos invalidos devuelven 400 con el resumen de errores, conservan lo escrito y no guardan nada', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);

  const respuesta = await cliente.post('/becas', { periodoAcademico: '  ', promedioAcumulado: '9.5', estrato: '4', ingresosHogar: '3000000' });

  assert.strictEqual(respuesta.estado, 400, respuesta.texto);
  assert.match(respuesta.texto, /role="alert"/);
  assert.ok(respuesta.texto.includes('Indique el periodo académico.'));
  assert.ok(respuesta.texto.includes('Ingrese un promedio numérico entre 0 y 5.'));
  assert.ok(respuesta.texto.includes('href="#promedioAcumulado"'));
  assert.ok(respuesta.texto.includes('value="9.5"'));
  assert.ok(respuesta.texto.includes('value="3000000"'));
  assert.match(respuesta.texto, /id="promedioAcumulado"[^>]*aria-invalid="true"/);
  assert.strictEqual(aplicaciones(app.db).length, 0);
});

test('un periodo repetido devuelve 409 con el enlace a la solicitud existente y no crea otra', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const existente = await presentar(cliente, ELEGIBLE);

  const respuesta = await cliente.post('/becas', { ...LIMITROFE, periodoAcademico: ELEGIBLE.periodoAcademico });

  assert.strictEqual(respuesta.estado, 409, respuesta.texto);
  assert.ok(respuesta.texto.includes(`href="/becas/${existente}"`));
  assert.match(respuesta.texto, /role="alert"/);
  assert.strictEqual(aplicaciones(app.db).length, 1);
});

test('la pagina de estado de otro estudiante o inexistente responde 404 con una pagina de error', async (t) => {
  const app = await entorno(t);
  const idAjeno = await presentar(await otroEstudiante(app), ELEGIBLE);
  const cliente = await estudiante(app);

  for (const id of [idAjeno, 'no-existe']) {
    const respuesta = await cliente.get(`/becas/${id}`);
    assert.strictEqual(respuesta.estado, 404, respuesta.texto);
    assert.ok(respuesta.texto.includes('No encontrado'));
    assert.ok(!respuesta.texto.includes('2026-1'));
  }
  assert.strictEqual((await cliente.post(`/becas/${idAjeno}/completar`, { promedioAcumulado: '4' })).estado, 404);
});

// ---------------------------------------------------------------- Estudiante: completar los datos

test('el formulario de completar solo pide los datos que faltan y reevalua con PRG mostrando el nuevo estado', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const id = await presentar(cliente, SIN_PROMEDIO);

  const antes = await cliente.get(`/becas/${id}`);
  assert.match(antes.texto, new RegExp(`<form method="post" action="/becas/${id}/completar">`));
  assert.match(antes.texto, /<input type="hidden" name="_csrf" value="[^"]+">/);
  assert.ok(antes.texto.includes('name="promedioAcumulado"'));
  assert.ok(!antes.texto.includes('name="estrato"'));
  assert.ok(!antes.texto.includes('name="ingresosHogar"'));

  const respuesta = await cliente.post(`/becas/${id}/completar`, { promedioAcumulado: '3.5' });

  assert.strictEqual(respuesta.estado, 303, respuesta.texto);
  assert.strictEqual(respuesta.ubicacion, `/becas/${id}`);
  const despues = await cliente.get(`/becas/${id}`);
  assert.ok(despues.texto.includes('<strong>limitrofe en revisión</strong>'));
  assert.ok(!despues.texto.includes('/completar'));
  assert.strictEqual(casosComite(app.db).length, 1, 'el caso limitrofe entra a la cola del comite');
  assertSinPuntaje(despues.texto, 'tras completar');
});

test('completar con un dato invalido devuelve 400 con el resumen de errores y la solicitud sigue incompleta', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const id = await presentar(cliente, SIN_PROMEDIO);

  const respuesta = await cliente.post(`/becas/${id}/completar`, { promedioAcumulado: '9' });

  assert.strictEqual(respuesta.estado, 400, respuesta.texto);
  assert.match(respuesta.texto, /role="alert"/);
  assert.ok(respuesta.texto.includes('Ingrese un promedio numérico entre 0 y 5.'));
  assert.ok(respuesta.texto.includes('value="9"'));
  assert.ok(respuesta.texto.includes('<strong>datos_incompletos</strong>'));
  assert.strictEqual(aplicaciones(app.db)[0].clasificacion, 'datos_incompletos');
});

test('completar los datos de una solicitud que ya no esta incompleta devuelve 409', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const id = await presentar(cliente, ELEGIBLE);

  const respuesta = await cliente.post(`/becas/${id}/completar`, { promedioAcumulado: '3' });

  assert.strictEqual(respuesta.estado, 409, respuesta.texto);
  assert.strictEqual(aplicaciones(app.db)[0].clasificacion, 'elegible');
});

// ---------------------------------------------------------------- Decision del comite visible para el estudiante

test('denegada: la pagina HTML y el JSON del estudiante muestran la decision y el comentario, sin puntaje ni datos socioeconomicos', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  const miembro = await comite(app);
  const id = await presentar(alumno, LIMITROFE);
  assert.ok((await alumno.get(`/becas/${id}`)).texto.includes('<strong>limitrofe en revisión</strong>'));

  const decision = await decidir(miembro, id, { decision: 'denegada', comentario: COMENTARIO });
  assert.strictEqual(decision.estado, 303, decision.texto);

  const pagina = await alumno.get(`/becas/${id}`);
  assert.strictEqual(pagina.estado, 200);
  assert.ok(pagina.texto.includes('<strong>denegada</strong>'));
  assert.ok(pagina.texto.includes(COMENTARIO));
  assert.ok(!pagina.texto.includes('limitrofe en revisión'));
  assertSinPuntaje(pagina.texto, 'en la pagina denegada');
  assert.ok(!pagina.texto.includes('3000000'));

  const api = await alumno.get(`/api/becas/solicitudes/${id}`);
  assert.strictEqual(api.estado, 200, api.texto);
  const cuerpo = json(api);
  assert.strictEqual(cuerpo.clasificacion, 'denegada');
  assert.strictEqual(cuerpo.decisionComite, 'denegada');
  assert.strictEqual(cuerpo.comentarioComite, COMENTARIO);
  assert.strictEqual(cuerpo.becaOtorgada, false);
  assertSinPuntaje(api.texto, 'en el JSON denegada');
  for (const campo of ['estrato', 'ingresosHogar', 'promedioAcumulado', '3000000']) {
    assert.ok(!api.texto.includes(campo), `el JSON expone ${campo}`);
  }
});

test('otorgada: la pagina HTML y el JSON del estudiante muestran la decision, el comentario y la beca', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  const miembro = await comite(app);
  const id = await presentar(alumno, LIMITROFE);

  assert.strictEqual((await decidir(miembro, id, { decision: 'otorgada', comentario: COMENTARIO })).estado, 303);

  const pagina = await alumno.get(`/becas/${id}`);
  assert.ok(pagina.texto.includes('<strong>otorgada</strong>'));
  assert.ok(pagina.texto.includes(COMENTARIO));
  assert.ok(!pagina.texto.includes('limitrofe en revisión'));
  assertSinPuntaje(pagina.texto, 'en la pagina otorgada');

  const cuerpo = json(await alumno.get(`/api/becas/solicitudes/${id}`));
  assert.strictEqual(cuerpo.clasificacion, 'otorgada');
  assert.strictEqual(cuerpo.decisionComite, 'otorgada');
  assert.strictEqual(cuerpo.comentarioComite, COMENTARIO);
  assert.strictEqual(cuerpo.becaOtorgada, true);
  assert.ok(!('puntaje' in cuerpo));
});

test('el comentario del comite se escapa en la pagina del estudiante', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  const id = await presentar(alumno, LIMITROFE);
  const peligroso = '<script>alert("x")</script> & <b>negrita</b>';

  assert.strictEqual((await decidir(await comite(app), id, { decision: 'denegada', comentario: peligroso })).estado, 303);

  const pagina = await alumno.get(`/becas/${id}`);
  assert.ok(!pagina.texto.includes('<script>alert'));
  assert.ok(!pagina.texto.includes('<b>negrita</b>'));
  assert.ok(pagina.texto.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;negrita&lt;/b&gt;'));
});

// ---------------------------------------------------------------- Comite: detalle y decision por formulario

test('el detalle del caso muestra al integrante asignado el puntaje y los datos de entrada, con el formulario de decision', async (t) => {
  const app = await entorno(t);
  const miembro = await comite(app);
  const id = await presentar(await estudiante(app), LIMITROFE);

  const pagina = await miembro.get(`/comite/casos/${id}`);

  assert.strictEqual(pagina.estado, 200, pagina.texto);
  assert.ok(pagina.texto.includes(PUNTAJE_LIMITROFE.toFixed(2)));
  assert.ok(pagina.texto.includes('3.5'));
  assert.ok(pagina.texto.includes('3000000'));
  assert.ok(pagina.texto.includes('2026-2'));
  assert.match(pagina.texto, new RegExp(`<form method="post" action="/comite/casos/${id}/decision">`));
  assert.match(pagina.texto, /<input type="hidden" name="_csrf" value="[^"]+">/);
  assert.match(pagina.texto, /<input type="radio" name="decision" value="otorgada"/);
  assert.match(pagina.texto, /<input type="radio" name="decision" value="denegada"/);
  assert.match(pagina.texto, /<textarea id="comentario" name="comentario"[^>]*required/);
  assert.ok(pagina.texto.includes('<legend>'));
  assert.ok(!/<script|style=/.test(pagina.texto));
});

test('una decision por el formulario redirige (PRG 303) a /comite, deja el caso decidido y otorga la beca', async (t) => {
  const app = await entorno(t);
  const miembro = await comite(app);
  const id = await presentar(await estudiante(app), LIMITROFE);

  const respuesta = await decidir(miembro, id, { decision: 'otorgada', comentario: COMENTARIO });

  assert.strictEqual(respuesta.estado, 303, respuesta.texto);
  assert.strictEqual(respuesta.ubicacion, '/comite');
  assert.strictEqual(casosComite(app.db)[0].estado, 'otorgada');
  assert.strictEqual(premios(app.db).length, 1);
  assert.strictEqual(premios(app.db)[0].origen, 'comite');
  assert.ok((await miembro.get('/comite')).texto.includes('No hay casos pendientes'));
  const decidido = await miembro.get(`/comite/casos/${id}`);
  assert.strictEqual(decidido.estado, 200);
  assert.ok(decidido.texto.includes(COMENTARIO));
  assert.ok(!decidido.texto.includes('name="decision"'), 'un caso decidido ya no ofrece el formulario');
});

test('un integrante no asignado recibe 404 en el detalle y 403 al decidir, y no cambia nada', async (t) => {
  const app = await entorno(t);
  const id = await presentar(await estudiante(app), LIMITROFE);
  const tardio = await integranteTardio(app);

  const detalle = await tardio.get(`/comite/casos/${id}`);
  assert.strictEqual(detalle.estado, 404, detalle.texto);
  assert.ok(!detalle.texto.includes('3000000'));
  assert.strictEqual((await decidir(tardio, id, { decision: 'denegada', comentario: COMENTARIO })).estado, 403);
  assert.strictEqual(casosComite(app.db)[0].estado, 'en_revision_comite');
  assert.strictEqual(premios(app.db).length, 0);
});

test('decidir un caso ya decidido devuelve 409 y no cambia la primera decision', async (t) => {
  const app = await entorno(t);
  const miembro = await comite(app);
  const id = await presentar(await estudiante(app), LIMITROFE);
  assert.strictEqual((await decidir(miembro, id, { decision: 'denegada', comentario: COMENTARIO })).estado, 303);

  const segunda = await decidir(miembro, id, { decision: 'otorgada', comentario: 'cambio de opinion' });

  assert.strictEqual(segunda.estado, 409, segunda.texto);
  assert.strictEqual(casosComite(app.db)[0].estado, 'denegada');
  assert.strictEqual(premios(app.db).length, 0);
});

test('un comentario en blanco devuelve 400 con el resumen de errores role=alert y conserva la decision elegida', async (t) => {
  const app = await entorno(t);
  const miembro = await comite(app);
  const id = await presentar(await estudiante(app), LIMITROFE);

  const respuesta = await decidir(miembro, id, { decision: 'denegada', comentario: '   ' });

  assert.strictEqual(respuesta.estado, 400, respuesta.texto);
  assert.match(respuesta.texto, /role="alert"/);
  assert.ok(respuesta.texto.includes('href="#comentario"'));
  assert.ok(respuesta.texto.includes('Escriba el comentario de la decisión.'));
  assert.match(respuesta.texto, /<input type="radio" name="decision" value="denegada"[^>]*checked/);
  assert.match(respuesta.texto, /id="comentario"[^>]*aria-invalid="true"/);
  assert.strictEqual(casosComite(app.db)[0].estado, 'en_revision_comite');
});

test('sin elegir decision devuelve 400 y conserva el comentario escrito, escapado', async (t) => {
  const app = await entorno(t);
  const miembro = await comite(app);
  const id = await presentar(await estudiante(app), LIMITROFE);

  const respuesta = await decidir(miembro, id, { comentario: 'texto <b>propio</b>' });

  assert.strictEqual(respuesta.estado, 400, respuesta.texto);
  assert.ok(respuesta.texto.includes('Elija otorgada o denegada.'));
  assert.ok(respuesta.texto.includes('href="#decision-otorgada"'));
  assert.ok(respuesta.texto.includes('texto &lt;b&gt;propio&lt;/b&gt;'));
  assert.ok(!respuesta.texto.includes('<b>propio</b>'));
  assert.strictEqual(casosComite(app.db)[0].estado, 'en_revision_comite');
});

// ---------------------------------------------------------------- Escapado, CSRF y guardias

test('el periodo escrito por el estudiante se escapa en el listado, el estado y el detalle del comite', async (t) => {
  const app = await entorno(t);
  const periodo = `<i>"a"&'z'</i>`;
  const cliente = await estudiante(app);
  const id = await presentar(cliente, { ...LIMITROFE, periodoAcademico: periodo });
  const escapado = '&lt;i&gt;&quot;a&quot;&amp;&#39;z&#39;&lt;/i&gt;';

  const paginas = [
    await cliente.get('/becas'),
    await cliente.get(`/becas/${id}`),
    await (await comite(app)).get('/comite'),
    await (await comite(app)).get(`/comite/casos/${id}`),
  ];

  for (const pagina of paginas) {
    assert.strictEqual(pagina.estado, 200, pagina.texto);
    assert.ok(pagina.texto.includes(escapado), 'falta el periodo escapado');
    assert.ok(!pagina.texto.includes('<i>'), 'el periodo no se escapo');
  }
});

test('los valores devueltos al formulario con errores se escapan', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);

  const respuesta = await cliente.post('/becas', { ...LIMITROFE, promedioAcumulado: '"><script>x</script>' });

  assert.strictEqual(respuesta.estado, 400);
  assert.ok(!respuesta.texto.includes('<script>x'));
  assert.ok(respuesta.texto.includes('value="&quot;&gt;&lt;script&gt;x&lt;/script&gt;"'));
});

test('todo POST de las pantallas de becas y del comite exige el token CSRF y no cambia nada sin el', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  const miembro = await comite(app);
  const incompleta = await presentar(alumno, SIN_PROMEDIO);
  const caso = await presentar(alumno, LIMITROFE);

  const intentos = [
    [alumno, '/becas', { ...ELEGIBLE, periodoAcademico: '2027-1' }],
    [alumno, `/becas/${incompleta}/completar`, { promedioAcumulado: '4' }],
    [miembro, `/comite/casos/${caso}/decision`, { decision: 'otorgada', comentario: COMENTARIO }],
  ];
  for (const [cliente, ruta, campos] of intentos) {
    const respuesta = await cliente.post(ruta, campos, { conToken: false });
    assert.strictEqual(respuesta.estado, 403, `${ruta}: ${respuesta.texto}`);
  }
  assert.strictEqual(aplicaciones(app.db).length, 2);
  assert.strictEqual(aplicaciones(app.db).find((a) => a.id === incompleta).clasificacion, 'datos_incompletos');
  assert.strictEqual(casosComite(app.db)[0].estado, 'en_revision_comite');
});

test('asesor, comite y direccion reciben 403 en las pantallas del estudiante y no pueden presentar solicitudes', async (t) => {
  const app = await entorno(t);
  const id = await presentar(await estudiante(app), ELEGIBLE);

  for (const abrir of [asesor, comite, direccion]) {
    const cliente = await abrir(app);
    for (const ruta of ['/becas', '/becas/nueva', `/becas/${id}`]) {
      assert.strictEqual((await cliente.get(ruta)).estado, 403, ruta);
    }
    assert.strictEqual((await cliente.post('/becas', { ...ELEGIBLE, periodoAcademico: '2027-1' })).estado, 403);
    assert.strictEqual((await cliente.post(`/becas/${id}/completar`, { promedioAcumulado: '4' })).estado, 403);
  }
  assert.strictEqual(aplicaciones(app.db).length, 1);
});

test('estudiante, asesor y direccion reciben 403 en las pantallas del comite y no pueden decidir', async (t) => {
  const app = await entorno(t);
  const id = await presentar(await estudiante(app), LIMITROFE);

  for (const abrir of [estudiante, asesor, direccion]) {
    const cliente = await abrir(app);
    assert.strictEqual((await cliente.get('/comite')).estado, 403);
    assert.strictEqual((await cliente.get(`/comite/casos/${id}`)).estado, 403);
    assert.strictEqual((await decidir(cliente, id, { decision: 'otorgada', comentario: COMENTARIO })).estado, 403);
  }
  assert.strictEqual(casosComite(app.db)[0].estado, 'en_revision_comite');
});

test('sin sesion las paginas de becas y del comite redirigen a /login', async (t) => {
  const app = await entorno(t);
  const anonimo = crearCliente(app.base);

  for (const ruta of ['/becas', '/becas/nueva', '/becas/cualquiera', '/comite', '/comite/casos/cualquiera', '/direccion']) {
    const respuesta = await anonimo.get(ruta);
    assert.strictEqual(respuesta.estado, 303, ruta);
    assert.strictEqual(respuesta.ubicacion, '/login', ruta);
  }
});

test('el puntaje nunca aparece en ninguna pagina ni respuesta JSON que ve el estudiante', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const idLimitrofe = await presentar(cliente, LIMITROFE);
  const idElegible = await presentar(cliente, ELEGIBLE);

  const respuestas = [
    await cliente.get('/becas'),
    await cliente.get('/becas/nueva'),
    await cliente.get(`/becas/${idLimitrofe}`),
    await cliente.get(`/becas/${idElegible}`),
    await cliente.get(`/api/becas/solicitudes/${idLimitrofe}`),
    await cliente.get(`/api/becas/solicitudes/${idElegible}`),
    await cliente.postJson('/api/becas/solicitudes', { ...ELEGIBLE, periodoAcademico: '2027-1' }),
    await cliente.post('/becas', { ...LIMITROFE, periodoAcademico: '2027-2', estrato: '9' }),
  ];

  for (const respuesta of respuestas) assertSinPuntaje(respuesta.texto);
});

// ---------------------------------------------------------------- Navegacion y aterrizaje de direccion

test('la navegacion del estudiante enlaza a Mis becas y la del comite a su cola', async (t) => {
  const app = await entorno(t);

  const alumno = await (await estudiante(app)).get('/becas');
  assert.match(alumno.texto, /<a href="\/becas">Mis becas<\/a>/);
  const miembro = await (await comite(app)).get('/comite');
  assert.match(miembro.texto, /<a href="\/comite">Cola del comité<\/a>/);
});

test('el login de direccion aterriza en /direccion y la raiz y /login tambien lo redirigen alli', async (t) => {
  const app = await entorno(t);
  const cliente = crearCliente(app.base);

  const login = await cliente.iniciarSesion('direccion_academica', CLAVES.SEED_PASSWORD_DIRECCION_ACADEMICA);

  assert.strictEqual(login.estado, 303);
  assert.strictEqual(login.ubicacion, '/direccion');
  assert.strictEqual((await cliente.get('/')).ubicacion, '/direccion');
  assert.strictEqual((await cliente.get('/login')).ubicacion, '/direccion');
});

test('/direccion es una pagina accesible sin datos socioeconomicos y los demas roles reciben 403', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  await presentar(alumno, LIMITROFE);

  const pagina = await (await direccion(app)).get('/direccion');

  assert.strictEqual(pagina.estado, 200, pagina.texto);
  assert.ok(pagina.texto.includes('<html lang="es">'));
  assert.ok(pagina.texto.includes('<h1>'));
  assert.ok(pagina.texto.includes('informes consolidados'));
  assert.ok(pagina.texto.includes('action="/logout"'));
  for (const prohibido of ['estrato', 'ingresos', 'promedio', '3000000', 'puntaje']) {
    assert.ok(!pagina.texto.toLowerCase().includes(prohibido), `aparece ${prohibido}`);
  }
  for (const abrir of [estudiante, asesor, comite]) {
    assert.strictEqual((await (await abrir(app)).get('/direccion')).estado, 403);
  }
});
