'use strict';

const { idCanonicoEstudiante } = require('./servicioSolicitudes');

// Story 5.16 (P16): bandeja de avisos dentro de la aplicacion (D6: sin correo).
//
// La bandeja LEE la tabla `notifications` directamente: no depende de `entregada_en` (el paso de entrega de P6
// sigue aparte). Solo escribe `leida_en` al marcar un aviso, sin tocar ningun estado de negocio ni auditoria.
//
// Visibilidad (NFR-003):
//   - estudiante: avisos `estudiante` con su id canonico y avisos `solicitud` de sus propias solicitudes, solo de
//     los tipos que le corresponden (nunca `caso_limitrofe`, cuyo payload lleva el puntaje);
//   - comite: avisos `rol`/`comite_becas` de tipo `caso_limitrofe` de los casos que tiene asignados;
//   - asesor y direccion: ninguno por ahora.
// Un aviso ajeno y uno inexistente dan el mismo 404.

const LIMITE_AVISOS = 50;
const ROL_COMITE = 'comite_becas';
const TIPOS_ESTUDIANTE = Object.freeze(['envio', 'decision', 'desembolso', 'desembolso_vencido']);

class ErrorAvisoNoEncontrado extends Error {
  constructor(id) {
    super(`El aviso ${id} no existe o no es visible para el usuario`);
    this.name = 'ErrorAvisoNoEncontrado';
    this.codigo = 'RECURSO_NO_ENCONTRADO';
    this.estadoHttp = 404;
  }
}

const FORMATO_FECHA = /^(\d{4})-(\d{2})-(\d{2})/;

function fechaLegible(valor) {
  const partes = FORMATO_FECHA.exec(String(valor ?? ''));
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : null;
}

// Pesos colombianos con punto de miles: 1200000 -> "$1.200.000".
function montoLegible(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return null;
  return `$${Math.round(numero).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

// Mensaje en espanol construido SOLO con los campos que el aviso necesita (tipo + numero de cuota, monto y fecha):
// el payload completo nunca se copia, asi el puntaje u otros datos no pueden llegar a la pagina.
function mensajeDe(tipo, payload) {
  switch (tipo) {
    case 'envio':
      return 'Su solicitud de crédito fue enviada a revisión.';
    case 'decision':
      if (payload.estado === 'aprobada') return 'Su solicitud de crédito fue aprobada.';
      if (payload.estado === 'rechazada') return 'Su solicitud de crédito fue rechazada.';
      return 'Hay una decisión sobre su solicitud de crédito.';
    case 'desembolso': {
      const monto = montoLegible(payload.monto);
      const fecha = fechaLegible(payload.fecha);
      return `Se ejecutó la cuota ${payload.numeroCuota} de su crédito${monto ? ` por ${monto}` : ''}${fecha ? ` el ${fecha}` : ''}.`;
    }
    case 'desembolso_vencido':
      return `La cuota ${payload.numeroCuota} de su crédito está vencida.`;
    case 'caso_limitrofe':
      return 'Nuevo caso limítrofe para revisión del comité.';
    default:
      return 'Tiene un aviso nuevo.';
  }
}

function enlaceDe(tipo, payload) {
  if (tipo === 'caso_limitrofe') {
    return payload.idCaso === undefined ? null : `/comite/casos/${encodeURIComponent(String(payload.idCaso))}`;
  }
  return payload.solicitudId === undefined ? null : `/solicitudes/${encodeURIComponent(String(payload.solicitudId))}`;
}

function aAviso(fila) {
  let payload = {};
  try {
    payload = JSON.parse(fila.payload) ?? {};
  } catch {
    payload = {};
  }
  return {
    id: fila.id,
    tipo: fila.tipo,
    mensaje: mensajeDe(fila.tipo, payload),
    enlace: enlaceDe(fila.tipo, payload),
    creadaEn: fila.creada_en,
    leida: fila.leida_en !== null,
    leidaEn: fila.leida_en,
  };
}

function crearServicioAvisos({ db, reloj }) {
  const marcas = (n) => Array(n).fill('?').join(', ');

  // Condicion SQL y parametros de los avisos que ve el usuario; `null` si su rol no recibe avisos.
  function visibles(usuario) {
    if (usuario?.rol === 'estudiante') {
      const id = idCanonicoEstudiante(usuario);
      return {
        donde: `n.tipo IN (${marcas(TIPOS_ESTUDIANTE.length)}) AND (
          (n.destinatario_tipo = 'estudiante' AND n.destinatario_id = ?)
          OR (n.destinatario_tipo = 'solicitud'
              AND n.destinatario_id IN (SELECT s.id FROM solicitudes s WHERE s.estudiante_id = ?)))`,
        parametros: [...TIPOS_ESTUDIANTE, id, id],
      };
    }
    if (usuario?.rol === ROL_COMITE) {
      return {
        donde: `n.tipo = 'caso_limitrofe' AND n.destinatario_tipo = 'rol' AND n.destinatario_id = ?
          AND CAST(json_extract(n.payload, '$.idCaso') AS TEXT) IN (
            SELECT a.recurso_id FROM asignaciones a WHERE a.tipo_recurso = 'caso_comite' AND a.usuario_id = ?)`,
        parametros: [ROL_COMITE, usuario.id],
      };
    }
    return null;
  }

  const idValido = (id) => /^\d{1,15}$/.test(String(id));

  return {
    // Los mas recientes primero, hasta LIMITE_AVISOS.
    listarAvisos(usuario) {
      const filtro = visibles(usuario);
      if (!filtro) return [];
      return db
        .prepare(`SELECT n.* FROM notifications n WHERE ${filtro.donde} ORDER BY n.id DESC LIMIT ${LIMITE_AVISOS}`)
        .all(...filtro.parametros)
        .map(aAviso);
    },

    contarNoLeidos(usuario) {
      const filtro = visibles(usuario);
      if (!filtro) return 0;
      return db
        .prepare(`SELECT COUNT(*) AS total FROM notifications n WHERE n.leida_en IS NULL AND ${filtro.donde}`)
        .get(...filtro.parametros).total;
    },

    // Idempotente: solo el primer marcado escribe `leida_en`. Solo toca `notifications`.
    marcarLeido(usuario, avisoId) {
      const filtro = visibles(usuario);
      if (!filtro || !idValido(avisoId)) throw new ErrorAvisoNoEncontrado(avisoId);
      const fila = db
        .prepare(`SELECT n.* FROM notifications n WHERE n.id = ? AND ${filtro.donde}`)
        .get(Number(avisoId), ...filtro.parametros);
      if (!fila) throw new ErrorAvisoNoEncontrado(avisoId);
      if (fila.leida_en !== null) return aAviso(fila);
      const leidaEn = reloj.ahora().toISOString();
      db.prepare('UPDATE notifications SET leida_en = ? WHERE id = ? AND leida_en IS NULL').run(leidaEn, fila.id);
      return aAviso({ ...fila, leida_en: leidaEn });
    },
  };
}

module.exports = { crearServicioAvisos, ErrorAvisoNoEncontrado, LIMITE_AVISOS };
