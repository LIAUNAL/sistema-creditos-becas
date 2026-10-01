'use strict';

const { errorHttp } = require('./guardias');
const { mapearError } = require('./errores');
const { responderHtml, redirigir } = require('./respuestas');
const { vistaCola, vistaDetalleAsesor, vistaResumenDireccion, vistaError } = require('./vistas');

// Solo se aceptan campos de texto del formulario (igual que en las paginas del estudiante).
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

/**
 * Paginas del asesor financiero (cola, reclamo, detalle y rechazo) y la lectura de direccion
 * academica (Story 5.9). Cada ruta pasa por `requerirRol`: sin sesion -> /login, otro rol -> 403.
 * Un recurso que no existe o no es visible para el asesor da el mismo 404 (regla P5).
 */
function crearRutasAsesor({ servicioAsesor, servicioDireccion, autenticacion, csrf }) {
  const { requerirRol, obtenerUsuario, obtenerIdSesion } = autenticacion;
  const tokenDe = (req) => csrf.generar(obtenerIdSesion(req));

  // Misma envoltura que las paginas del estudiante: 401 -> /login; el resto de 4xx -> pagina de error.
  function pagina(rol, manejador) {
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
  }

  const asesor = (manejador) => pagina('asesor_financiero', manejador);
  const direccion = (manejador) => pagina('direccion_academica', manejador);

  async function mostrarDetalle(contexto, estado = 200, extra = {}) {
    const detalle = await servicioAsesor.obtenerParaAsesor(contexto.usuario, contexto.params.id);
    if (!detalle) throw errorHttp(404, 'RECURSO_NO_ENCONTRADO');
    responderHtml(
      contexto.res,
      estado,
      vistaDetalleAsesor({ usuario: contexto.usuario, csrf: contexto.csrf, detalle, ...extra }),
    );
  }

  const cola = asesor(async (contexto) => {
    const solicitudes = await servicioAsesor.listarCola(contexto.usuario);
    responderHtml(contexto.res, 200, vistaCola({ usuario: contexto.usuario, csrf: contexto.csrf, cola: solicitudes }));
  });

  const reclamar = asesor(async (contexto) => {
    const { id } = contexto.params;
    await servicioAsesor.reclamar(contexto.usuario, id);
    return redirigir(contexto.res, `/asesor/solicitudes/${encodeURIComponent(id)}`);
  });

  const detalle = asesor((contexto) => mostrarDetalle(contexto));

  const rechazar = asesor(async (contexto) => {
    const campos = await leerCampos(contexto.leerCuerpo);
    try {
      await servicioAsesor.rechazar(contexto.usuario, contexto.params.id, { motivo: campos.motivo });
      return redirigir(contexto.res, '/asesor/cola');
    } catch (error) {
      if (error.codigo !== 'DATOS_INVALIDOS') throw error;
      return mostrarDetalle(contexto, 400, {
        valorMotivo: campos.motivo,
        errorMotivo: error.errores.motivo,
        resumenErrores: {
          titulo: 'No se pudo rechazar la solicitud',
          elementos: [{ campo: 'motivo', mensaje: error.errores.motivo }],
        },
      });
    }
  });

  const resumenDireccion = direccion(async (contexto) => {
    const resumenSolicitud = await servicioDireccion.obtenerResumen(contexto.usuario, contexto.params.id);
    if (!resumenSolicitud) throw errorHttp(404, 'RECURSO_NO_ENCONTRADO');
    responderHtml(
      contexto.res,
      200,
      vistaResumenDireccion({ usuario: contexto.usuario, csrf: contexto.csrf, resumenSolicitud }),
    );
  });

  return [
    ['GET', '/asesor/cola', cola],
    ['POST', '/asesor/solicitudes/:id/reclamar', reclamar],
    ['GET', '/asesor/solicitudes/:id', detalle],
    ['POST', '/asesor/solicitudes/:id/rechazar', rechazar],
    ['GET', '/direccion/solicitudes/:id', resumenDireccion],
  ];
}

module.exports = { crearRutasAsesor };
