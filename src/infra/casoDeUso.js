'use strict';

const { enTransaccion } = require('./transaccion');

const LIMITE_POR_DEFECTO = 50;

// D2/D6/R6: ejecuta una operacion de negocio con un colector de notificaciones propio y,
// al terminar (incluso si la operacion lanzo tras mutar), abre UNA transaccion sincrona que
//   1. llama `persistir({ resultado, error })` (write-back del estado mutado), y
//   2. inserta los payloads recolectados como filas de `notifications`.
// Todo o nada: si falla el guardado de estado o cualquier insercion, no se confirma ninguno.
// Despues: se relanza el error original, o se devuelve el resultado. Si `persistir` o el outbox
// fallan, se revierte todo y se propaga ESE error (el de la operacion, si existia, queda en
// `error.errorOperacion`). `persistir` debe ser sincrona.
//
// Story 5.7: `unidadDeTrabajo` (opcional, ver unidadDeTrabajo.js) es la unidad de ESTE caso de uso.
// La operacion corre dentro de su contexto (`unidadDeTrabajo.correr`) para que los repositorios
// resuelvan el mismo mapa de identidad, y en la misma transaccion, ANTES de `persistir` y del
// outbox, se llama `unidadDeTrabajo.volcar(db)`: estado y outbox se confirman juntos o ninguno,
// tambien cuando la operacion lanzo tras mutar. `persistir` pasa a ser opcional cuando hay unidad.
async function ejecutarCasoDeUso({ db, colector, reloj, operacion, persistir, unidadDeTrabajo }) {
  const recolectadas = [];
  let resultado;
  let errorOperacion;
  let fallo = false;

  const correrOperacion = () => colector.correrEnContexto(recolectadas, operacion);

  try {
    resultado = await (unidadDeTrabajo ? unidadDeTrabajo.correr(correrOperacion) : correrOperacion());
  } catch (error) {
    fallo = true;
    errorOperacion = error;
  }

  try {
    enTransaccion(db, () => {
      if (unidadDeTrabajo) unidadDeTrabajo.volcar(db);
      const devuelto =
        persistir === undefined && unidadDeTrabajo
          ? undefined
          : persistir({ resultado, error: errorOperacion });
      if (devuelto && typeof devuelto.then === 'function') {
        devuelto.then(undefined, () => {});
        const error = new TypeError('persistir debe ser sincrona');
        error.codigo = 'TRANSACCION_ASINCRONA';
        throw error;
      }
      insertarNotificaciones(db, reloj, recolectadas);
    });
  } catch (errorPersistencia) {
    if (fallo && errorPersistencia && typeof errorPersistencia === 'object') {
      errorPersistencia.errorOperacion = errorOperacion;
    }
    throw errorPersistencia;
  }

  if (fallo) throw errorOperacion;
  return resultado;
}

function insertarNotificaciones(db, reloj, recolectadas) {
  if (recolectadas.length === 0) return;
  const creadaEn = reloj.ahora().toISOString();
  const insertar = db.prepare(
    `INSERT INTO notifications (tipo, destinatario_tipo, destinatario_id, payload, creada_en)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const n of recolectadas) {
    insertar.run(n.tipo, n.destinatarioTipo, n.destinatarioId, JSON.stringify(n.payload), creadaEn);
  }
}

// Paso de entrega posterior al commit: lee filas sin entregar, llama `entregar(fila)` FUERA de
// cualquier transaccion y marca `entregada_en`; si falla, incrementa `intentos` y registra
// `ultimo_error`. Un fallo de entrega nunca revierte estado. Para la bandeja en la app, la
// entrega por defecto es un no-op exitoso (la bandeja lee la tabla directamente).
async function entregarPendientes({
  db,
  reloj,
  entregar = async () => {},
  limite = LIMITE_POR_DEFECTO,
}) {
  const pendientes = db
    .prepare('SELECT * FROM notifications WHERE entregada_en IS NULL ORDER BY id LIMIT ?')
    .all(limite);
  const marcar = db.prepare('UPDATE notifications SET entregada_en = ? WHERE id = ?');
  const fallar = db.prepare(
    'UPDATE notifications SET intentos = intentos + 1, ultimo_error = ? WHERE id = ?',
  );

  let entregadas = 0;
  let fallidas = 0;
  for (const fila of pendientes) {
    try {
      await entregar(fila);
      marcar.run(reloj.ahora().toISOString(), fila.id);
      entregadas += 1;
    } catch (error) {
      fallar.run(String(error?.message ?? error), fila.id);
      fallidas += 1;
    }
  }
  return { entregadas, fallidas };
}

module.exports = { ejecutarCasoDeUso, entregarPendientes };
