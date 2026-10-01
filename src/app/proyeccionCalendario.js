'use strict';

// Story 5.14: vista del calendario con la fecha de ejecucion y el estado que entrega la proyeccion del
// modulo (`ejecucion.consultarHistorial`), mas la fecha programada y el id que necesitan las paginas.
// Es una proyeccion pura: no consulta ni escribe nada.
function proyectarCalendario(ejecucion, desembolsos) {
  const historial = ejecucion.consultarHistorial(desembolsos);
  return desembolsos.map((desembolso, indice) => ({
    id: historial[indice].id,
    numeroCuota: historial[indice].numeroCuota,
    fecha: desembolso.fecha,
    monto: historial[indice].monto,
    estado: historial[indice].estado,
    fechaEjecucion: historial[indice].fechaEjecucion,
  }));
}

module.exports = { proyectarCalendario };
