'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  CLAVES,
  DATOS_FORMULARIO,
  DOCUMENTOS,
  levantarAplicacion,
  crearUsuario,
  crearCliente,
  clienteConSesion,
  crearBorradorPorFormulario,
} = require('./ayudaPruebasWeb');

// Cada prueba levanta su propia aplicacion (servidor real + SQLite en memoria).
async function entorno(t) {
  const app = await levantarAplicacion();
  t.after(app.cerrar);
  return app;
}

const estudiante = (app) => clienteConSesion(app.base, 'estudiante', CLAVES.SEED_PASSWORD_ESTUDIANTE);
const idUsuario = (db, nombre) => String(db.prepare('SELECT id FROM usuarios WHERE nombre_usuario = ?').get(nombre).id);
const outbox = (db) => db.prepare('SELECT tipo, destinatario_id, payload FROM notifications ORDER BY id').all();
const estadoEnBase = (db, id) => db.prepare('SELECT estado FROM solicitudes WHERE id = ?').get(id)?.estado;

async function adjuntar(cliente, id, documentos) {
  for (const documento of documentos) {
    const respuesta = await cliente.post(`/solicitudes/${id}/documentos`, documento);
    assert.strictEqual(respuesta.estado, 303, respuesta.texto);
  }
}

// ---------------------------------------------------------------- Scenarios de la spec

test('Scenario: completa y envia el formulario -> borrador asociado a su id canonico y visible en su lista', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);

  const id = await crearBorradorPorFormulario(cliente);

  const fila = app.db.prepare('SELECT estudiante_id, estado, periodo_academico FROM solicitudes WHERE id = ?').get(id);
  assert.deepStrictEqual(
    { ...fila },
    { estudiante_id: idUsuario(app.db, 'estudiante'), estado: 'borrador', periodo_academico: '2026-1' },
  );
  const lista = await cliente.get('/solicitudes');
  assert.strictEqual(lista.estado, 200);
  assert.ok(lista.texto.includes(`/solicitudes/${id}`), 'la lista enlaza la solicitud creada');
  assert.ok(lista.texto.includes('2026-1'));
  assert.ok(lista.texto.includes('borrador'));
});

test('Scenario: el estudiante confirma el envio con los tres documentos -> pendiente_revision y aviso en el outbox', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const id = await crearBorradorPorFormulario(cliente);
  await adjuntar(cliente, id, DOCUMENTOS);

  const respuesta = await cliente.post(`/solicitudes/${id}/enviar`);

  assert.strictEqual(respuesta.estado, 303);
  assert.strictEqual(respuesta.ubicacion, `/solicitudes/${id}`);
  assert.strictEqual(estadoEnBase(app.db, id), 'pendiente_revision');
  const detalle = await cliente.get(`/solicitudes/${id}`);
  assert.ok(detalle.texto.includes('pendiente_revision'));
  assert.deepStrictEqual(
    outbox(app.db).map((f) => [f.tipo, f.destinatario_id, JSON.parse(f.payload)]),
    [
      [
        'envio',
        idUsuario(app.db, 'estudiante'),
        { estudianteId: idUsuario(app.db, 'estudiante'), solicitudId: id, estado: 'pendiente_revision' },
      ],
    ],
  );
  assert.ok((await cliente.get('/solicitudes')).texto.includes('pendiente_revision'));
});

test('Scenario: envio sin certificado de ingresos -> se rechaza, se nombra el documento y sigue en borrador', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const id = await crearBorradorPorFormulario(cliente);
  await adjuntar(cliente, id, DOCUMENTOS.filter((d) => d.tipo !== 'certificado_ingresos'));

  const respuesta = await cliente.post(`/solicitudes/${id}/enviar`);

  assert.strictEqual(respuesta.estado, 400);
  assert.ok(respuesta.texto.includes('Certificado de ingresos'), 'nombra el documento faltante');
  assert.ok(respuesta.texto.includes('role="alert"'));
  assert.ok(respuesta.texto.includes('borrador'));
  assert.ok(!respuesta.texto.includes('pendiente_revision'));
  assert.strictEqual(estadoEnBase(app.db, id), 'borrador');
  assert.strictEqual(outbox(app.db).length, 0);
});

