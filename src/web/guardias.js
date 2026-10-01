'use strict';

function errorHttp(estadoHttp, codigo) {
  const error = new Error(codigo);
  error.codigo = codigo;
  error.estadoHttp = estadoHttp;
  return error;
}

/**
 * Guardias componibles con los manejadores del router. Cada guardia recibe un
 * manejador y devuelve otro manejador que, si pasa la comprobacion, lo invoca
 * con `{ ...contexto, usuario }`.
 *
 *   requerirSesion(manejador)                    -> 401 sin sesion valida
 *   requerirRol('asesor_financiero')(manejador)  -> 401 sin sesion, 403 con otro rol
 */
function crearGuardias({ obtenerUsuario }) {
  function requerirSesion(manejador) {
    return async (contexto) => {
      const usuario = await obtenerUsuario(contexto.req);
      if (!usuario) throw errorHttp(401, 'NO_AUTENTICADO');
      return manejador({ ...contexto, usuario });
    };
  }

  function requerirRol(...roles) {
    return (manejador) =>
      requerirSesion((contexto) => {
        if (!roles.includes(contexto.usuario.rol)) throw errorHttp(403, 'ROL_NO_PERMITIDO');
        return manejador(contexto);
      });
  }

  return { requerirSesion, requerirRol };
}

module.exports = { crearGuardias, errorHttp };
