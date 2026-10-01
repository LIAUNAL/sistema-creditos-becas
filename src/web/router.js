'use strict';

function segmentos(ruta) {
  return ruta.split('/').filter((segmento) => segmento !== '');
}

/**
 * Router mínimo por método y ruta. Los segmentos `:nombre` capturan un
 * parámetro (un segmento, no vacío, decodificado).
 */
function crearRouter() {
  const rutas = [];

  function agregar(metodo, patron, manejador) {
    rutas.push({ metodo: metodo.toUpperCase(), segmentos: segmentos(patron), manejador });
  }

  function resolver(metodo, ruta) {
    const partes = segmentos(ruta);
    for (const registro of rutas) {
      if (registro.metodo !== metodo.toUpperCase()) continue;
      if (registro.segmentos.length !== partes.length) continue;
      const params = {};
      let coincide = true;
      for (let i = 0; i < partes.length && coincide; i += 1) {
        const esperado = registro.segmentos[i];
        if (esperado.startsWith(':')) {
          try {
            params[esperado.slice(1)] = decodeURIComponent(partes[i]);
          } catch {
            coincide = false;
          }
        } else {
          coincide = esperado === partes[i];
        }
      }
      if (coincide) return { manejador: registro.manejador, params };
    }
    return null;
  }

  return { agregar, resolver };
}

module.exports = { crearRouter };
