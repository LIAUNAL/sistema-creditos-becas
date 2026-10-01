'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { html } = require('./html');
const { errorHttp } = require('./guardias');
const { mapearError } = require('./errores');
const { responderHtml, responderCss, redirigir } = require('./respuestas');
const {
  vistaLogin,
  vistaListado,
  vistaFormularioSolicitud,
  vistaDetalle,
  vistaError,
  etiquetaDocumento,
  etiquetaEstado,
} = require('./vistas');

// Hoja de estilos unica, leida una vez y servida por una ruta explicita: no hay servidor de
// archivos generico, asi que no hay recorrido de rutas posible.
const HOJA_DE_ESTILOS = fs.readFileSync(path.join(__dirname, 'estilos.css'), 'utf8');

// Solo se aceptan campos de texto: un cuerpo JSON con otros tipos no llega a los casos de uso.
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

// Pagina de aterrizaje tras iniciar sesion: el asesor y el comite van a su cola; el resto, como hasta ahora.
const PAGINAS_INICIALES = Object.freeze({ asesor_financiero: '/asesor/cola', comite_becas: '/comite' });
const paginaInicial = (rol) => PAGINAS_INICIALES[rol] ?? '/solicitudes';

const elementosDe =(errores) => Object.entries(errores).map(([campo, mensaje]) => ({ campo, mensaje }));

/**
 * Paginas HTML del flujo del estudiante (Story 5.8). Todas las rutas del estudiante pasan por
 * `requerirRol('estudiante')`; el acceso a cada solicitud lo decide la politica de visibilidad del
 * servicio (un recurso ajeno y uno inexistente dan el mismo 404).
 */
