'use strict';

// Reloj inyectable: los modulos piden la hora a un reloj en vez de usar Date directamente.
const relojSistema = Object.freeze({
  ahora: () => new Date(),
});

function crearRelojFijo(fecha) {
  const instante = new Date(fecha.getTime());
  return Object.freeze({
    ahora: () => new Date(instante.getTime()),
  });
}

module.exports = { relojSistema, crearRelojFijo };
