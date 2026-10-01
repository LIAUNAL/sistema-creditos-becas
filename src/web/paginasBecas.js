'use strict';

const { responderJson } = require('./respuestas');

// Los datos de la solicitud de beca llegan como JSON o como formulario; los casos de uso validan cada
// campo, aqui solo se descarta lo que no es un objeto plano.
async function leerDatos(leerCuerpo) {
  const cuerpo = await leerCuerpo();
  return cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? cuerpo : {};
}

/**
 * API JSON de la solicitud de beca (Story 5.11). Todas las rutas van tras `requerirSesion`; el rol
 * `estudiante` y la propiedad del recurso los decide el caso de uso (otro rol -> 403, ajena -> 404).
 * El CSRF lo aplica el servidor a todo POST. Las pantallas HTML llegan en P13.
 */
function crearRutasBecas({ servicioBecas, autenticacion }) {
  const { requerirSesion } = autenticacion;
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

  return [
    ['POST', '/api/becas/solicitudes', presentar],
    ['GET', '/api/becas/solicitudes/:id', consultar],
    ['POST', '/api/becas/solicitudes/:id/completar', completar],
  ];
}

module.exports = { crearRutasBecas };
