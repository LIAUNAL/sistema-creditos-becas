'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

// D2 (write-back explicito): unidad de trabajo con mapa de identidad y deteccion de cambios.
//
// Los modulos de negocio mutan los objetos vivos que devuelve `registro.obtener()`
// (`confirmarEnvio`, `_decidir`). Con un repositorio SQLite esas mutaciones se perderian,
// asi que cada CASO DE USO trabaja con una unidad de trabajo que:
//   - devuelve SIEMPRE la misma instancia para una misma entidad (mapa de identidad), de modo
//     que la mutacion hecha por el modulo sea visible para quien vuelca;
//   - recuerda una instantanea de cada entidad cargada o creada;
//   - en `volcar(db)` (SINCRONO, dentro de la transaccion del caso de uso) inserta lo nuevo y
//     actualiza solo lo que cambio respecto a su instantanea, con sentencias preparadas.
//
// Aislamiento: la unidad "actual" se resuelve con AsyncLocalStorage (igual que el notificador
// colector). `unidad.correr(fn)` fija la unidad para `fn` y para todo lo que esta encadene tras
// un await; dos casos de uso intercalados corren en contextos distintos y nunca comparten
// mapa de identidad. Los repositorios SQLite (construidos una sola vez) consultan
// `unidadDeTrabajoActual()`; usarlos fuera de `correr` es un error de programacion y lanza
// UNIDAD_DE_TRABAJO_SIN_CONTEXTO en lugar de escribir sin control.
//
// Limitacion conocida: no hay control de concurrencia optimista; si dos casos de uso cargan la
// misma fila y ambos la modifican, gana el ultimo en volcar (las filas sin cambios no se
// reescriben, asi que un caso de uso de solo lectura nunca pisa a otro).

const almacen = new AsyncLocalStorage();

class ErrorSinUnidadDeTrabajo extends Error {
  constructor() {
    super('El repositorio se uso fuera de una unidad de trabajo (caso de uso)');
    this.name = 'ErrorSinUnidadDeTrabajo';
    this.codigo = 'UNIDAD_DE_TRABAJO_SIN_CONTEXTO';
  }
}

function unidadDeTrabajoActual() {
  const unidad = almacen.getStore();
  if (!unidad) throw new ErrorSinUnidadDeTrabajo();
  return unidad;
}

// Serializacion canonica (claves ordenadas) para comparar una entidad con su instantanea sin
// depender del orden en que se asignaron sus propiedades. Las fechas ya llegan como ISO
// porque JSON.stringify aplica toJSON antes del reemplazador.
function serializar(entidad) {
  return JSON.stringify(entidad, (_clave, valor) =>
    valor && typeof valor === 'object' && !Array.isArray(valor)
      ? Object.fromEntries(Object.entries(valor).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : valor,
  );
}

// Un "persistidor" describe como se escribe un tipo de entidad:
//   { tipo, orden, preparar(db) -> { insertar(entidad, contexto), actualizar(entidad, contexto) } }
// `orden` fija el orden del volcado (las filas padre antes que las hijas por las claves foraneas).
class UnidadDeTrabajo {
  constructor() {
    /** @type {Map<string, object>} `${tipo}\0${clave}` -> entrada */
    this._entradas = new Map();
  }

  _id(tipo, clave) {
    return `${tipo}\u0000${clave}`;
  }

  // Ejecuta `fn` con esta unidad como la actual. Devuelve lo que devuelva `fn` (sincrono o promesa).
  correr(fn) {
    return almacen.run(this, fn);
  }

  buscar(tipo, clave) {
    return this._entradas.get(this._id(tipo, clave))?.entidad;
  }

  // Entidades registradas de un tipo (en orden de registro) con su contexto.
  entidades(tipo) {
    return [...this._entradas.values()].filter((e) => e.persistidor.tipo === tipo);
  }

  // Registra una entidad leida de la base. `estadoBase` es lo que hay en la base (por defecto,
  // el estado actual de la entidad) y es contra lo que se detectan los cambios.
  adjuntarCargada(persistidor, clave, entidad, contexto = null, estadoBase = entidad) {
    this._entradas.set(this._id(persistidor.tipo, clave), {
      persistidor,
      clave,
      entidad,
      contexto,
      instantanea: serializar(estadoBase),
      nueva: false,
    });
    return entidad;
  }

  // Registra una entidad que aun no existe en la base: se insertara al volcar.
  adjuntarNueva(persistidor, clave, entidad, contexto = null) {
    this._entradas.set(this._id(persistidor.tipo, clave), {
      persistidor,
      clave,
      entidad,
      contexto,
      instantanea: null,
      nueva: true,
    });
    return entidad;
  }

  // Cambia la instancia asociada a una clave ya registrada (conserva su instantanea).
  reemplazar(tipo, clave, entidad) {
    this._entradas.get(this._id(tipo, clave)).entidad = entidad;
  }

  // Escribe todo lo nuevo o cambiado. SINCRONO: debe llamarse dentro de la transaccion del caso
  // de uso. Si algo lanza, la instantanea no se actualiza (la transaccion se revierte).
  volcar(db) {
    const preparados = new Map();
    const sentenciasDe = (persistidor) => {
      if (!preparados.has(persistidor)) preparados.set(persistidor, persistidor.preparar(db));
      return preparados.get(persistidor);
    };

    const ordenadas = [...this._entradas.values()].sort((a, b) => a.persistidor.orden - b.persistidor.orden);
    const escritas = [];
    for (const entrada of ordenadas) {
      const actual = serializar(entrada.entidad);
      if (!entrada.nueva && actual === entrada.instantanea) continue;
      const sentencias = sentenciasDe(entrada.persistidor);
      if (entrada.nueva) sentencias.insertar(entrada.entidad, entrada.contexto);
      else sentencias.actualizar(entrada.entidad, entrada.contexto);
      escritas.push([entrada, actual]);
    }
    for (const [entrada, actual] of escritas) {
      entrada.nueva = false;
      entrada.instantanea = actual;
    }
  }
}

function crearUnidadDeTrabajo() {
  return new UnidadDeTrabajo();
}

module.exports = { crearUnidadDeTrabajo, unidadDeTrabajoActual, ErrorSinUnidadDeTrabajo, serializar };
