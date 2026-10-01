'use strict';

const { unidadDeTrabajoActual } = require('../unidadDeTrabajo');

// Repositorio SQLite del puerto de casos del comite (ver evaluacion-elegibilidad/repositorioCasosComiteEnMemoria.js).
// Lee y escribe a traves de la unidad de trabajo ACTUAL, igual que el de solicitudes y el de calendario:
// mapa de identidad + deteccion de cambios. `revisionComite.registrarDecision` muta el registro vivo y
// el cambio se escribe en el `volcar` del caso de uso, dentro de la misma transaccion que la
// auditoria, el premio y el outbox.
//
// El historial se guarda como JSON con las fechas en ISO y se rehidrata a los `Date` que usa el modulo.
// El caso se normaliza a `estudiante: { estudianteId }` (puente en src/app/) y debe traer el periodo.

function texto(valor, descripcion, id) {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new TypeError(`El caso ${id} requiere ${descripcion} (texto no vacio) para persistirse`);
  }
  return valor;
}

function aFila(caso) {
  const estudianteId = texto(caso.estudiante?.estudianteId, 'estudiante.estudianteId', caso.id);
  const periodoAcademico = texto(caso.periodoAcademico, 'periodoAcademico', caso.id);
  const ingreso = caso.historial?.[0]?.fecha;
  if (ingreso === undefined) throw new TypeError(`El caso ${caso.id} requiere un historial con su ingreso a la cola`);
  return {
    id: caso.id,
    estudianteId,
    periodoAcademico,
    puntaje: caso.puntaje,
    estado: caso.estado,
    historial: JSON.stringify(caso.historial),
    creadaEn: new Date(ingreso).toISOString(),
  };
}

function hidratar(fila) {
  return {
    id: fila.id,
    estudiante: { estudianteId: fila.estudiante_id },
    periodoAcademico: fila.periodo_academico,
    puntaje: fila.puntaje,
    estado: fila.estado,
    historial: JSON.parse(fila.historial).map((entrada) => ({ ...entrada, fecha: new Date(entrada.fecha) })),
  };
}

const persistidorCasosComite = {
  tipo: 'caso_comite',
  orden: 6,
  preparar(db) {
    const insertar = db.prepare(
      `INSERT INTO casos_comite (id, estudiante_id, periodo_academico, puntaje, estado, historial, creada_en)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const actualizar = db.prepare(
      `UPDATE casos_comite
          SET estudiante_id = ?, periodo_academico = ?, puntaje = ?, estado = ?, historial = ?, creada_en = ?
        WHERE id = ?`,
    );
    return {
      insertar(caso) {
        const f = aFila(caso);
        insertar.run(f.id, f.estudianteId, f.periodoAcademico, f.puntaje, f.estado, f.historial, f.creadaEn);
      },
      actualizar(caso) {
        const f = aFila(caso);
        actualizar.run(f.estudianteId, f.periodoAcademico, f.puntaje, f.estado, f.historial, f.creadaEn, f.id);
      },
    };
  },
};

function crearRepositorioCasosComiteSqlite({ db }) {
  function materializar(unidad, fila) {
    return unidad.buscar('caso_comite', fila.id) ?? unidad.adjuntarCargada(persistidorCasosComite, fila.id, hidratar(fila));
  }

  // Candidatos = filas de la base + todo lo registrado en la unidad (nuevo o modificado sin volcar);
  // el predicado se evalua sobre el estado en memoria.
  function listar(condicionSql, parametros, predicado) {
    const unidad = unidadDeTrabajoActual();
    const filas = db.prepare(`SELECT * FROM casos_comite ${condicionSql} ORDER BY rowid`).all(...parametros);
    const candidatos = new Map();
    for (const fila of filas) candidatos.set(fila.id, materializar(unidad, fila));
    for (const entrada of unidad.entidades('caso_comite')) {
      if (!candidatos.has(entrada.clave)) candidatos.set(entrada.clave, entrada.entidad);
    }
    return [...candidatos.values()].filter(predicado);
  }

  return {
    guardarCaso(caso) {
      const unidad = unidadDeTrabajoActual();
      const registrado = unidad.buscar('caso_comite', caso.id);
      if (registrado) {
        if (registrado !== caso) unidad.reemplazar('caso_comite', caso.id, caso);
        return;
      }
      const fila = db.prepare('SELECT * FROM casos_comite WHERE id = ?').get(caso.id);
      if (fila) unidad.adjuntarCargada(persistidorCasosComite, caso.id, caso, null, hidratar(fila));
      else unidad.adjuntarNueva(persistidorCasosComite, caso.id, caso);
    },

    obtenerCaso(id) {
      const unidad = unidadDeTrabajoActual();
      const registrado = unidad.buscar('caso_comite', id);
      if (registrado) return registrado;
      const fila = db.prepare('SELECT * FROM casos_comite WHERE id = ?').get(id);
      return fila ? materializar(unidad, fila) : undefined;
    },

    listarTodos: () => listar('', [], () => true),

    listarPorEstado: (estado) => listar('WHERE estado = ?', [estado], (caso) => caso.estado === estado),
  };
}

module.exports = { crearRepositorioCasosComiteSqlite, persistidorCasosComite };
