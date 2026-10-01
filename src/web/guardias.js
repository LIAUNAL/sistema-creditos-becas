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
 *   requerirAccesoARecurso(cargar, politica)(m)  -> 401 sin sesion, 404 si no existe o no es suyo
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

  // Carga el recurso, aplica la politica y entrega al manejador el recurso proyectado
  // como `contexto.recurso`. Un recurso ausente y uno denegado dan el mismo 404, para no
  // revelar que existe. `politica = { permitir(usuario, recurso), proyectar(usuario, recurso) }`.
  function requerirAccesoARecurso(cargarRecurso, politica) {
    return (manejador) =>
      requerirSesion(async (contexto) => {
        const recurso = await cargarRecurso(contexto);
        if (recurso === null || recurso === undefined || !politica.permitir(contexto.usuario, recurso)) {
          throw errorHttp(404, 'RECURSO_NO_ENCONTRADO');
        }
        return manejador({ ...contexto, recurso: politica.proyectar(contexto.usuario, recurso) });
      });
  }

  return { requerirSesion, requerirRol, requerirAccesoARecurso };
}

module.exports = { crearGuardias, errorHttp };
