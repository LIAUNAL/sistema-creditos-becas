'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  CLAVES,
  levantarAplicacion,
  crearUsuario,
  crearCliente,
  clienteConSesion,
  crearBorradorPorFormulario,
  crearSolicitudEnviada,
} = require('./ayudaPruebasWeb');

// Story 5.9: cola y decision del asesor financiero, y lectura de direccion academica.
// Cada prueba levanta su aplicacion (servidor real + SQLite en memoria) con dos asesores.
async function entorno(t) {
  const app = await levantarAplicacion();
  t.after(app.cerrar);
  await crearUsuario(app.db, 'asesor2', 'asesor_financiero', 'clave-asesor-2');
  return app;
}

const estudiante = (app) => clienteConSesion(app.base, 'estudiante', CLAVES.SEED_PASSWORD_ESTUDIANTE);
const asesor = (app) => clienteConSesion(app.base, 'asesor_financiero', CLAVES.SEED_PASSWORD_ASESOR_FINANCIERO);
const otroAsesor = (app) => clienteConSesion(app.base, 'asesor2', 'clave-asesor-2');
const direccion = (app) => clienteConSesion(app.base, 'direccion_academica', CLAVES.SEED_PASSWORD_DIRECCION_ACADEMICA);
const comite = (app) => clienteConSesion(app.base, 'comite_becas', CLAVES.SEED_PASSWORD_COMITE_BECAS);

const idUsuario = (db, nombre) => String(db.prepare('SELECT id FROM usuarios WHERE nombre_usuario = ?').get(nombre).id);
const estadoEnBase = (db, id) => db.prepare('SELECT estado FROM solicitudes WHERE id = ?').get(id)?.estado;
const auditoriaDe = (db, accion, id) =>
  db
    .prepare('SELECT * FROM audit_log WHERE accion = ? AND objetivo = ? ORDER BY id')
    .all(accion, `solicitud_credito:${id}`)
    .map((f) => ({ ...f, detalle: f.detalle === null ? null : JSON.parse(f.detalle) }));
const asignadosA = (db, id) =>
  db.prepare('SELECT usuario_id FROM asignaciones WHERE tipo_recurso = ? AND recurso_id = ? ORDER BY id')
    .all('solicitud_credito', id)
    .map((f) => String(f.usuario_id));
const decisiones = (db) => db.prepare("SELECT * FROM notifications WHERE tipo = 'decision' ORDER BY id").all();

// Un estudiante envia una solicitud (periodo propio para no chocar con otra activa) y la devuelve.
async function solicitudPendiente(app, datos = {}) {
  return crearSolicitudEnviada(await estudiante(app), datos);
}

// ---------------------------------------------------------------- Scenarios de la spec

test('Scenario: un asesor reclama una solicitud sin asignar -> queda asignada a el y se registra en asignaciones y audit_log', async (t) => {
  const app = await entorno(t);
  const id = await solicitudPendiente(app);
  const cliente = await asesor(app);

  const respuesta = await cliente.post(`/asesor/solicitudes/${id}/reclamar`);

  assert.strictEqual(respuesta.estado, 303);
  assert.strictEqual(respuesta.ubicacion, `/asesor/solicitudes/${id}`);
  assert.deepStrictEqual(asignadosA(app.db, id), [idUsuario(app.db, 'asesor_financiero')]);
  const [entrada, ...resto] = auditoriaDe(app.db, 'asignar', id);
  assert.strictEqual(resto.length, 0);
  assert.strictEqual(entrada.actor, 'asesor_financiero');
  assert.strictEqual(entrada.rol, 'asesor_financiero');
  assert.strictEqual(entrada.fecha, '2026-05-04T12:30:00.000Z');
  assert.strictEqual((await cliente.get(`/asesor/solicitudes/${id}`)).estado, 200);
});