function crearRutasPaginas({ servicio, autenticacion, csrf }) {
  const { requerirRol, obtenerUsuario, obtenerIdSesion } = autenticacion;
  const tokenDe = (req) => csrf.generar(obtenerIdSesion(req));

  // Envuelve un manejador de pagina: sin sesion -> redireccion a /login; errores 4xx -> pagina de
  // error HTML; el resto (5xx) se propaga al mapeo comun, que no filtra detalles.
  function pagina(manejador) {
    const protegido = requerirRol('estudiante')((contexto) =>
      manejador({ ...contexto, csrf: tokenDe(contexto.req) }),
    );
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

  async function mostrarDetalle(contexto, estado = 200, extra = {}) {
    const detalle = await servicio.obtenerSolicitud(contexto.usuario, contexto.params.id);
    if (!detalle) throw errorHttp(404, 'RECURSO_NO_ENCONTRADO');
    responderHtml(
      contexto.res,
      estado,
      vistaDetalle({ usuario: contexto.usuario, csrf: contexto.csrf, detalle, ...extra }),
    );
  }

  const mostrarFormulario = (contexto, estado, extra = {}) =>
    responderHtml(
      contexto.res,
      estado,
      vistaFormularioSolicitud({ usuario: contexto.usuario, csrf: contexto.csrf, ...extra }),
    );

  const listar = pagina(async (contexto) => {
    const solicitudes = await servicio.listarMisSolicitudes(contexto.usuario);
    responderHtml(
      contexto.res,
      200,
      vistaListado({ usuario: contexto.usuario, csrf: contexto.csrf, solicitudes }),
    );
  });

  const formularioNuevo = pagina((contexto) => mostrarFormulario(contexto, 200));

  const crear = pagina(async (contexto) => {
    const campos = await leerCampos(contexto.leerCuerpo);
    try {
      const creada = await servicio.crearSolicitud(contexto.usuario, campos);
      return redirigir(contexto.res, `/solicitudes/${creada.id}`);
    } catch (error) {
      if (error.codigo === 'DATOS_INVALIDOS') {
        return mostrarFormulario(contexto, 400, { valores: campos, errores: error.errores });
      }
      if (error.codigo === 'SOLICITUD_EXISTENTE') {
        const existente = error.solicitudExistente;
        const aviso = html`Ya tiene una solicitud activa para el periodo ${existente.periodoAcademico} (estado ${etiquetaEstado(existente.estado)}). <a href="/solicitudes/${existente.id}">Ver la solicitud existente</a>.`;
        return mostrarFormulario(contexto, 409, { valores: campos, avisos: [aviso] });
      }
      throw error;
    }
  });

  const detalle = pagina((contexto) => mostrarDetalle(contexto));

  const adjuntar = pagina(async (contexto) => {
    const campos = await leerCampos(contexto.leerCuerpo);
    const { id } = contexto.params;
    try {
      await servicio.adjuntarDocumento(contexto.usuario, id, campos);
      return redirigir(contexto.res, `/solicitudes/${id}`);
    } catch (error) {
      const valoresDocumento = { tipo: campos.tipo, nombreArchivo: campos.nombreArchivo };
      if (error.codigo === 'DATOS_INVALIDOS') {
        return mostrarDetalle(contexto, 400, {
          valoresDocumento,
          erroresDocumento: error.errores,
          resumenErrores: { titulo: 'No se pudo adjuntar el documento', elementos: elementosDe(error.errores) },
        });
      }
      if (error.codigo === 'FORMATO_INVALIDO') {
        const mensaje = html`El archivo <strong>${error.nombreArchivo}</strong> tiene un formato no válido. Adjunte un archivo en uno de estos formatos: ${error.formatosPermitidos.join(', ')}.`;
        return mostrarDetalle(contexto, 400, {
          valoresDocumento,
          resumenErrores: { titulo: 'No se pudo adjuntar el documento', elementos: [{ campo: 'nombreArchivo', mensaje }] },
        });
      }
      if (error.codigo === 'ESTADO_INVALIDO') return solicitudYaEnviada(contexto);
      throw error;
    }
  });

  const enviar = pagina(async (contexto) => {
    const { id } = contexto.params;
    try {
      await servicio.confirmarEnvio(contexto.usuario, id);
      return redirigir(contexto.res, `/solicitudes/${id}`);
    } catch (error) {
      if (error.codigo === 'DOCUMENTOS_FALTANTES') {
        const elementos = error.documentosFaltantes.map((tipo) => ({
          mensaje: html`Falta el documento: <strong>${etiquetaDocumento(tipo)}</strong>.`,
        }));
        return mostrarDetalle(contexto, 400, {
          resumenErrores: { titulo: 'No se pudo enviar la solicitud: la solicitud sigue en borrador', elementos },
        });
      }
      if (error.codigo === 'ESTADO_INVALIDO') return solicitudYaEnviada(contexto);
      throw error;
    }
  });

  const solicitudYaEnviada = (contexto) =>
    mostrarDetalle(contexto, 409, {
      resumenErrores: {
        titulo: 'Operación no permitida',
        elementos: [{ mensaje: 'La solicitud ya no está en borrador, por lo que no admite más cambios.' }],
      },
    });

  return [
    [
      'GET',
      '/',
      async ({ req, res }) => {
        const usuario = await obtenerUsuario(req);
        return redirigir(res, usuario ? paginaInicial(usuario.rol) : '/login');
      },
    ],
    [
      'GET',
      '/login',
      async ({ req, res, url }) => {
        const usuario = await obtenerUsuario(req);
        if (usuario?.rol === 'estudiante' || usuario?.rol === 'asesor_financiero' || usuario?.rol === 'comite_becas') {
          return redirigir(res, paginaInicial(usuario.rol));
        }
        return responderHtml(res, 200, vistaLogin({ codigoError: url.searchParams.get('error') ?? undefined }));
      },
    ],
    ['GET', '/estilos.css', ({ res }) => responderCss(res, 200, HOJA_DE_ESTILOS)],
    ['GET', '/solicitudes', listar],
    // Antes de `/solicitudes/:id`: el router toma la primera ruta que coincide.
    ['GET', '/solicitudes/nueva', formularioNuevo],
    ['POST', '/solicitudes', crear],
    ['GET', '/solicitudes/:id', detalle],
    ['POST', '/solicitudes/:id/documentos', adjuntar],
    ['POST', '/solicitudes/:id/enviar', enviar],
  ];
}

module.exports = { crearRutasPaginas };
