'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { abrirBaseDeDatos } = require('../infra/baseDeDatos');
const { ejecutarMigraciones } = require('../infra/migraciones');
const { crearAuditoria } = require('../infra/auditoria');
const { crearAsignaciones } = require('../infra/asignaciones');
const { crearRelojFijo } = require('../infra/reloj');
const { crearPoliticas, CAMPOS_SOCIOECONOMICOS } = require('./politicas');

function preparar() {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  const insertar = db.prepare(
    "INSERT INTO usuarios (nombre_usuario, hash_contrasena, rol, activo) VALUES (?, 'x', ?, 1)",
  );
  const crear = (nombre, rol) => ({
    id: Number(insertar.run(nombre, rol).lastInsertRowid),
    nombre_usuario: nombre,
    rol,
  });
  const reloj = crearRelojFijo(new Date('2026-05-04T12:30:00.000Z'));
  const asignaciones = crearAsignaciones({ db, reloj, auditoria: crearAuditoria({ db, reloj }) });
  const usuarios = {
    estudiante: crear('estudiante1', 'estudiante'),
    otroEstudiante: crear('estudiante2', 'estudiante'),
    asesor: crear('asesor1', 'asesor_financiero'),
    otroAsesor: crear('asesor2', 'asesor_financiero'),
    comite: crear('comite1', 'comite_becas'),
    comiteSinAsignar: crear('comite2', 'comite_becas'),
    direccion: crear('direccion1', 'direccion_academica'),
  };
  return { db, asignaciones, usuarios, politicas: crearPoliticas({ asignaciones }) };
}

const SOCIOECONOMICOS = {
  ingresosHogar: 1200000,
  numeroDependientes: 3,
  estrato: 2,
  ocupacionAcudiente: 'obrero',
  promedioAcumulado: 4.1,
};

function solicitudDe(estudiante, id = 'sol-1') {
  return { id, estudianteId: String(estudiante.id), periodoAcademico: '2026-1', ...SOCIOECONOMICOS };
}

test('un estudiante no puede ver la solicitud de otro estudiante, pero si la propia', () => {
  const { usuarios, politicas } = preparar();
  const solicitud = solicitudDe(usuarios.otroEstudiante);
  assert.strictEqual(politicas.puedeVerSolicitud(usuarios.estudiante, solicitud), false);
  assert.strictEqual(politicas.puedeVerSolicitud(usuarios.otroEstudiante, solicitud), true);
});

test('el estudiante se identifica por usuario.estudianteId cuando existe y si no por el id de usuario', () => {
  const { politicas } = preparar();
  const conCodigo = { id: 50, rol: 'estudiante', estudianteId: 'EST-77' };
  assert.strictEqual(politicas.puedeVerSolicitud(conCodigo, { id: 's', estudianteId: 'EST-77' }), true);
  assert.strictEqual(politicas.puedeVerSolicitud(conCodigo, { id: 's', estudianteId: '50' }), false);
  const sinCodigo = { id: 50, rol: 'estudiante' };
  assert.strictEqual(politicas.puedeVerSolicitud(sinCodigo, { id: 's', estudianteId: '50' }), true);
  assert.strictEqual(politicas.puedeVerSolicitud(sinCodigo, { id: 's' }), false);
});

test('un asesor asignado ve la solicitud; con una no asignada a el, se deniega', () => {
  const { usuarios, asignaciones, politicas } = preparar();
  const solicitud = solicitudDe(usuarios.estudiante);
  asignaciones.reclamar({ solicitudId: solicitud.id, usuario: usuarios.asesor });
  assert.strictEqual(politicas.puedeVerSolicitud(usuarios.asesor, solicitud), true);
  assert.strictEqual(politicas.puedeVerSolicitud(usuarios.otroAsesor, solicitud), false);
  assert.strictEqual(politicas.puedeVerSolicitud(usuarios.asesor, solicitudDe(usuarios.estudiante, 'sol-2')), false);
});

test('un integrante del comite asignado ve el caso; sin asignacion, se deniega', () => {
  const { usuarios, asignaciones, politicas } = preparar();
  asignaciones.asignar({
    tipoRecurso: 'caso_comite',
    recursoId: 'caso-1',
    usuarioId: usuarios.comite.id,
    rol: 'comite_becas',
    actor: { nombre_usuario: 'sistema', rol: 'sistema' },
  });
  const caso = { id: 'caso-1', estudianteId: String(usuarios.estudiante.id) };
  assert.strictEqual(politicas.puedeVerCasoComite(usuarios.comite, caso), true);
  assert.strictEqual(politicas.puedeVerCasoComite(usuarios.comiteSinAsignar, caso), false);
});

