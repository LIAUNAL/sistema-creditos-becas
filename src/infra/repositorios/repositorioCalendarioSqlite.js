'use strict';

const { unidadDeTrabajoActual } = require('../unidadDeTrabajo');
const { enTransaccion } = require('../transaccion');

// Repositorio SQLite del puerto de calendario de desembolso (ver
// desembolso/repositorioCalendarioEnMemoria.js). Lee y escribe a traves de la unidad de trabajo
// ACTUAL, igual que el de solicitudes: mapa de identidad + deteccion de cambios, de modo que las
// slices posteriores (`ejecutar`, `revisar`) que mutan los desembolsos obtenidos persisten en el
// mismo `volcar` del caso de uso.
//
// Los errores de generacion son la excepcion: `registrarError` escribe al instante en su PROPIA
// transaccion pequena. La operacion de un caso de uso corre fuera de la transaccion de volcado, asi
// que el registro sobrevive aunque el caso de uso se revierta (p. ej. aprobacion con terminos
// invalidos).

function hidratar(fila) {
  const desembolso = {
    id: fila.id,
    solicitudId: fila.solicitud_id,
    numeroCuota: fila.numero_cuota,
    fecha: fila.fecha,
    monto: fila.monto,
    estado: fila.estado,
  };
  if (fila.fecha_ejecucion !== null) desembolso.fechaEjecucion = fila.fecha_ejecucion;
  if (fila.periodo_academico !== null) desembolso.periodoAcademico = fila.periodo_academico;
  if (fila.tipo_credito !== null) desembolso.tipoCredito = fila.tipo_credito;
  return desembolso;
}

const persistidorDesembolsos = {
  tipo: 'desembolso',
  orden: 5,
  preparar(db) {
    const insertar = db.prepare(
      `INSERT INTO desembolsos
         (id, solicitud_id, numero_cuota, fecha, monto, estado, fecha_ejecucion, periodo_academico, tipo_credito)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const actualizar = db.prepare(
      `UPDATE desembolsos
          SET solicitud_id = ?, numero_cuota = ?, fecha = ?, monto = ?, estado = ?,
              fecha_ejecucion = ?, periodo_academico = ?, tipo_credito = ?
        WHERE id = ?`,
    );
    const valores = (d) => [
      d.solicitudId,
      d.numeroCuota,
      d.fecha,
      d.monto,
      d.estado,
      d.fechaEjecucion ?? null,
      d.periodoAcademico ?? null,
      d.tipoCredito ?? null,
    ];
    return {
      insertar(d) {
        insertar.run(d.id, ...valores(d));
      },
      actualizar(d) {
        actualizar.run(...valores(d), d.id);
      },
    };
  },
};

function crearRepositorioCalendarioSqlite({ db }) {
  function materializar(unidad, fila) {
    return (
      unidad.buscar('desembolso', fila.id) ??
      unidad.adjuntarCargada(persistidorDesembolsos, fila.id, hidratar(fila))
    );
  }

  // Candidatas = filas de la base + todo lo registrado en la unidad (nuevo o modificado sin volcar);
  // el predicado se evalua sobre el estado en memoria.
  function listar(condicionSql, parametros, predicado) {
    const unidad = unidadDeTrabajoActual();
    const filas = db.prepare(`SELECT * FROM desembolsos ${condicionSql} ORDER BY rowid`).all(...parametros);
    const candidatos = new Map();
    for (const fila of filas) candidatos.set(fila.id, materializar(unidad, fila));
    for (const entrada of unidad.entidades('desembolso')) {
      if (!candidatos.has(entrada.clave)) candidatos.set(entrada.clave, entrada.entidad);
    }
    return [...candidatos.values()].filter(predicado);
  }

  return {
    guardar(_solicitudId, desembolsos) {
      const unidad = unidadDeTrabajoActual();
      for (const desembolso of desembolsos) {
        const registrado = unidad.buscar('desembolso', desembolso.id);
        if (registrado) {
          if (registrado !== desembolso) unidad.reemplazar('desembolso', desembolso.id, desembolso);
          continue;
        }
        const fila = db.prepare('SELECT * FROM desembolsos WHERE id = ?').get(desembolso.id);
        if (fila) {
          unidad.adjuntarCargada(persistidorDesembolsos, desembolso.id, desembolso, null, hidratar(fila));
        } else {
          unidad.adjuntarNueva(persistidorDesembolsos, desembolso.id, desembolso);
        }
      }
    },

    obtenerPorSolicitud(solicitudId) {
      return listar('WHERE solicitud_id = ?', [solicitudId], (d) => d.solicitudId === solicitudId).sort(
        (a, b) => a.numeroCuota - b.numeroCuota,
      );
    },

    listarTodos() {
      return listar('', [], () => true);
    },

    listarPorEstado(estado) {
      return listar('WHERE estado = ?', [estado], (d) => d.estado === estado);
    },

    registrarError({ solicitudId, codigo, mensaje, registradoEn }) {
      enTransaccion(db, () =>
        db
          .prepare('INSERT INTO calendar_errors (solicitud_id, codigo, mensaje, registrado_en) VALUES (?, ?, ?, ?)')
          .run(solicitudId, codigo, mensaje, registradoEn),
      );
    },

    listarErrores() {
      return db
        .prepare('SELECT * FROM calendar_errors ORDER BY id')
        .all()
        .map((f) => ({
          solicitudId: f.solicitud_id,
          codigo: f.codigo,
          mensaje: f.mensaje,
          registradoEn: f.registrado_en,
        }));
    },
  };
}

module.exports = { crearRepositorioCalendarioSqlite, persistidorDesembolsos };
