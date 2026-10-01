'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const {
  CLAVES,
  levantarAplicacion,
  crearUsuario,
  clienteConSesion,
  crearCliente,
  crearSolicitudEnviada,
} = require('./ayudaPruebasWeb');

// Story 5.18 (P18): barrido de visibilidad. Se enumeran TODAS las rutas registradas por la aplicacion
// (las de `crearAplicacionWeb` mas `/health`, que agrega el servidor) contra seis personas y se compara el
// estado HTTP con la tabla EXPECTATIVAS. Una ruta nueva sin expectativa (o una expectativa sin ruta) FALLA.
// Ademas, ningun cuerpo devuelto a una persona puede contener datos socioeconomicos ni puntajes que no le
// correspondan (NFR-003).

const PERSONAS = Object.freeze([
  'anonimo',
  'estudiante',
  'otro_estudiante',
  'asesor_financiero',
  'comite_becas',
  'direccion_academica',
]);

// Datos de los fixtures: valores unicos para buscarlos en los cuerpos.
const CREDITO_A = Object.freeze({ ingresosHogar: '7654321', numeroDependientes: '3', estrato: '5', ocupacionAcudiente: 'bibliotecario' });
const CREDITO_B = Object.freeze({ ingresosHogar: '8765432', numeroDependientes: '1', estrato: '2', ocupacionAcudiente: 'panadero' });
const BECA_A = Object.freeze({ periodoAcademico: '2026-1', promedioAcumulado: '3.37', estrato: '4', ingresosHogar: '3123456' });
const BECA_B = Object.freeze({ periodoAcademico: '2026-2', promedioAcumulado: '3.41', estrato: '4', ingresosHogar: '3234567' });
const TERMINOS = Object.freeze({ monto: '1200000', numeroCuotas: '3', fechaPrimeraCuota: '2026-12-01' });

const GRUPOS = Object.freeze({
  credito_a: ['7654321', 'bibliotecario'],
  credito_b: ['8765432', 'panadero'],
  beca_a: ['3.37', '3123456'],
  beca_b: ['3.41', '3234567'],
});
// Etiquetas de los campos socioeconomicos: ninguna pagina de direccion debe nombrarlas.
const ETIQUETAS_SOCIOECONOMICAS = [/estrato/i, /ingresos/i, /ocupaci[oó]n/i, /promedio/i, /dependientes/i];

// Grupos que cada persona puede ver y en que rutas (patron). `null` = en cualquiera.
const PERMITIDOS = Object.freeze({
  anonimo: {},
  estudiante: { credito_a: null, beca_a: null },
  otro_estudiante: { credito_b: null, beca_b: null },
  asesor_financiero: { credito_a: (patron) => patron.startsWith('/asesor/solicitudes/') },
  comite_becas: {
    beca_a: (patron) => patron.startsWith('/comite/casos/') || patron.startsWith('/api/comite/casos/'),
  },
  direccion_academica: {},
});

// [anonimo, estudiante, otro_estudiante, asesor, comite, direccion]. `recurso` indica que id sustituye `:id`.
const todos = (estado) => [estado, estado, estado, estado, estado, estado];
const conSesion = (anonimo) => [anonimo, 200, 200, 200, 200, 200];
const SOLO_ESTUDIANTE_PAGINA = [303, 200, 200, 403, 403, 403];
const SOLO_ESTUDIANTE_PROPIO = [303, 200, 404, 403, 403, 403];
const SOLO_ESTUDIANTE_PROPIO_API = [401, 200, 404, 403, 403, 403];
const ESCRITURA_ESTUDIANTE = (estadoPropio, estadoAjeno) => [403, estadoPropio, estadoAjeno, 403, 403, 403];

