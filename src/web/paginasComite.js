'use strict';

const { mapearError } = require('./errores');
const { responderHtml, redirigir } = require('./respuestas');
const { vistaColaComite, vistaError } = require('./vistas');

/**
 * Comite de becas (Story 5.12). API JSON bajo `/api/comite` y una pagina minima `/comite` que lista la cola
 * (las pantallas completas llegan en P13). Todas las rutas van tras `requerirRol('comite_becas')`: sin
 * sesion -> 401 (la pagina redirige a /login), otro rol -> 403. Un caso ajeno se abre como 404 y se
 * decide como 403; el CSRF lo aplica el servidor a todo POST.
 */
function crearRutasComite({ servicioComite, autenticacion, csrf }) {
  const { requerirRol, obtenerUsuario, obtenerIdSesion } = autenticacion;
  const tokenDe = (req) => csrf.generar(obtenerIdSesion(req));

  const cola = requerirRol('comite_becas')(({ usuario }) => servicioComite.listarColaComite(usuario));

  const abrir = requerirRol('comite_becas')(({ usuario, params }) =>
    servicioComite.obtenerCasoComite(usuario, params.id),
  );

  // Solo se toman `decision` y `comentario`; el modulo valida su contenido (400 si no son validos).
  const decidir = requerirRol('comite_becas')(async ({ usuario, params, leerCuerpo }) => {
    const cuerpo = await leerCuerpo();
    const datos = cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? cuerpo : {};
    return servicioComite.registrarDecisionComite(usuario, params.id, {
      decision: datos.decision,
      comentario: datos.comentario,
    });
  });

  // Pagina HTML: 401 -> /login; el resto de 4xx -> pagina de error (igual que las paginas del asesor).
  const protegida = requerirRol('comite_becas')(async ({ req, res, usuario }) => {
    const casos = await servicioComite.listarColaComite(usuario);
    responderHtml(res, 200, vistaColaComite({ usuario, csrf: tokenDe(req), cola: casos }));
  });
  const pagina = async (contexto) => {
    try {
      return await protegida(contexto);
    } catch (error) {
      if (error?.estadoHttp === 401) return redirigir(contexto.res, '/login');
      const { estado } = mapearError(error);
      if (estado < 400 || estado >= 500) throw error;
      const usuario = await obtenerUsuario(contexto.req);
      const token = usuario ? tokenDe(contexto.req) : undefined;
      return responderHtml(contexto.res, estado, vistaError({ estado, usuario, csrf: token }));
    }
  };

  return [
    ['GET', '/comite', pagina],
    ['GET', '/api/comite/cola', cola],
    ['GET', '/api/comite/casos/:id', abrir],
    ['POST', '/api/comite/casos/:id/decision', decidir],
  ];
}

module.exports = { crearRutasComite };