test('Scenario: rechaza sin motivo -> se bloquea la accion, se exige el motivo y el estado no cambia', async (t) => {
  const app = await entorno(t);
  const id = await solicitudPendiente(app);
  const cliente = await asesor(app);
  await cliente.post(`/asesor/solicitudes/${id}/reclamar`);

  for (const motivo of [undefined, '', '   \n ']) {
    const campos = motivo === undefined ? {} : { motivo };
    const respuesta = await cliente.post(`/asesor/solicitudes/${id}/rechazar`, campos);
    assert.strictEqual(respuesta.estado, 400);
    assert.ok(respuesta.texto.includes('role="alert"'));
    assert.ok(respuesta.texto.includes('Indique el motivo del rechazo.'));
    assert.match(respuesta.texto, /<textarea [^>]*name="motivo"[^>]*required/);
  }

  assert.strictEqual(estadoEnBase(app.db, id), 'pendiente_revision');
  assert.strictEqual(auditoriaDe(app.db, 'rechazar', id).length, 0);
  assert.strictEqual(decisiones(app.db).length, 0);
  assert.strictEqual(app.db.prepare('SELECT COUNT(*) AS n FROM decisiones_solicitud').get().n, 0);
});

test('Scenario: rechaza con motivo -> rechazada y audit_log registra asesor, rol, accion y fecha; el estudiante recibe el aviso', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  const id = await crearSolicitudEnviada(alumno);
  const cliente = await asesor(app);
  await cliente.post(`/asesor/solicitudes/${id}/reclamar`);

  const respuesta = await cliente.post(`/asesor/solicitudes/${id}/rechazar`, { motivo: 'Ingresos no soportados' });

  assert.strictEqual(respuesta.estado, 303);
  assert.strictEqual(respuesta.ubicacion, '/asesor/cola');
  assert.strictEqual(estadoEnBase(app.db, id), 'rechazada');
  const [entrada, ...resto] = auditoriaDe(app.db, 'rechazar', id);
  assert.strictEqual(resto.length, 0);
  assert.strictEqual(entrada.actor, 'asesor_financiero');
  assert.strictEqual(entrada.rol, 'asesor_financiero');
  assert.strictEqual(entrada.accion, 'rechazar');
  assert.strictEqual(entrada.fecha, '2026-05-04T12:30:00.000Z');
  assert.deepStrictEqual(entrada.detalle, { motivo: 'Ingresos no soportados' });
  const fila = app.db.prepare('SELECT * FROM decisiones_solicitud WHERE solicitud_id = ?').get(id);
  assert.strictEqual(fila.tipo, 'rechazada');
  assert.strictEqual(fila.asesor_id, idUsuario(app.db, 'asesor_financiero'));
  assert.strictEqual(fila.motivo, 'Ingresos no soportados');
  // El estudiante lo ve en su lista y tiene una fila `decision` en el outbox.
  assert.ok((await alumno.get('/solicitudes')).texto.includes('rechazada'));
  const avisos = decisiones(app.db);
  assert.strictEqual(avisos.length, 1);
  assert.strictEqual(avisos[0].destinatario_id, idUsuario(app.db, 'estudiante'));
  assert.deepStrictEqual(JSON.parse(avisos[0].payload), {
    estudianteId: idUsuario(app.db, 'estudiante'),
    solicitudId: id,
    estado: 'rechazada',
  });
});

test('Scenario: una solicitud asignada a otro asesor -> 403 al decidirla y 404 al verla', async (t) => {
  const app = await entorno(t);
  const id = await solicitudPendiente(app, { ocupacionAcudiente: 'secreto-del-hogar' });
  await (await asesor(app)).post(`/asesor/solicitudes/${id}/reclamar`);
  const intruso = await otroAsesor(app);

  const decision = await intruso.post(`/asesor/solicitudes/${id}/rechazar`, { motivo: 'no corresponde' });
  const ver = await intruso.get(`/asesor/solicitudes/${id}`);

  assert.strictEqual(decision.estado, 403);
  assert.strictEqual(estadoEnBase(app.db, id), 'pendiente_revision');
  assert.strictEqual(auditoriaDe(app.db, 'rechazar', id).length, 0);
  assert.strictEqual(ver.estado, 404);
  assert.ok(!ver.texto.includes('secreto-del-hogar'));
});

