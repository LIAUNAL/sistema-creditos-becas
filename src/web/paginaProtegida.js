'use strict';

const { mapearError } = require('./errores');
const { responderHtml, redirigir } = require('./respuestas');
const { vistaError } = require('./vistas');

/**
 * Envoltorio comun de las paginas HTML protegidas por rol (Story 5.13). Devuelve una funcion que recibe un
 * manejador `({ ...contexto, csrf }) => ...` y lo protege con `requerirRol(rol)`:
 *   - sin sesion (401) -> redireccion a /login;
 *   - otro 4xx (403 de rol, 404, 409...) -> pagina de error HTML con el mismo estado;
 *   - 5xx -> se propaga al mapeo comun del servidor, que no filtra detalles.
 */
function crearEnvoltorioPagina({ autenticacion, csrf, rol }) {
  const { requerirRol, obtenerUsuario, obtenerIdSesion } = autenticacion;
  const tokenDe = (req) => csrf.generar(obtenerIdSesion(req));

  return function pagina(manejador) {
    const protegido = requerirRol(rol)((contexto) => manejador({ ...contexto, csrf: tokenDe(contexto.req) }));
    return async (contexto) => {
      try {
        return await protegido(contexto);
      } catch (error) {
        if (error?.estadoHttp === 401) return redirigir(contexto.res, '/login');
        const { estado } = mapearError(error);
        if (estado < 400 || estado >= 500) throw error;
        const usuario = await obtenerUsuario(contexto.req);
        const token = usuario ? tokenDe(contexto.req) : undefined;
        return responderHtml(contexto.res, estado, vistaError({ estado, usuario, csrf: token }));
      }
    };
  };
}

// Solo se aceptan campos de texto: un cuerpo JSON con otros tipos no llega a los casos de uso.
async function leerCampos(leerCuerpo) {
  const cuerpo = await leerCuerpo();
  const campos = {};
  if (cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo)) {
    for (const [nombre, valor] of Object.entries(cuerpo)) {
      if (typeof valor === 'string') campos[nombre] = valor;
    }
  }
  return campos;
}

module.exports = { crearEnvoltorioPagina, leerCampos };
