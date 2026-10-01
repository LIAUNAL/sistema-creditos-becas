'use strict';

const { responderHtml, redirigir } = require('./respuestas');
const { crearEnvoltorioPagina, leerCampos } = require('./paginaProtegida');
const { vistaColaComite, vistaCasoComite } = require('./vistasBecas');

const CODIGOS_YA_DECIDIDO = Object.freeze(['CASO_NO_EN_COLA', 'BECA_YA_OTORGADA']);
const DECISIONES = Object.freeze(['otorgada', 'denegada']);

/**
 * Comite de becas (Story 5.12 y 5.13). API JSON bajo `/api/comite` y pantallas HTML: cola (`/comite`), detalle
 * del caso (`/comite/casos/:id`) y decision por formulario (`POST /comite/casos/:id/decision`, PRG a `/comite`).
 * Todas las rutas van tras `requerirRol('comite_becas')`: sin sesion -> 401 (la pagina redirige a /login), otro
 * rol -> 403. Un caso ajeno se abre como 404 y se decide como 403; el CSRF lo aplica el servidor a todo POST.
 */
function crearRutasComite({ servicioComite, autenticacion, csrf }) {
  const { requerirRol } = autenticacion;
  const pagina = crearEnvoltorioPagina({ autenticacion, csrf, rol: 'comite_becas' });

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

  // ------------------------------------------------------------ Paginas HTML

  const colaPagina = pagina(async ({ res, usuario, csrf: token }) => {
    const casos = await servicioComite.listarColaComite(usuario);
    responderHtml(res, 200, vistaColaComite({ usuario, csrf: token, cola: casos }));
  });

  const mostrarCaso = async (contexto, estado = 200, extra = {}) => {
    const caso = await servicioComite.obtenerCasoComite(contexto.usuario, contexto.params.id);
    responderHtml(
      contexto.res,
      estado,
      vistaCasoComite({ usuario: contexto.usuario, csrf: contexto.csrf, caso, ...extra }),
    );
  };

  const casoPagina = pagina((contexto) => mostrarCaso(contexto));

  // Errores por campo de un envio invalido. Se calculan solo tras el rechazo del modulo para no alterar el
  // orden de las reglas del servicio (asignacion, estado del caso y despues el contenido).
  function erroresDeEnvio({ decision, comentario }) {
    const errores = {};
    if (!DECISIONES.includes(decision)) errores.decision = 'Elija otorgada o denegada.';
    if (typeof comentario !== 'string' || comentario.trim() === '') {
      errores.comentario = 'Escriba el comentario de la decisión.';
    }
    return errores;
  }

  const decidirPagina = pagina(async (contexto) => {
    const campos = await leerCampos(contexto.leerCuerpo);
    try {
      await servicioComite.registrarDecisionComite(contexto.usuario, contexto.params.id, {
        decision: campos.decision,
        comentario: campos.comentario,
      });
      return redirigir(contexto.res, '/comite');
    } catch (error) {
      if (error?.codigo === 'DECISION_INVALIDA') {
        const errores = erroresDeEnvio(campos);
        const elementos = [
          ...(errores.decision ? [{ campo: 'decision-otorgada', mensaje: errores.decision }] : []),
          ...(errores.comentario ? [{ campo: 'comentario', mensaje: errores.comentario }] : []),
        ];
        return mostrarCaso(contexto, 400, {
          valores: campos,
          errores,
          resumenErrores: { titulo: 'No se pudo registrar la decisión', elementos },
        });
      }
      if (CODIGOS_YA_DECIDIDO.includes(error?.codigo)) {
        return mostrarCaso(contexto, 409, {
          resumenErrores: {
            titulo: 'No se registró la decisión',
            elementos: [{ mensaje: 'El caso ya tiene una decisión registrada y no admite otra.' }],
          },
        });
      }
      throw error;
    }
  });

  return [
    ['GET', '/comite', colaPagina],
    ['GET', '/comite/casos/:id', casoPagina],
    ['POST', '/comite/casos/:id/decision', decidirPagina],
    ['GET', '/api/comite/cola', cola],
    ['GET', '/api/comite/casos/:id', abrir],
    ['POST', '/api/comite/casos/:id/decision', decidir],
  ];
}

module.exports = { crearRutasComite };