test('Scenario: direccion academica abre una solicitud -> ve el resumen y ningun campo socioeconomico', async (t) => {
  const app = await entorno(t);
  const id = await solicitudPendiente(app, { ocupacionAcudiente: 'ocupacion-reservada' });
  const cliente = await direccion(app);

  const respuesta = await cliente.get(`/direccion/solicitudes/${id}`);

  assert.strictEqual(respuesta.estado, 200);
  assert.ok(respuesta.texto.includes(id));
  assert.ok(respuesta.texto.includes('2026-1'));
  assert.ok(respuesta.texto.includes('pendiente_revision'));
  for (const prohibido of ['1500000', 'ocupacion-reservada', 'Ingresos', 'Estrato', 'dependientes', 'Ocupación']) {
    assert.ok(!respuesta.texto.includes(prohibido), `no debe aparecer: ${prohibido}`);
  }
  assert.strictEqual((await cliente.get('/direccion/solicitudes/no-existe')).estado, 404);
});

// ---------------------------------------------------------------- Cola, conflicto y alcance

test('la cola muestra las sin asignar y las propias, nunca las de otro asesor ni los borradores', async (t) => {
  const app = await entorno(t);
  const alumno = await estudiante(app);
  const propia = await crearSolicitudEnviada(alumno, { periodoAcademico: '2026-1' });
  const libre = await crearSolicitudEnviada(alumno, { periodoAcademico: '2026-2' });
  const ajena = await crearSolicitudEnviada(alumno, { periodoAcademico: '2026-3' });
  const borrador = await crearBorradorPorFormulario(alumno, { periodoAcademico: '2026-4' });
  const uno = await asesor(app);
  const dos = await otroAsesor(app);
  await uno.post(`/asesor/solicitudes/${propia}/reclamar`);
  await dos.post(`/asesor/solicitudes/${ajena}/reclamar`);

  const cola = await uno.get('/asesor/cola');

  assert.strictEqual(cola.estado, 200);
  assert.ok(cola.texto.includes(`/asesor/solicitudes/${propia}"`), 'enlace a la propia');
  assert.ok(cola.texto.includes(`/asesor/solicitudes/${libre}/reclamar`), 'boton para reclamar la libre');
  assert.ok(!cola.texto.includes(ajena));
  assert.ok(!cola.texto.includes(borrador));
  assert.ok(!cola.texto.includes(`/asesor/solicitudes/${propia}/reclamar`), 'la propia ya no se reclama');
  assert.ok(!cola.texto.includes('1500000'), 'la cola no muestra datos socioeconomicos');
  assert.match(cola.texto, /<input type="hidden" name="_csrf" value="[0-9a-f]{64}">/);
  assert.ok(cola.texto.includes('Cola de revisión'));
});

test('una cola vacia muestra el mensaje de estado vacio', async (t) => {
  const app = await entorno(t);
  const cola = await (await asesor(app)).get('/asesor/cola');
  assert.strictEqual(cola.estado, 200);
  assert.ok(cola.texto.includes('No hay solicitudes pendientes de revisión.'));
});

test('el segundo asesor que reclama una solicitud ya tomada recibe 409 y nada cambia', async (t) => {
  const app = await entorno(t);
  const id = await solicitudPendiente(app);
  await (await asesor(app)).post(`/asesor/solicitudes/${id}/reclamar`);

  const conflicto = await (await otroAsesor(app)).post(`/asesor/solicitudes/${id}/reclamar`);

  assert.strictEqual(conflicto.estado, 409);
  assert.deepStrictEqual(asignadosA(app.db, id), [idUsuario(app.db, 'asesor_financiero')]);
  assert.strictEqual(auditoriaDe(app.db, 'asignar', id).length, 1);
});

test('una solicitud sin reclamar no se puede ver (404) ni decidir (403); un borrador no se reclama (404)', async (t) => {
  const app = await entorno(t);
  const libre = await solicitudPendiente(app, { periodoAcademico: '2026-1' });
  const borrador = await crearBorradorPorFormulario(await estudiante(app), { periodoAcademico: '2026-2' });
  const cliente = await asesor(app);

  assert.strictEqual((await cliente.get(`/asesor/solicitudes/${libre}`)).estado, 404);
  assert.strictEqual((await cliente.post(`/asesor/solicitudes/${libre}/rechazar`, { motivo: 'x' })).estado, 403);
  assert.strictEqual((await cliente.post(`/asesor/solicitudes/${borrador}/reclamar`)).estado, 404);
  assert.strictEqual((await cliente.post('/asesor/solicitudes/no-existe/reclamar')).estado, 404);
  assert.strictEqual(estadoEnBase(app.db, libre), 'pendiente_revision');
});