test('Scenario: el primero pide la solicitud del segundo por URL -> 404 (denegar == no existe)', async (t) => {
  const app = await entorno(t);
  await crearUsuario(app.db, 'estudiante2', 'estudiante', 'clave-estudiante-2');
  const primero = await estudiante(app);
  const segundo = await clienteConSesion(app.base, 'estudiante2', 'clave-estudiante-2');
  const idSegundo = await crearBorradorPorFormulario(segundo, { ocupacionAcudiente: 'secreto-del-segundo' });

  const ver = await primero.get(`/solicitudes/${idSegundo}`);
  assert.strictEqual(ver.estado, 404);
  assert.ok(!ver.texto.includes('secreto-del-segundo'));
  assert.strictEqual((await primero.post(`/solicitudes/${idSegundo}/documentos`, DOCUMENTOS[0])).estado, 404);
  assert.strictEqual((await primero.post(`/solicitudes/${idSegundo}/enviar`)).estado, 404);
  assert.strictEqual((await primero.get('/solicitudes')).texto.includes(idSegundo), false);
  assert.strictEqual((await primero.get('/solicitudes/no-existe')).estado, 404);
  assert.strictEqual(estadoEnBase(app.db, idSegundo), 'borrador');
});

// ---------------------------------------------------------------- Login, redireccion y sesion

test('GET /login muestra el formulario accesible y POST /login con formulario redirige 303 a /solicitudes', async (t) => {
  const app = await entorno(t);
  const cliente = crearCliente(app.base);

  const pagina = await cliente.get('/login');
  assert.strictEqual(pagina.estado, 200);
  assert.match(pagina.cabeceras.get('content-type'), /^text\/html/);
  assert.ok(pagina.texto.includes('<html lang="es">'));
  assert.ok(pagina.texto.includes('<title>'));
  assert.ok(pagina.texto.includes('class="salto"'), 'enlace para saltar al contenido');
  assert.ok(pagina.texto.includes('<main'));
  assert.match(pagina.texto, /<form method="post" action="\/login">/);
  assert.match(pagina.texto, /<label for="nombre_usuario">/);
  assert.match(pagina.texto, /<label for="contrasena">/);

  const exito = await cliente.iniciarSesion('estudiante', CLAVES.SEED_PASSWORD_ESTUDIANTE);
  assert.strictEqual(exito.estado, 303);
  assert.strictEqual(exito.ubicacion, '/solicitudes');
  assert.strictEqual((await cliente.get('/solicitudes')).estado, 200);

  const fallo = await crearCliente(app.base).iniciarSesion('estudiante', 'incorrecta');
  assert.strictEqual(fallo.estado, 303);
  assert.strictEqual(fallo.ubicacion, '/login?error=credenciales');
  const conError = await crearCliente(app.base).get('/login?error=credenciales');
  assert.ok(conError.texto.includes('role="alert"'));
  assert.ok(conError.texto.includes('incorrectos'));
  assert.ok(!(await crearCliente(app.base).get('/login?error=<script>')).texto.includes('<script>'));
});

