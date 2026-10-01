'use strict';

const { responderHtml, redirigir } = require('./respuestas');
const { crearEnvoltorioPagina } = require('./paginaProtegida');
const { vistaAvisos } = require('./vistasAvisos');

/**
 * Bandeja de avisos (Story 5.16). Cualquier usuario con sesion abre `/avisos`: el servicio entrega solo los avisos
 * que le pertenecen (asesor y direccion, ninguno). `POST /avisos/:id/leer` (CSRF lo exige el servidor) marca un
 * aviso propio y vuelve a la bandeja (PRG); uno ajeno o inexistente es 404. No hay API JSON ni cambios de negocio.
 */
function crearRutasAvisos({ servicioAvisos, autenticacion, csrf }) {
  const pagina = crearEnvoltorioPagina({ autenticacion, csrf });

  const bandeja = pagina(({ res, usuario, csrf: token }) =>
    responderHtml(res, 200, vistaAvisos({ usuario, csrf: token, avisos: servicioAvisos.listarAvisos(usuario) })),
  );

  const leer = pagina(({ res, usuario, params }) => {
    servicioAvisos.marcarLeido(usuario, params.id);
    return redirigir(res, '/avisos');
  });

  return [
    ['GET', '/avisos', bandeja],
    ['POST', '/avisos/:id/leer', leer],
  ];
}

module.exports = { crearRutasAvisos };
