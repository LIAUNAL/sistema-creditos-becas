'use strict';

const { crearAuditoria } = require('../infra/auditoria');
const { crearContextoApp } = require('../app/contextoApp');
const { crearAutenticacion } = require('./autenticacion');
const { crearCsrf } = require('./csrf');
const { crearRutasPaginas } = require('./paginas');
const { crearRutasAsesor } = require('./paginasAsesor');
const { crearRutasBecas } = require('./paginasBecas');

/**
 * Compone la aplicacion web: identidad (login/sesion/CSRF) + casos de uso + paginas.
 * Devuelve `{ rutas, opcionesServidor }` listos para `iniciarServidor`. `main.js` y las pruebas
 * usan exactamente este cableado.
 */
function crearAplicacionWeb({ db, reloj, csrf = crearCsrf(), auditoria = crearAuditoria({ db, reloj }) }) {
  const autenticacion = crearAutenticacion({ db, reloj, auditoria, csrf });
  const contexto = crearContextoApp({ db, reloj, auditoria });
  const paginas = crearRutasPaginas({ servicio: contexto.servicioSolicitudes, autenticacion, csrf });
  const paginasAsesor = crearRutasAsesor({
    servicioAsesor: contexto.servicioAsesor,
    servicioCondiciones: contexto.servicioCondiciones,
    servicioDireccion: contexto.servicioDireccion,
    autenticacion,
    csrf,
  });
  const rutasBecas = crearRutasBecas({ servicioBecas: contexto.servicioBecas, autenticacion });
  return {
    rutas: [...autenticacion.rutas, ...paginas, ...paginasAsesor, ...rutasBecas],
    opcionesServidor: autenticacion.opcionesServidor,
    autenticacion,
    contexto,
  };
}

module.exports = { crearAplicacionWeb };
