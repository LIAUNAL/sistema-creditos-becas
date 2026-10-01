'use strict';

const TIPOS_RECURSO = Object.freeze(['solicitud_credito', 'caso_comite']);

function errorCodigo(codigo, estadoHttp) {
  const error = new Error(codigo);
  error.codigo = codigo;
  if (estadoHttp) error.estadoHttp = estadoHttp;
  return error;
}

function aAsignacion(fila) {
  return {
    id: fila.id,
    tipoRecurso: fila.tipo_recurso,
    recursoId: fila.recurso_id,
    usuarioId: fila.usuario_id,
    rol: fila.rol,
    asignadaEn: fila.asignada_en,
  };
}

/**
 * Asignaciones de recursos a usuarios (NFR-003, regla por defecto de Q5).
 *
 * - Un asesor financiero reclama una solicitud de credito sin asignar (`reclamar`).
 * - Todo integrante activo del comite se asigna a cada caso (`asignarComiteACaso`).
 * Cada asignacion nueva queda en `audit_log` con la accion `asignar`.
 */
function crearAsignaciones({ db, reloj, auditoria }) {
  const buscarUsuario = db.prepare('SELECT id, rol FROM usuarios WHERE id = ?');
  const existe = db.prepare(
    'SELECT 1 FROM asignaciones WHERE tipo_recurso = ? AND recurso_id = ? AND usuario_id = ?',
  );
  const insertar = db.prepare(
    'INSERT INTO asignaciones (tipo_recurso, recurso_id, usuario_id, rol, asignada_en) VALUES (?, ?, ?, ?, ?)',
  );
  const porRecurso = db.prepare(
    'SELECT * FROM asignaciones WHERE tipo_recurso = ? AND recurso_id = ? ORDER BY id',
  );
  const otrosAsignados = db.prepare(
    'SELECT 1 FROM asignaciones WHERE tipo_recurso = ? AND recurso_id = ? AND usuario_id <> ?',
  );
  const miembrosComite = db.prepare(
    "SELECT id, rol FROM usuarios WHERE rol = 'comite_becas' AND activo = 1 ORDER BY id",
  );

  function asignar({ tipoRecurso, recursoId, usuarioId, rol, actor }) {
    if (!TIPOS_RECURSO.includes(tipoRecurso)) throw errorCodigo('TIPO_RECURSO_INVALIDO', 400);
    if (recursoId === undefined || recursoId === null || String(recursoId) === '') {
      throw errorCodigo('FORMATO_INVALIDO', 400);
    }
    if (!buscarUsuario.get(usuarioId)) throw errorCodigo('USUARIO_NO_ENCONTRADO', 404);
    const id = String(recursoId);
    if (existe.get(tipoRecurso, id, usuarioId)) return { creada: false };
    insertar.run(tipoRecurso, id, usuarioId, rol, reloj.ahora().toISOString());
    auditoria.registrar({
      actor: actor.nombre_usuario,
      rol: actor.rol,
      accion: 'asignar',
      objetivo: `${tipoRecurso}:${id}`,
      detalle: { usuarioId, rol },
    });
    return { creada: true };
  }

  // La comprobacion y la insercion son sincronas: no hay intercalado entre dos reclamos.
  function reclamar({ solicitudId, usuario }) {
    if (usuario?.rol !== 'asesor_financiero') throw errorCodigo('ROL_NO_PERMITIDO', 403);
    if (otrosAsignados.get('solicitud_credito', String(solicitudId), usuario.id)) {
      throw errorCodigo('SOLICITUD_YA_ASIGNADA', 409);
    }
    return asignar({
      tipoRecurso: 'solicitud_credito',
      recursoId: solicitudId,
      usuarioId: usuario.id,
      rol: usuario.rol,
      actor: usuario,
    });
  }

  function asignarComiteACaso({ casoId, actor }) {
    let nuevas = 0;
    for (const miembro of miembrosComite.all()) {
      const { creada } = asignar({
        tipoRecurso: 'caso_comite',
        recursoId: casoId,
        usuarioId: miembro.id,
        rol: miembro.rol,
        actor,
      });
      if (creada) nuevas += 1;
    }
    return { nuevas };
  }

  return {
    asignar,
    reclamar,
    asignarComiteACaso,
    listarPorRecurso: (tipoRecurso, recursoId) =>
      porRecurso.all(tipoRecurso, String(recursoId)).map(aAsignacion),
    estaAsignado: (usuarioId, tipoRecurso, recursoId) =>
      existe.get(tipoRecurso, String(recursoId), usuarioId) !== undefined,
  };
}

module.exports = { crearAsignaciones, TIPOS_RECURSO };
