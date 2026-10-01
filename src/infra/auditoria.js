'use strict';

const CAMPOS_OBLIGATORIOS = ['actor', 'rol', 'accion', 'objetivo'];

function aEntrada(fila) {
  return {
    id: fila.id,
    actor: fila.actor,
    rol: fila.rol,
    accion: fila.accion,
    objetivo: fila.objetivo,
    fecha: fila.fecha,
    detalle: fila.detalle === null ? null : JSON.parse(fila.detalle),
  };
}

// Registro de auditoria de solo anexado: no hay operaciones de actualizar ni borrar.
function crearAuditoria({ db, reloj }) {
  const insertar = db.prepare(
    'INSERT INTO audit_log (actor, rol, accion, objetivo, fecha, detalle) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const todas = db.prepare('SELECT * FROM audit_log ORDER BY id');
  const porObjetivo = db.prepare('SELECT * FROM audit_log WHERE objetivo = ? ORDER BY id');

  function registrar(entrada = {}) {
    for (const campo of CAMPOS_OBLIGATORIOS) {
      if (typeof entrada[campo] !== 'string' || entrada[campo] === '') {
        throw new Error(`audit_log: falta el campo obligatorio ${campo}`);
      }
    }
    const { actor, rol, accion, objetivo, detalle } = entrada;
    const detalleJson = detalle === undefined || detalle === null ? null : JSON.stringify(detalle);
    insertar.run(actor, rol, accion, objetivo, reloj.ahora().toISOString(), detalleJson);
  }

  return {
    registrar,
    listar: () => todas.all().map(aEntrada),
    listarPorObjetivo: (objetivo) => porObjetivo.all(objetivo).map(aEntrada),
  };
}

module.exports = { crearAuditoria };
