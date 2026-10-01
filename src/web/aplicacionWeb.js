'use strict';

const { crearAuditoria } = require('../infra/auditoria');
const { crearContextoApp } = require('../app/contextoApp');
const { crearAutenticacion } = require('./autenticacion');
const { crearCsrf } = require('./csrf');
const { crearRutasPaginas } = require('./paginas');
const { crearRutasAsesor } = require('./paginasAsesor');

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
    servicioDireccion: contexto.servicioDireccion,
    autenticacion,
    csrf,
  });
  return {
    rutas: [...autenticacion.rutas, ...paginas, ...paginasAsesor],
    opcionesServidor: autenticacion.opcionesServidor,
    autenticacion,
    contexto,
  };
}

module.exports = { crearAplicacionWeb };
