'use strict';

const { html } = require('./html');
const { responderJson, responderHtml, redirigir } = require('./respuestas');
const { crearEnvoltorioPagina, leerCampos } = require('./paginaProtegida');
const { vistaListadoBecas, vistaFormularioBeca, vistaEstadoBeca } = require('./vistasBecas');

// Los datos de la solicitud de beca llegan como JSON o como formulario; los casos de uso validan cada
// campo, aqui solo se descarta lo que no es un objeto plano.
async function leerDatos(leerCuerpo) {
  const cuerpo = await leerCuerpo();
  return cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? cuerpo : {};
}

/**
 * API JSON de la solicitud de beca (Story 5.11). Todas las rutas van tras `requerirSesion`; el rol
 * `estudiante` y la propiedad del recurso los decide el caso de uso (otro rol -> 403, ajena -> 404).
 * El CSRF lo aplica el servidor a todo POST. Story 5.13 (P13): ademas, las pantallas HTML del estudiante
 * (`/becas`), que solo llaman a los mismos casos de uso del servicio: no hay logica de negocio nueva aqui.
 */
function crearRutasBecas({ servicioBecas, autenticacion, csrf }) {
  const { requerirSesion } = autenticacion;
  const pagina = crearEnvoltorioPagina({ autenticacion, csrf, rol: 'estudiante' });
  const ubicacion = (id) => `/api/becas/solicitudes/${encodeURIComponent(id)}`;

  const presentar = requerirSesion(async ({ res, usuario, leerCuerpo }) => {
    try {
      const vista = await servicioBecas.presentarSolicitudBeca(usuario, await leerDatos(leerCuerpo));
      res.setHeader('Location', ubicacion(vista.id));
      return responderJson(res, 201, vista);
    } catch (error) {
      // 409: el cuerpo apunta a la solicitud existente del mismo periodo.
      if (error?.codigo !== 'SOLICITUD_BECA_EXISTENTE') throw error;
      res.setHeader('Location', ubicacion(error.solicitudId));
      return responderJson(res, 409, { codigo: error.codigo, id: error.solicitudId });
    }
  });

  const consultar = requerirSesion(({ usuario, params }) => servicioBecas.obtenerSolicitudBeca(usuario, params.id));

  const completar = requerirSesion(async ({ usuario, params, leerCuerpo }) =>
    servicioBecas.completarSolicitudBeca(usuario, params.id, await leerDatos(leerCuerpo)),
  );

  // ------------------------------------------------------------ Paginas HTML del estudiante

  const elementosDe = (errores) => Object.entries(errores).map(([campo, mensaje]) => ({ campo, mensaje }));

  const listarPagina = pagina(async ({ res, usuario, csrf: token }) => {
    const solicitudes = await servicioBecas.listarMisSolicitudesBeca(usuario);
    responderHtml(res, 200, vistaListadoBecas({ usuario, csrf: token, solicitudes }));
  });

  const mostrarFormulario = (contexto, estado, extra = {}) =>
    responderHtml(
      contexto.res,
      estado,
      vistaFormularioBeca({ usuario: contexto.usuario, csrf: contexto.csrf, ...extra }),
    );

  const formularioNuevo = pagina((contexto) => mostrarFormulario(contexto, 200));

  const crearPagina = pagina(async (contexto) => {
    const campos = await leerCampos(contexto.leerCuerpo);
    try {
      const vista = await servicioBecas.presentarSolicitudBeca(contexto.usuario, campos);
      return redirigir(contexto.res, `/becas/${encodeURIComponent(vista.id)}`);
    } catch (error) {
      if (error?.codigo === 'DATOS_INVALIDOS') {
        return mostrarFormulario(contexto, 400, { valores: campos, errores: error.errores });
      }
      if (error?.codigo === 'SOLICITUD_BECA_EXISTENTE') {
        const aviso = html`Ya tiene una solicitud de beca para ese periodo. <a href="/becas/${encodeURIComponent(error.solicitudId)}">Ver la solicitud existente</a>.`;
        return mostrarFormulario(contexto, 409, { valores: campos, avisos: [aviso] });
      }
      throw error;
    }
  });

  const mostrarEstado = async (contexto, estado = 200, extra = {}) => {
    const solicitud = await servicioBecas.obtenerSolicitudBeca(contexto.usuario, contexto.params.id);
    responderHtml(
      contexto.res,
      estado,
      vistaEstadoBeca({ usuario: contexto.usuario, csrf: contexto.csrf, solicitud, ...extra }),
    );
  };

  const estadoPagina = pagina((contexto) => mostrarEstado(contexto));

  const completarPagina = pagina(async (contexto) => {
    const campos = await leerCampos(contexto.leerCuerpo);
    const { id } = contexto.params;
    try {
      await servicioBecas.completarSolicitudBeca(contexto.usuario, id, campos);
      return redirigir(contexto.res, `/becas/${encodeURIComponent(id)}`);
    } catch (error) {
      if (error?.codigo !== 'DATOS_INVALIDOS') throw error;
      return mostrarEstado(contexto, 400, {
        valores: campos,
        errores: error.errores,
        resumenErrores: { titulo: 'No se pudieron completar los datos', elementos: elementosDe(error.errores) },
      });
    }
  });

  return [
    ['GET', '/becas', listarPagina],
    // Antes de `/becas/:id`: el router toma la primera ruta que coincide.
    ['GET', '/becas/nueva', formularioNuevo],
    ['POST', '/becas', crearPagina],
    ['GET', '/becas/:id', estadoPagina],
    ['POST', '/becas/:id/completar', completarPagina],
    ['POST', '/api/becas/solicitudes', presentar],
    ['GET', '/api/becas/solicitudes/:id', consultar],
    ['POST', '/api/becas/solicitudes/:id/completar', completar],
  ];
}

module.exports = { crearRutasBecas };