test('el detalle del asesor asignado muestra datos socioeconomicos, documentos y el formulario de rechazo', async (t) => {
  const app = await entorno(t);
  const id = await solicitudPendiente(app);
  const cliente = await asesor(app);
  await cliente.post(`/asesor/solicitudes/${id}/reclamar`);

  const detalle = await cliente.get(`/asesor/solicitudes/${id}`);

  assert.strictEqual(detalle.estado, 200);
  for (const esperado of ['1500000', 'docente', 'id.pdf', 'ingresos.pdf', 'matricula.png', 'Motivo del rechazo']) {
    assert.ok(detalle.texto.includes(esperado), esperado);
  }
  assert.match(detalle.texto, new RegExp(`action="/asesor/solicitudes/${id}/rechazar"`));
  assert.match(detalle.texto, /<input type="hidden" name="_csrf" value="[0-9a-f]{64}">/);
  assert.ok(!/aprobar/i.test(detalle.texto), 'la aprobacion llega en la siguiente slice');
});

test('rechazar dos veces da 409 y no repite auditoria ni aviso', async (t) => {
  const app = await entorno(t);
  const id = await solicitudPendiente(app);
  const cliente = await asesor(app);
  await cliente.post(`/asesor/solicitudes/${id}/reclamar`);
  await cliente.post(`/asesor/solicitudes/${id}/rechazar`, { motivo: 'primero' });

  const repetido = await cliente.post(`/asesor/solicitudes/${id}/rechazar`, { motivo: 'segundo' });

  assert.strictEqual(repetido.estado, 409);
  assert.strictEqual(auditoriaDe(app.db, 'rechazar', id).length, 1);
  assert.strictEqual(decisiones(app.db).length, 1);
  const detalle = await cliente.get(`/asesor/solicitudes/${id}`);
  assert.ok(detalle.texto.includes('primero'));
  assert.ok(!/action="[^"]*\/rechazar"/.test(detalle.texto), 'ya no se ofrece rechazar');
});

// ---------------------------------------------------------------- Roles, CSRF, escape

test('estudiante, comite y direccion reciben 403 en las rutas del asesor; asesor en las de direccion', async (t) => {
  const app = await entorno(t);
  const id = await solicitudPendiente(app);
  const rutas = [
    ['get', '/asesor/cola'],
    ['get', `/asesor/solicitudes/${id}`],
    ['post', `/asesor/solicitudes/${id}/reclamar`],
    ['post', `/asesor/solicitudes/${id}/rechazar`],
  ];
  for (const [nombre, cliente] of [
    ['estudiante', await estudiante(app)],
    ['comite', await comite(app)],
    ['direccion', await direccion(app)],
  ]) {
    for (const [metodo, ruta] of rutas) {
      const respuesta = await cliente[metodo](ruta, ...(metodo === 'post' ? [{ motivo: 'x' }] : []));
      assert.strictEqual(respuesta.estado, 403, `${nombre} ${metodo} ${ruta}`);
    }
  }
  const elAsesor = await asesor(app);
  assert.strictEqual((await elAsesor.get(`/direccion/solicitudes/${id}`)).estado, 403);
  assert.strictEqual((await (await estudiante(app)).get(`/direccion/solicitudes/${id}`)).estado, 403);
  assert.strictEqual((await (await comite(app)).get(`/direccion/solicitudes/${id}`)).estado, 403);
  assert.strictEqual(estadoEnBase(app.db, id), 'pendiente_revision');
  assert.deepStrictEqual(asignadosA(app.db, id), []);
});

test('sin sesion las paginas del asesor redirigen a /login', async (t) => {
  const app = await entorno(t);
  const anonimo = crearCliente(app.base);
  const respuesta = await anonimo.get('/asesor/cola');
  assert.strictEqual(respuesta.estado, 303);
  assert.strictEqual(respuesta.ubicacion, '/login');
});