test('el estudiante no ve el caso del comite pero si el estado de su propia evaluacion', () => {
  const { usuarios, politicas } = preparar();
  const caso = { id: 'caso-1', estudianteId: String(usuarios.estudiante.id) };
  assert.strictEqual(politicas.puedeVerCasoComite(usuarios.estudiante, caso), false);
  assert.strictEqual(politicas.puedeVerEstadoEvaluacion(usuarios.estudiante, caso), true);
  assert.strictEqual(politicas.puedeVerEstadoEvaluacion(usuarios.otroEstudiante, caso), false);
  assert.strictEqual(politicas.puedeVerEstadoEvaluacion(usuarios.direccion, caso), false);
  assert.strictEqual(politicas.puedeVerEstadoEvaluacion(usuarios.comite, caso), false);
});

test('solo direccion academica ve los reportes', () => {
  const { usuarios, politicas } = preparar();
  assert.strictEqual(politicas.puedeVerReportes(usuarios.direccion), true);
  for (const clave of ['estudiante', 'asesor', 'comite']) {
    assert.strictEqual(politicas.puedeVerReportes(usuarios[clave]), false, clave);
  }
});

test('la proyeccion para direccion academica no incluye campos socioeconomicos', () => {
  const { usuarios, politicas } = preparar();
  const proyectada = politicas.proyectarSolicitud(usuarios.direccion, solicitudDe(usuarios.estudiante));
  for (const campo of Object.keys(SOCIOECONOMICOS)) assert.ok(!(campo in proyectada), campo);
  assert.strictEqual(proyectada.id, 'sol-1');
  assert.strictEqual(proyectada.periodoAcademico, '2026-1');
});

test('matriz rol x recurso: solicitud, caso del comite y reportes', () => {
  const { usuarios, asignaciones, politicas } = preparar();
  const solicitud = solicitudDe(usuarios.estudiante);
  const caso = { id: 'caso-1', estudianteId: String(usuarios.estudiante.id) };
  asignaciones.reclamar({ solicitudId: solicitud.id, usuario: usuarios.asesor });
  asignaciones.asignar({
    tipoRecurso: 'caso_comite',
    recursoId: caso.id,
    usuarioId: usuarios.comite.id,
    rol: 'comite_becas',
    actor: { nombre_usuario: 'sistema', rol: 'sistema' },
  });
  // [usuario, solicitud propia/asignada, caso, reportes]
  const esperado = [
    ['estudiante', true, false, false],
    ['otroEstudiante', false, false, false],
    ['asesor', true, false, false],
    ['otroAsesor', false, false, false],
    ['comite', false, true, false],
    ['comiteSinAsignar', false, false, false],
    ['direccion', false, false, true],
  ];
  for (const [clave, verSolicitud, verCaso, verReportes] of esperado) {
    const usuario = usuarios[clave];
    assert.strictEqual(politicas.puedeVerSolicitud(usuario, solicitud), verSolicitud, `${clave} solicitud`);
    assert.strictEqual(politicas.puedeVerCasoComite(usuario, caso), verCaso, `${clave} caso`);
    assert.strictEqual(politicas.puedeVerReportes(usuario), verReportes, `${clave} reportes`);
  }
});

test('la politica falla cerrado ante usuario, rol o recurso ausentes o desconocidos', () => {
  const { politicas } = preparar();
  assert.strictEqual(politicas.puedeVerSolicitud(null, { id: 's' }), false);
  assert.strictEqual(politicas.puedeVerSolicitud({ id: 1, rol: 'invitado' }, { id: 's' }), false);
  assert.strictEqual(politicas.puedeVerSolicitud({ id: 1, rol: 'asesor_financiero' }, null), false);
  assert.strictEqual(politicas.puedeVerCasoComite(undefined, { id: 'c' }), false);
  assert.strictEqual(politicas.puedeVerReportes(null), false);
});

test('la proyeccion conserva los campos socioeconomicos solo para quien debe verlos', () => {
  const { usuarios, politicas } = preparar();
  const solicitud = solicitudDe(usuarios.estudiante);
  for (const clave of ['estudiante', 'asesor']) {
    assert.deepStrictEqual(politicas.proyectarSolicitud(usuarios[clave], solicitud), solicitud, clave);
  }
  for (const clave of ['comite', 'direccion']) {
    const proyectada = politicas.proyectarSolicitud(usuarios[clave], solicitud);
    for (const campo of CAMPOS_SOCIOECONOMICOS) assert.ok(!(campo in proyectada), `${clave} ${campo}`);
  }
  assert.deepStrictEqual(politicas.proyectarSolicitud({ id: 1, rol: 'invitado' }, solicitud), {
    id: 'sol-1',
    estudianteId: String(usuarios.estudiante.id),
    periodoAcademico: '2026-1',
  });
});