const EXPECTATIVAS = Object.freeze({
  // ----- Publicas y de identidad
  'GET /health': { esperado: todos(200) },
  'GET /login': { esperado: [200, 303, 303, 303, 303, 303] },
  'GET /estilos.css': { esperado: todos(200) },
  'GET /': { esperado: todos(303) },
  'GET /me': { esperado: conSesion(401) },
  'GET /csrf': { esperado: conSesion(401) },
  'POST /login': { esperado: todos(303), sinCsrf: true },
  'POST /logout': { esperado: [403, 303, 303, 303, 303, 303], ultima: true },
  // ----- Estudiante: creditos
  'GET /solicitudes': { esperado: SOLO_ESTUDIANTE_PAGINA },
  'GET /solicitudes/nueva': { esperado: SOLO_ESTUDIANTE_PAGINA },
  'POST /solicitudes': { esperado: ESCRITURA_ESTUDIANTE(400, 400) },
  'GET /solicitudes/:id': { recurso: 'credito', esperado: SOLO_ESTUDIANTE_PROPIO },
  'POST /solicitudes/:id/documentos': { recurso: 'credito', esperado: ESCRITURA_ESTUDIANTE(400, 404) },
  'POST /solicitudes/:id/enviar': { recurso: 'credito', esperado: ESCRITURA_ESTUDIANTE(409, 404) },
  // ----- Estudiante: becas
  'GET /becas': { esperado: SOLO_ESTUDIANTE_PAGINA },
  'GET /becas/nueva': { esperado: SOLO_ESTUDIANTE_PAGINA },
  'POST /becas': { esperado: ESCRITURA_ESTUDIANTE(400, 400) },
  'GET /becas/:id': { recurso: 'beca', esperado: SOLO_ESTUDIANTE_PROPIO },
  'POST /becas/:id/completar': { recurso: 'beca', esperado: ESCRITURA_ESTUDIANTE(409, 404) },
  'POST /api/becas/solicitudes': { esperado: ESCRITURA_ESTUDIANTE(400, 400) },
  'GET /api/becas/solicitudes/:id': { recurso: 'beca', esperado: SOLO_ESTUDIANTE_PROPIO_API },
  'POST /api/becas/solicitudes/:id/completar': { recurso: 'beca', esperado: ESCRITURA_ESTUDIANTE(409, 404) },
  // ----- Asesor financiero
  'GET /asesor/cola': { esperado: [303, 403, 403, 200, 403, 403] },
  'GET /asesor/solicitudes/:id': { recurso: 'credito', esperado: [303, 403, 403, 200, 403, 403] },
  'POST /asesor/solicitudes/:id/reclamar': { recurso: 'credito', esperado: [403, 403, 403, 409, 403, 403] },
  'POST /asesor/solicitudes/:id/aprobar': { recurso: 'credito', esperado: [403, 403, 403, 409, 403, 403] },
  'POST /asesor/solicitudes/:id/rechazar': { recurso: 'credito', esperado: [403, 403, 403, 400, 403, 403] },
  'POST /asesor/desembolsos/:id/ejecutar': { recurso: 'desembolso', esperado: [403, 403, 403, 303, 403, 403] },
  'POST /asesor/vencimientos/revisar': { esperado: [403, 403, 403, 303, 403, 403] },
  // ----- Comite de becas
  'GET /comite': { esperado: [303, 403, 403, 403, 200, 403] },
  'GET /comite/casos/:id': { recurso: 'beca', esperado: [303, 403, 403, 403, 200, 403] },
  'POST /comite/casos/:id/decision': { recurso: 'beca', esperado: [403, 403, 403, 403, 400, 403] },
  'GET /api/comite/cola': { esperado: [401, 403, 403, 403, 200, 403] },
  'GET /api/comite/casos/:id': { recurso: 'beca', esperado: [401, 403, 403, 403, 200, 403] },
  'POST /api/comite/casos/:id/decision': { recurso: 'beca', esperado: [403, 403, 403, 403, 400, 403] },
  // ----- Direccion academica
  'GET /direccion': { esperado: [303, 403, 403, 403, 403, 200] },
  'GET /direccion/solicitudes/:id': { recurso: 'credito', esperado: [303, 403, 403, 403, 403, 200] },
  'POST /direccion/vencimientos/revisar': { esperado: [403, 403, 403, 403, 403, 303] },
  'GET /direccion/reportes': { esperado: [303, 403, 403, 403, 403, 200] },
  'POST /direccion/reportes/umbral': { esperado: [403, 403, 403, 403, 403, 400] },
  'GET /api/reportes/consolidado': { esperado: [401, 403, 403, 403, 403, 200] },
  // ----- Compartidas
  'GET /avisos': { esperado: [303, 200, 200, 200, 200, 200] },
  'POST /avisos/:id/leer': { recurso: 'aviso', esperado: [403, 303, 404, 404, 404, 404] },
});