test('los POST del asesor exigen el token CSRF (403 sin el) y no cambian nada', async (t) => {
  const app = await entorno(t);
  const id = await solicitudPendiente(app);
  const cliente = await asesor(app);

  const sinTokenReclamar = await cliente.post(`/asesor/solicitudes/${id}/reclamar`, {}, { conToken: false });
  assert.strictEqual(sinTokenReclamar.estado, 403);
  assert.deepStrictEqual(asignadosA(app.db, id), []);

  await cliente.post(`/asesor/solicitudes/${id}/reclamar`);
  const sinTokenRechazar = await cliente.post(
    `/asesor/solicitudes/${id}/rechazar`,
    { motivo: 'sin token' },
    { conToken: false },
  );
  assert.strictEqual(sinTokenRechazar.estado, 403);
  assert.strictEqual(estadoEnBase(app.db, id), 'pendiente_revision');
});

test('el motivo y los datos del estudiante se escapan al mostrarse', async (t) => {
  const app = await entorno(t);
  const id = await solicitudPendiente(app, { ocupacionAcudiente: '<script>alert(1)</script>' });
  const cliente = await asesor(app);
  await cliente.post(`/asesor/solicitudes/${id}/reclamar`);

  const antes = await cliente.get(`/asesor/solicitudes/${id}`);
  assert.ok(antes.texto.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!antes.texto.includes('<script>alert(1)'));

  // Un motivo demasiado largo se rechaza y se vuelve a mostrar escapado en el textarea.
  const largo = `<img src=x onerror=alert(2)>${'a'.repeat(1100)}`;
  const invalido = await cliente.post(`/asesor/solicitudes/${id}/rechazar`, { motivo: largo });
  assert.strictEqual(invalido.estado, 400);
  assert.ok(!invalido.texto.includes('<img src=x'));
  assert.ok(invalido.texto.includes('&lt;img src=x'));
  assert.strictEqual(estadoEnBase(app.db, id), 'pendiente_revision');

  await cliente.post(`/asesor/solicitudes/${id}/rechazar`, { motivo: '<b>"motivo" & más</b>' });
  const despues = await cliente.get(`/asesor/solicitudes/${id}`);
  assert.ok(despues.texto.includes('&lt;b&gt;&quot;motivo&quot; &amp; más&lt;/b&gt;'));
  assert.ok(!despues.texto.includes('<b>"motivo"'));
});

test('la navegacion del asesor enlaza la cola, el login lo lleva a ella y el estudiante conserva su navegacion', async (t) => {
  const app = await entorno(t);
  const anonimo = crearCliente(app.base);
  const login = await anonimo.iniciarSesion('asesor_financiero', CLAVES.SEED_PASSWORD_ASESOR_FINANCIERO);
  assert.strictEqual(login.estado, 303);
  assert.strictEqual(login.ubicacion, '/asesor/cola');
  assert.strictEqual((await anonimo.get('/')).ubicacion, '/asesor/cola');

  const cola = await anonimo.get('/asesor/cola');
  assert.match(cola.texto, /<a href="\/asesor\/cola">Cola de revisión<\/a>/);
  assert.ok(!cola.texto.includes('Mis solicitudes'));

  const lista = await (await estudiante(app)).get('/solicitudes');
  assert.ok(lista.texto.includes('Mis solicitudes'));
  assert.ok(!lista.texto.includes('Cola de revisión'));
});

test('direccion ve la decision (tipo y fecha) de una solicitud rechazada, sin motivo ni datos socioeconomicos', async (t) => {
  const app = await entorno(t);
  const id = await solicitudPendiente(app);
  const cliente = await asesor(app);
  await cliente.post(`/asesor/solicitudes/${id}/reclamar`);
  await cliente.post(`/asesor/solicitudes/${id}/rechazar`, { motivo: 'motivo-reservado' });

  const resumen = await (await direccion(app)).get(`/direccion/solicitudes/${id}`);

  assert.strictEqual(resumen.estado, 200);
  assert.ok(resumen.texto.includes('rechazada'));
  assert.ok(resumen.texto.includes('2026-05-04'));
  assert.ok(!resumen.texto.includes('motivo-reservado'));
  assert.ok(!resumen.texto.includes('1500000'));
});
