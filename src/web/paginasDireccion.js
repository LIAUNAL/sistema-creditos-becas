'use strict';

const { responderHtml, redirigir } = require('./respuestas');
const { crearEnvoltorioPagina, leerCampos } = require('./paginaProtegida');
const { vistaInicioDireccion } = require('./vistasBecas');
const { vistaReportes } = require('./vistasReportes');
const { marcadosDeConsulta } = require('./vistasVencimientos');
const { parsearUmbral } = require('../app/servicioReportes');

/**
 * Aterrizaje de direccion academica (Story 5.13), revision manual de vencidos (Story 5.15) y reportes
 * (Story 5.17). Las paginas solo muestran cantidades, periodos, tasas y umbrales, nunca datos socioeconomicos
 * ni identificadores de estudiantes. Solo el rol `direccion_academica`: sin sesion -> /login (401 en la API),
 * otro rol -> 403.
 *
 * `POST /direccion/vencimientos/revisar` corre la revision (CSRF verificado por el servidor) y responde 303 a
 * `/direccion?marcados=N` (post/redirect/get).
 *
 * `GET /direccion/reportes?periodo=` muestra el reporte consolidado y la alerta de mora del periodo (por
 * defecto, el mas reciente); `POST /direccion/reportes/umbral` guarda el umbral del periodo y responde 303 al
 * mismo periodo (400 con resumen de errores si el umbral o el periodo no son validos).
 * `GET /api/reportes/consolidado?periodo=` devuelve los mismos agregados en JSON.
 */
function crearRutasDireccion({ autenticacion, csrf, servicioVencimientos, servicioReportes }) {
  const { requerirRol } = autenticacion;
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

  // ------------------------------------------------------------ Reportes (Story 5.17)

  // `?periodo=` ausente o vacio -> el periodo mas reciente con datos.
  const periodoSolicitado = (url) => (url.searchParams.get('periodo') ?? '').trim();

  // `solicitado` vacio: el mas reciente; sin ningun periodo con datos el reporte no se arma (periodo `null`).
  async function mostrarReporte(contexto, solicitado, estado = 200, extra = {}) {
    const { usuario } = contexto;
    const periodos = servicioReportes.listarPeriodos(usuario);
    let periodo = solicitado === '' ? (periodos[0] ?? null) : solicitado;
    let reporte = null;
    let mora = null;
    let resto = extra;
    let estadoFinal = estado;
    try {
      if (periodo !== null) {
        reporte = servicioReportes.generarReporte(usuario, periodo);
        mora = servicioReportes.evaluarAlertaMora(usuario, periodo);
      }
    } catch (error) {
      if (error?.codigo !== 'DATOS_INVALIDOS') throw error;
      periodo = null;
      estadoFinal = 400;
      resto = {
        resumenErrores: { titulo: 'No se pudo abrir el reporte', elementos: [{ mensaje: error.errores.periodo }] },
      };
    }
    return responderHtml(
      contexto.res,
      estadoFinal,
      vistaReportes({ usuario, csrf: contexto.csrf, periodo, periodos, reporte, mora, ...resto }),
    );
  }

  const reportes = pagina((contexto) => mostrarReporte(contexto, periodoSolicitado(contexto.url)));

  const guardarUmbral = pagina(async (contexto) => {
    const campos = await leerCampos(contexto.leerCuerpo);
    try {
      const { periodoAcademico } = servicioReportes.configurarUmbral(
        contexto.usuario,
        campos.periodo,
        parsearUmbral(campos.umbral),
      );
      return redirigir(contexto.res, `/direccion/reportes?periodo=${encodeURIComponent(periodoAcademico)}`);
    } catch (error) {
      if (error?.codigo !== 'DATOS_INVALIDOS') throw error;
      const elementos = Object.entries(error.errores).map(([campo, mensaje]) => ({
        ...(campo === 'umbral' ? { campo: 'umbral' } : {}),
        mensaje,
      }));
      return mostrarReporte(contexto, (campos.periodo ?? '').trim(), 400, {
        valores: campos,
        errores: error.errores,
        resumenErrores: { titulo: 'No se pudo guardar el umbral', elementos },
      });
    }
  });

  // Los mismos agregados en JSON; sin periodo, el mas reciente (400 si aun no hay ninguno).
  const consolidado = requerirRol('direccion_academica')(({ usuario, url }) => {
    const periodo = periodoSolicitado(url) || (servicioReportes.listarPeriodos(usuario)[0] ?? '');
    const reporte = servicioReportes.generarReporte(usuario, periodo);
    const { tasaMora, umbral, origenUmbral, alerta, sinPeriodo } = servicioReportes.evaluarAlertaMora(usuario, periodo);
    return { ...reporte, mora: { tasaMora, umbral, origenUmbral, alerta: alerta !== null, sinPeriodo } };
  });

  return [
    ['GET', '/direccion', inicio],
    ['POST', '/direccion/vencimientos/revisar', revisarVencimientos],
    ['GET', '/direccion/reportes', reportes],
    ['POST', '/direccion/reportes/umbral', guardarUmbral],
    ['GET', '/api/reportes/consolidado', consolidado],
  ];
}

module.exports = { crearRutasDireccion };