test('la proyeccion no filtra campos en listas ni en objetos anidados y no muta la entrada', () => {
  const { usuarios, politicas } = preparar();
  const original = {
    total: 2,
    solicitudes: [solicitudDe(usuarios.estudiante, 'a'), solicitudDe(usuarios.estudiante, 'b')],
    detalle: { evaluacion: { puntaje: 0.8, entradas: [{ ...SOCIOECONOMICOS, nota: 'x' }] } },
  };
  const copia = structuredClone(original);
  const proyectada = politicas.proyectarSolicitud(usuarios.direccion, original);
  const texto = JSON.stringify(proyectada);
  for (const campo of CAMPOS_SOCIOECONOMICOS) assert.ok(!texto.includes(`"${campo}"`), campo);
  assert.strictEqual(proyectada.solicitudes.length, 2);
  assert.strictEqual(proyectada.detalle.evaluacion.puntaje, 0.8);
  assert.strictEqual(proyectada.detalle.evaluacion.entradas[0].nota, 'x');
  assert.deepStrictEqual(original, copia);
  // Una lista de primer nivel tambien se proyecta.
  const lista = politicas.proyectarSolicitud(usuarios.direccion, original.solicitudes);
  assert.ok(Array.isArray(lista));
  assert.ok(!JSON.stringify(lista).includes('ingresosHogar'));
});

test('proyectarEvaluacion quita los campos socioeconomicos salvo al comite y al asesor', () => {
  const { usuarios, politicas } = preparar();
  const evaluacion = { id: 'ev-1', estado: 'en_cola', puntaje: 0.7, ...SOCIOECONOMICOS };
  const paraComite = politicas.proyectarEvaluacion(usuarios.comite, evaluacion);
  assert.strictEqual(paraComite.promedioAcumulado, 4.1);
  for (const clave of ['direccion', 'estudiante']) {
    const proyectada = politicas.proyectarEvaluacion(usuarios[clave], evaluacion);
    assert.deepStrictEqual(proyectada, { id: 'ev-1', estado: 'en_cola', puntaje: 0.7 }, clave);
  }
});

// Regresion NFR-003: cada campo socioeconomico debe estar ausente para direccion academica,
// sea cual sea la forma del recurso.
const FORMAS = {
  'en la raiz': (campo) => ({ id: 1, [campo]: 'v' }),
  'anidado': (campo) => ({ id: 1, a: { b: { [campo]: 'v' } } }),
  'dentro de una lista': (campo) => ({ id: 1, items: [{ [campo]: 'v' }] }),
  'en una lista de primer nivel': (campo) => [{ id: 1, [campo]: 'v' }],
};

for (const campo of ['ingresosHogar', 'numeroDependientes', 'estrato', 'ocupacionAcudiente', 'promedioAcumulado']) {
  for (const [forma, construir] of Object.entries(FORMAS)) {
    test(`NFR-003: ${campo} ausente para direccion_academica (${forma})`, () => {
      const { usuarios, politicas } = preparar();
      for (const proyectar of [politicas.proyectarSolicitud, politicas.proyectarEvaluacion]) {
        assert.ok(!JSON.stringify(proyectar(usuarios.direccion, construir(campo))).includes(campo));
      }
    });
  }
}

test('NFR-003: la lista de campos socioeconomicos cubre los de los modulos de negocio', () => {
  const { CAMPOS_SOCIOECONOMICOS_OBLIGATORIOS } = require('../solicitud-credito/registroSolicitudCredito');
  for (const campo of [...CAMPOS_SOCIOECONOMICOS_OBLIGATORIOS, 'promedioAcumulado']) {
    assert.ok(CAMPOS_SOCIOECONOMICOS.includes(campo), campo);
  }
});

test('NFR-003: se ocultan tambien las variantes en snake_case', () => {
  const { usuarios, politicas } = preparar();
  const proyectada = politicas.proyectarSolicitud(usuarios.direccion, {
    id: 1,
    ingresos_hogar: 1,
    numero_dependientes: 2,
    promedio_acumulado: 3,
  });
  assert.deepStrictEqual(proyectada, { id: 1 });
});