test('el login con JSON conserva su comportamiento (200 con cuerpo JSON)', async (t) => {
  const app = await entorno(t);
  const respuesta = await fetch(`${app.base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre_usuario: 'estudiante', contrasena: CLAVES.SEED_PASSWORD_ESTUDIANTE }),
  });
  assert.strictEqual(respuesta.status, 200);
  const cuerpo = await respuesta.json();
  assert.strictEqual(cuerpo.rol, 'estudiante');
  assert.ok(cuerpo.csrf);
});

test('GET / redirige a /solicitudes con sesion y a /login sin ella; logout cierra la sesion', async (t) => {
  const app = await entorno(t);
  const anonimo = crearCliente(app.base);
  const sinSesion = await anonimo.get('/');
  assert.strictEqual(sinSesion.estado, 303);
  assert.strictEqual(sinSesion.ubicacion, '/login');

  const cliente = await estudiante(app);
  const conSesion = await cliente.get('/');
  assert.strictEqual(conSesion.estado, 303);
  assert.strictEqual(conSesion.ubicacion, '/solicitudes');

  const salida = await cliente.post('/logout');
  assert.strictEqual(salida.estado, 303);
  assert.strictEqual(salida.ubicacion, '/login');
  assert.strictEqual((await cliente.get('/solicitudes')).estado, 303);
});

test('guardia de rol: un asesor en /solicitudes recibe 403 y un anonimo se redirige a /login', async (t) => {
  const app = await entorno(t);
  const asesor = await clienteConSesion(app.base, 'asesor_financiero', CLAVES.SEED_PASSWORD_ASESOR_FINANCIERO);
  for (const ruta of ['/solicitudes', '/solicitudes/nueva', '/solicitudes/cualquiera']) {
    assert.strictEqual((await asesor.get(ruta)).estado, 403, ruta);
  }
  assert.strictEqual((await asesor.post('/solicitudes', DATOS_FORMULARIO)).estado, 403);

  const anonimo = crearCliente(app.base);
  for (const ruta of ['/solicitudes', '/solicitudes/nueva', '/solicitudes/cualquiera']) {
    const respuesta = await anonimo.get(ruta);
    assert.strictEqual(respuesta.estado, 303, ruta);
    assert.strictEqual(respuesta.ubicacion, '/login');
  }
});

// ---------------------------------------------------------------- CSRF, escape y cabeceras

test('todo POST con sesion exige el token CSRF (403 sin el) y los formularios lo llevan oculto', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const id = await crearBorradorPorFormulario(cliente);

  const sinToken = { conToken: false };
  assert.strictEqual((await cliente.post('/solicitudes', DATOS_FORMULARIO, sinToken)).estado, 403);
  assert.strictEqual((await cliente.post(`/solicitudes/${id}/documentos`, DOCUMENTOS[0], sinToken)).estado, 403);
  assert.strictEqual((await cliente.post(`/solicitudes/${id}/enviar`, {}, sinToken)).estado, 403);
  assert.strictEqual((await cliente.post('/logout', {}, sinToken)).estado, 403);
  assert.strictEqual(app.db.prepare('SELECT COUNT(*) AS n FROM solicitudes').get().n, 1);
  assert.strictEqual(app.db.prepare('SELECT COUNT(*) AS n FROM documentos_solicitud').get().n, 0);

  for (const ruta of ['/solicitudes', '/solicitudes/nueva', `/solicitudes/${id}`]) {
    const pagina = await cliente.get(ruta);
    for (const formulario of pagina.texto.match(/<form [^>]*method="post"[\s\S]*?<\/form>/g) ?? []) {
      assert.match(formulario, /<input type="hidden" name="_csrf" value="[0-9a-f]{64}">/, `${ruta}: ${formulario}`);
    }
  }
  assert.match((await cliente.get('/solicitudes')).texto, /action="\/logout"/);
});

test('escapa HTML: <script> en la ocupacion se muestra como texto en la lista y en el detalle', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const ataque = '<script>alert(1)</script>';
  const id = await crearBorradorPorFormulario(cliente, { ocupacionAcudiente: ataque });

  const detalle = await cliente.get(`/solicitudes/${id}`);
  const lista = await cliente.get('/solicitudes');
  for (const pagina of [detalle, lista]) {
    assert.ok(!pagina.texto.includes(ataque), 'no aparece sin escapar');
  }
  assert.ok(detalle.texto.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(lista.texto.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});

test('el formulario escapa los valores previos al volver con errores (atributos incluidos)', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const respuesta = await cliente.post('/solicitudes', {
    ...DATOS_FORMULARIO,
    periodoAcademico: '"><img src=x onerror=alert(1)>',
    estrato: '',
  });
  assert.strictEqual(respuesta.estado, 400);
  assert.ok(!respuesta.texto.includes('<img src=x'));
  assert.ok(respuesta.texto.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'));
});

test('las paginas HTML llevan CSP y cabeceras de seguridad y no usan scripts ni estilos en linea', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const id = await crearBorradorPorFormulario(cliente);
  for (const ruta of ['/login', '/solicitudes', '/solicitudes/nueva', `/solicitudes/${id}`]) {
    // /login se pide sin sesion: con sesion de estudiante redirige a /solicitudes.
    const pagina = await (ruta === '/login' ? crearCliente(app.base) : cliente).get(ruta);
    assert.strictEqual(pagina.estado, 200, ruta);
    assert.match(pagina.cabeceras.get('content-type'), /^text\/html; charset=utf-8/);
    assert.match(pagina.cabeceras.get('content-security-policy'), /default-src 'self'; script-src 'self'; style-src 'self'/);
    assert.strictEqual(pagina.cabeceras.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(pagina.cabeceras.get('x-frame-options'), 'DENY');
    assert.strictEqual(pagina.cabeceras.get('cache-control'), 'no-store');
    assert.ok(!/<script/i.test(pagina.texto), `${ruta}: sin <script>`);
    assert.ok(!/\sstyle=/i.test(pagina.texto), `${ruta}: sin style en linea`);
    assert.ok(!/\sonclick=|\sonerror=/i.test(pagina.texto));
    assert.ok(pagina.texto.includes('<link rel="stylesheet" href="/estilos.css">'));
  }
});

test('GET /estilos.css sirve la hoja de estilos como text/css sin sesion y no hay servidor de archivos generico', async (t) => {
  const app = await entorno(t);
  const cliente = crearCliente(app.base);
  const hoja = await cliente.get('/estilos.css');
  assert.strictEqual(hoja.estado, 200);
  assert.match(hoja.cabeceras.get('content-type'), /^text\/css/);
  assert.match(hoja.cabeceras.get('content-security-policy'), /default-src 'self'/);
  assert.ok(hoja.texto.includes(':focus-visible'), 'foco visible');
  assert.strictEqual((await cliente.get('/estilos.css/../servidor.js')).estado, 404);
  assert.strictEqual((await cliente.get('/servidor.js')).estado, 404);
  assert.strictEqual((await cliente.get('/%2e%2e/%2e%2e/package.json')).estado, 404);
});

// ---------------------------------------------------------------- Validacion y mensajes del formulario

test('datos invalidos re-renderizan el formulario con valores previos y resumen de errores (400)', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);

  const respuesta = await cliente.post('/solicitudes', {
    ...DATOS_FORMULARIO,
    ingresosHogar: 'mucho',
    estrato: '9',
    ocupacionAcudiente: '',
  });

  assert.strictEqual(respuesta.estado, 400);
  assert.ok(respuesta.texto.includes('role="alert"'));
  assert.match(respuesta.texto, /<a href="#ingresosHogar">/);
  assert.match(respuesta.texto, /<a href="#estrato">/);
  assert.match(respuesta.texto, /<a href="#ocupacionAcudiente">/);
  assert.match(respuesta.texto, /id="periodoAcademico"[^>]*value="2026-1"/);
  assert.match(respuesta.texto, /id="ingresosHogar"[^>]*value="mucho"/);
  assert.match(respuesta.texto, /id="numeroDependientes"[^>]*value="2"/);
  assert.match(respuesta.texto, /aria-invalid="true"/);
  assert.strictEqual(app.db.prepare('SELECT COUNT(*) AS n FROM solicitudes').get().n, 0);
});

test('una segunda solicitud activa para el mismo periodo muestra un mensaje claro con enlace a la existente', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const id = await crearBorradorPorFormulario(cliente);

  const respuesta = await cliente.post('/solicitudes', DATOS_FORMULARIO);

  assert.strictEqual(respuesta.estado, 409);
  assert.ok(respuesta.texto.includes('Ya tiene una solicitud activa para el periodo 2026-1'));
  assert.ok(respuesta.texto.includes(`href="/solicitudes/${id}"`));
  assert.ok(respuesta.texto.includes('role="alert"'));
  assert.strictEqual(app.db.prepare('SELECT COUNT(*) AS n FROM solicitudes').get().n, 1);
});

test('un archivo con formato invalido muestra el mensaje y conserva los documentos ya adjuntados', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const id = await crearBorradorPorFormulario(cliente);
  await adjuntar(cliente, id, [DOCUMENTOS[0]]);

  const respuesta = await cliente.post(`/solicitudes/${id}/documentos`, {
    tipo: 'certificado_ingresos',
    nombreArchivo: 'ingresos.exe',
  });

  assert.strictEqual(respuesta.estado, 400);
  assert.ok(respuesta.texto.includes('formato no válido'));
  assert.ok(respuesta.texto.includes('ingresos.exe'));
  assert.ok(respuesta.texto.includes('id.pdf'), 'el documento ya adjuntado sigue en la lista');
  assert.deepStrictEqual(
    app.db.prepare('SELECT tipo, nombre_archivo FROM documentos_solicitud ORDER BY tipo').all().map((f) => ({ ...f })),
    [{ tipo: 'identificacion', nombre_archivo: 'id.pdf' }],
  );
});

test('el detalle lista los documentos adjuntados y los requeridos que faltan; solo guarda metadatos', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const id = await crearBorradorPorFormulario(cliente);
  await adjuntar(cliente, id, [DOCUMENTOS[1]]);

  const detalle = await cliente.get(`/solicitudes/${id}`);

  assert.ok(detalle.texto.includes('ingresos.pdf'));
  assert.ok(detalle.texto.includes('Documento de identificación'), 'figura entre los faltantes');
  assert.ok(detalle.texto.includes('Certificado de matrícula'));
  assert.match(detalle.texto, /<select [^>]*name="tipo"/);
  assert.match(detalle.texto, /<input [^>]*name="nombreArchivo"/);
  assert.ok(!/type="file"/.test(detalle.texto), 'sin carga de bytes (Q3: solo metadatos)');
  assert.match(detalle.texto, /Confirmar envío/);
  const columnas = app.db.prepare('PRAGMA table_info(documentos_solicitud)').all().map((c) => c.name);
  assert.ok(!columnas.some((c) => /contenido|bytes|blob/i.test(c)));
});

test('una solicitud ya enviada no admite otro envio ni mas documentos (409) y no repite el aviso', async (t) => {
  const app = await entorno(t);
  const cliente = await estudiante(app);
  const id = await crearBorradorPorFormulario(cliente);
  await adjuntar(cliente, id, DOCUMENTOS);
  await cliente.post(`/solicitudes/${id}/enviar`);

  assert.strictEqual((await cliente.post(`/solicitudes/${id}/enviar`)).estado, 409);
  assert.strictEqual((await cliente.post(`/solicitudes/${id}/documentos`, DOCUMENTOS[0])).estado, 409);
  assert.strictEqual(outbox(app.db).length, 1);
  const detalle = await cliente.get(`/solicitudes/${id}`);
  assert.ok(!/<button[^>]*>Confirmar envío/.test(detalle.texto), 'ya no se ofrece confirmar');
});