// Rutas de estado que el servidor deja pasar sin sesion ni token CSRF (validan el origen). Cualquier otra
// debe rechazar la ausencia de token con 403.
const RUTAS_SIN_CSRF = Object.freeze(['POST /login']);

const clave = (metodo, patron) => `${metodo} ${patron}`;

// Cuerpo sin separadores de miles (`3.123.456` -> `3123456`) para encontrar valores formateados.
const sinSeparadores = (texto) => texto.replace(/(\d)[.,](?=\d{3}(?!\d))/g, '$1');

describe('barrido de roles y visibilidad (Story 5.18)', () => {
  let app;
  let clientes;
  let ids;
  let puntajes;
  const violaciones = [];
  const registradas = [];

  before(async () => {
    app = await levantarAplicacion();
    await crearUsuario(app.db, 'estudiante2', 'estudiante', 'clave-estudiante-2');
    const sesion = (nombre, contrasena) => clienteConSesion(app.base, nombre, contrasena);
    clientes = {
      anonimo: crearCliente(app.base),
      estudiante: await sesion('estudiante', CLAVES.SEED_PASSWORD_ESTUDIANTE),
      otro_estudiante: await sesion('estudiante2', 'clave-estudiante-2'),
      asesor_financiero: await sesion('asesor_financiero', CLAVES.SEED_PASSWORD_ASESOR_FINANCIERO),
      comite_becas: await sesion('comite_becas', CLAVES.SEED_PASSWORD_COMITE_BECAS),
      direccion_academica: await sesion('direccion_academica', CLAVES.SEED_PASSWORD_DIRECCION_ACADEMICA),
    };

    // Recursos reales, creados por los flujos de la aplicacion.
    const credito = await crearSolicitudEnviada(clientes.estudiante, CREDITO_A);
    await crearSolicitudEnviada(clientes.otro_estudiante, CREDITO_B);
    await clientes.asesor_financiero.post(`/asesor/solicitudes/${credito}/reclamar`);
    const aprobacion = await clientes.asesor_financiero.post(`/asesor/solicitudes/${credito}/aprobar`, TERMINOS);
    assert.strictEqual(aprobacion.estado, 303);
    const becaA = await clientes.estudiante.post('/becas', BECA_A);
    const becaB = await clientes.otro_estudiante.post('/becas', BECA_B);
    assert.strictEqual(becaA.estado, 303);
    assert.strictEqual(becaB.estado, 303);
    const filas = (sql) => app.db.prepare(sql).all().map((fila) => ({ ...fila }));
    const casos = filas('SELECT id, estado, puntaje FROM casos_comite');
    assert.strictEqual(casos.length, 2, 'ambas becas son limitrofes y llegan a la cola del comite');
    ids = {
      credito,
      beca: becaA.ubicacion.split('/').pop(),
      desembolso: app.db.prepare('SELECT id FROM desembolsos WHERE solicitud_id = ? ORDER BY numero_cuota').get(credito).id,
      aviso: String(filas("SELECT id FROM notifications WHERE tipo = 'envio' ORDER BY id")[0].id),
    };
    puntajes = casos.map((caso) => caso.puntaje);
  });

  after(async () => {
    await app.cerrar();
  });

  const rutaConcreta = (patron, recurso) => (recurso ? patron.replace(':id', ids[recurso]) : patron);

  // Busca en el cuerpo lo que la persona no puede ver; devuelve descripciones de cada hallazgo.
  function hallazgosDeVisibilidad(persona, patron, cuerpo) {
    const permitidos = PERMITIDOS[persona];
    const planos = [cuerpo, sinSeparadores(cuerpo)];
    const hallazgos = [];
    for (const [grupo, valores] of Object.entries(GRUPOS)) {
      const regla = permitidos[grupo];
      const permitido = regla === null || (typeof regla === 'function' && regla(patron));
      if (permitido) continue;
      for (const valor of valores) {
        if (planos.some((texto) => texto.includes(valor))) hallazgos.push(`${persona} ${patron}: aparece "${valor}" (${grupo})`);
      }
    }
    // El puntaje numerico solo lo ve el comite (y solo en sus pantallas): estudiantes, asesor y direccion, nunca.
    if (persona !== 'comite_becas') {
      for (const puntaje of puntajes) {
        const variantes = [String(puntaje), puntaje.toFixed(2), puntaje.toFixed(1), puntaje.toFixed(2).replace('.', ','), puntaje.toFixed(1).replace('.', ',')];
        for (const variante of variantes) {
          if (planos.some((texto) => texto.includes(variante))) hallazgos.push(`${persona} ${patron}: aparece el puntaje ${variante}`);
        }
      }
    }
    if (persona === 'direccion_academica') {
      for (const etiqueta of ETIQUETAS_SOCIOECONOMICAS) {
        if (etiqueta.test(cuerpo)) hallazgos.push(`${persona} ${patron}: nombra un campo socioeconomico (${etiqueta})`);
      }
    }
    if ((persona === 'estudiante' || persona === 'otro_estudiante') && /puntaje/i.test(cuerpo)) {
      hallazgos.push(`${persona} ${patron}: aparece la palabra "puntaje"`);
    }
    return hallazgos;
  }

  const registrarCuerpo = (persona, patron, respuesta) => {
    violaciones.push(...hallazgosDeVisibilidad(persona, patron, respuesta.texto));
  };

  it('cobertura: cada ruta registrada tiene una expectativa y cada expectativa corresponde a una ruta', () => {
    registradas.push(...app.rutas.map(([metodo, patron]) => clave(metodo, patron)), clave('GET', '/health'));
    const sinExpectativa = registradas.filter((k) => !(k in EXPECTATIVAS));
    const sinRuta = Object.keys(EXPECTATIVAS).filter((k) => !registradas.includes(k));
    assert.deepStrictEqual(sinExpectativa, [], 'ruta registrada sin expectativa en el barrido');
    assert.deepStrictEqual(sinRuta, [], 'expectativa sin ruta registrada');
    assert.strictEqual(new Set(registradas).size, registradas.length, 'no hay rutas duplicadas');
    assert.ok(registradas.length >= 40, `se barren ${registradas.length} rutas`);
  });

  it('GET: cada ruta x persona responde el estado esperado y ningun cuerpo filtra datos ajenos', async () => {
    const fallos = [];
    for (const k of registradas.filter((r) => r.startsWith('GET '))) {
      const { recurso, esperado } = EXPECTATIVAS[k];
      const patron = k.slice(4);
      for (const [indice, persona] of PERSONAS.entries()) {
        const respuesta = await clientes[persona].get(rutaConcreta(patron, recurso));
        if (respuesta.estado !== esperado[indice]) {
          fallos.push(`${persona} ${k}: esperado ${esperado[indice]}, recibido ${respuesta.estado}`);
        }
        registrarCuerpo(persona, patron, respuesta);
      }
    }
    assert.deepStrictEqual(fallos, []);
  });

  it('las paginas permitidas SI muestran el dato propio (el barrido no pasa por estar vacio)', async () => {
    const propia = await clientes.estudiante.get(`/solicitudes/${ids.credito}`);
    assert.ok(propia.texto.includes('7654321') || propia.texto.includes('7.654.321'), 'el estudiante ve sus ingresos');
    const asesor = await clientes.asesor_financiero.get(`/asesor/solicitudes/${ids.credito}`);
    assert.ok(/bibliotecario/.test(asesor.texto), 'el asesor asignado ve la ocupacion');
    const caso = await clientes.comite_becas.get(`/comite/casos/${ids.beca}`);
    assert.ok(caso.texto.includes('3.37') && /3[.,]?123[.,]?456/.test(caso.texto), 'el comite ve el promedio y los ingresos del caso');
    const cola = await clientes.comite_becas.get('/api/comite/cola');
    assert.ok(cola.texto.includes(String(puntajes[0])), 'el comite ve el puntaje en su cola');
  });

  it('CSRF: todo POST de estado rechaza la ausencia de token con 403 para un usuario autenticado', async () => {
    const fallos = [];
    const posts = registradas.filter((r) => r.startsWith('POST '));
    assert.deepStrictEqual(
      posts.filter((k) => EXPECTATIVAS[k].sinCsrf),
      RUTAS_SIN_CSRF,
      'las unicas rutas exentas de CSRF son las declaradas',
    );
    for (const k of posts.filter((r) => !RUTAS_SIN_CSRF.includes(r))) {
      const { recurso } = EXPECTATIVAS[k];
      for (const persona of PERSONAS) {
        const respuesta = await clientes[persona].post(rutaConcreta(k.slice(5), recurso), {}, { conToken: false });
        if (respuesta.estado !== 403) fallos.push(`${persona} ${k} sin token: ${respuesta.estado}`);
        const cuerpo = respuesta.texto;
        if (!cuerpo.includes('CSRF_INVALIDO')) fallos.push(`${persona} ${k} sin token: el cuerpo no indica CSRF_INVALIDO`);
      }
    }
    // Con un token de otra sesion tampoco pasa.
    const tokenAjeno = JSON.parse((await clientes.estudiante.get('/csrf')).texto).csrf;
    const conAjeno = await clientes.asesor_financiero.pedir('POST', '/asesor/vencimientos/revisar', {}, { 'x-csrf-token': tokenAjeno }, { json: true });
    if (conAjeno.estado !== 403) fallos.push(`token de otra sesion: ${conAjeno.estado}`);
    assert.deepStrictEqual(fallos, []);
  });

  it('POST con token: cada ruta x persona responde el estado esperado (las no permitidas no cambian nada)', async () => {
    const fallos = [];
    const posts = registradas.filter((r) => r.startsWith('POST ') && !EXPECTATIVAS[r].ultima);
    for (const [indice, persona] of PERSONAS.entries()) {
      for (const k of posts) {
        const { recurso, esperado } = EXPECTATIVAS[k];
        const ruta = rutaConcreta(k.slice(5), recurso);
        // El anonimo no tiene sesion y por tanto tampoco token: se envia sin el.
        const respuesta = await clientes[persona].post(ruta, {}, { conToken: persona !== 'anonimo' });
        if (respuesta.estado !== esperado[indice]) {
          fallos.push(`${persona} ${k}: esperado ${esperado[indice]}, recibido ${respuesta.estado}`);
        }
        registrarCuerpo(persona, k.slice(5), respuesta);
      }
    }
    assert.deepStrictEqual(fallos, []);
  });

  it('POST /logout cierra la sesion de cada rol; el anonimo lo recibe como 403 por falta de sesion y token', async () => {
    const { esperado } = EXPECTATIVAS['POST /logout'];
    for (const [indice, persona] of PERSONAS.entries()) {
      const respuesta = await clientes[persona].post('/logout', {}, { conToken: persona !== 'anonimo' });
      assert.strictEqual(respuesta.estado, esperado[indice], `${persona} POST /logout`);
      if (persona !== 'anonimo') {
        assert.strictEqual((await clientes[persona].get('/me')).estado, 401, `${persona}: la sesion queda cerrada`);
      }
    }
  });

  it('ninguna respuesta del barrido filtro datos socioeconomicos ni puntajes a quien no corresponde', () => {
    assert.deepStrictEqual(violaciones, []);
  });
});
