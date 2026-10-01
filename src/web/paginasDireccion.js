'use strict';

const { responderHtml } = require('./respuestas');
const { crearEnvoltorioPagina } = require('./paginaProtegida');
const { vistaInicioDireccion } = require('./vistasBecas');

/**
 * Aterrizaje de direccion academica (Story 5.13). Pagina minima y accesible: P17 reemplaza su contenido por los
 * informes consolidados. No lee datos de negocio, asi que no puede exponer informacion socioeconomica.
 * Solo el rol `direccion_academica`: sin sesion -> /login, otro rol -> 403.
 */
function crearRutasDireccion({ autenticacion, csrf }) {
  const pagina = crearEnvoltorioPagina({ autenticacion, csrf, rol: 'direccion_academica' });

  const inicio = pagina(({ res, usuario, csrf: token }) =>
    responderHtml(res, 200, vistaInicioDireccion({ usuario, csrf: token })),
  );

  return [['GET', '/direccion', inicio]];
}

module.exports = { crearRutasDireccion };
