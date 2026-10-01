'use strict';

const { responderHtml, redirigir } = require('./respuestas');
const { crearEnvoltorioPagina } = require('./paginaProtegida');
const { vistaInicioDireccion } = require('./vistasBecas');
const { marcadosDeConsulta } = require('./vistasVencimientos');

/**
 * Aterrizaje de direccion academica (Story 5.13) y revision manual de vencidos (Story 5.15). P17 reemplaza el
 * contenido por los informes consolidados. La pagina solo muestra cantidades y periodos academicos (la mora
 * por periodo), nunca datos socioeconomicos. Solo el rol `direccion_academica`: sin sesion -> /login, otro
 * rol -> 403.
 *
 * `POST /direccion/vencimientos/revisar` corre la revision (CSRF verificado por el servidor) y responde 303 a
 * `/direccion?marcados=N` (post/redirect/get).
 */
function crearRutasDireccion({ autenticacion, csrf, servicioVencimientos }) {
  const pagina = crearEnvoltorioPagina({ autenticacion, csrf, rol: 'direccion_academica' });

  const inicio = pagina(async ({ res, url, usuario, csrf: token }) => {
    const moraPorPeriodo = await servicioVencimientos.consultarMora();
    const marcados = marcadosDeConsulta(url.searchParams.get('marcados'));
    responderHtml(res, 200, vistaInicioDireccion({ usuario, csrf: token, marcados, moraPorPeriodo }));
  });

  const revisarVencimientos = pagina(async ({ res, usuario }) => {
    const { marcados } = await servicioVencimientos.revisarVencimientos({
      actor: { nombre: usuario.nombre_usuario, rol: usuario.rol },
    });
    return redirigir(res, `/direccion?marcados=${marcados}`);
  });

  return [
    ['GET', '/direccion', inicio],
    ['POST', '/direccion/vencimientos/revisar', revisarVencimientos],
  ];
}

module.exports = { crearRutasDireccion };
