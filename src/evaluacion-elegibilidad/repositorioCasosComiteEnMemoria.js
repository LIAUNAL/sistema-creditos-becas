'use strict';

/**
 * Puerto de persistencia de los casos del comite (Story 5.12) y su implementacion en memoria, que es
 * la de por defecto de `crearRevisionComite` (mismo comportamiento que antes del puerto).
 *
 *   guardarCaso(caso)          registra el caso (clave: `caso.id`)
 *   obtenerCaso(id)            el registro VIVO (el modulo lo muta al decidir) o `undefined`
 *   listarTodos()              todos los registros, en orden de ingreso
 *   listarPorEstado(estado)    los registros en ese estado, en orden de ingreso
 *
 * El puerto devuelve registros vivos: las copias para quien consulta las hace `revisionComite`.
 */
function crearRepositorioCasosComiteEnMemoria() {
  /** @type {Map<string, object>} */
  const casos = new Map();

  return {
    guardarCaso(caso) {
      casos.set(caso.id, caso);
    },
    obtenerCaso: (id) => casos.get(id),
    listarTodos: () => [...casos.values()],
    listarPorEstado: (estado) => [...casos.values()].filter((caso) => caso.estado === estado),
  };
}

module.exports = { crearRepositorioCasosComiteEnMemoria };
