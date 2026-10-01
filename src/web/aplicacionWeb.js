'use strict';

const { crearAuditoria } = require('../infra/auditoria');
const { crearContextoApp } = require('../app/contextoApp');
const { crearAutenticacion } = require('./autenticacion');
const { crearCsrf } = require('./csrf');
const { crearRutasPaginas } = require('./paginas');
const { crearRutasAsesor } = require('./paginasAsesor');
const { crearRutasBecas } = require('./paginasBecas');
const { crearRutasComite } = require('./paginasComite');
const { crearRutasDireccion } = require('./paginasDireccion');

/**
 * Compone la aplicacion web: identidad (login/sesion/CSRF) + casos de uso + paginas.
 * Devuelve `{ rutas, opcionesServidor }` listos para `iniciarServidor`. `main.js` y las pruebas
 * usan exactamente este cableado.
 */
function crearAplicacionWeb({ db, reloj, csrf = crearCsrf(), auditoria = crearAuditoria({ db, reloj }), vencimientos }) {
  const autenticacion = crearAutenticacion({ db, reloj, auditoria, csrf });
  const contexto = crearContextoApp({ db, reloj, auditoria, vencimientos });
  const paginas = crearRutasPaginas({ servicio: contexto.servicioSolicitudes, autenticacion, csrf });
  const paginasAsesor = crearRutasAsesor({
    servicioAsesor: contexto.servicioAsesor,
    servicioCondiciones: contexto.servicioCondiciones,
    servicioDesembolsos: contexto.servicioDesembolsos,
    servicioDireccion: contexto.servicioDireccion,
    servicioVencimientos: contexto.servicioVencimientos,
    autenticacion,
    csrf,
  });
  const rutasBecas = crearRutasBecas({ servicioBecas: contexto.servicioBecas, autenticacion, csrf });
  const rutasComite = crearRutasComite({ servicioComite: contexto.servicioComite, autenticacion, csrf });
  const rutasDireccion = crearRutasDireccion({ servicioVencimientos: contexto.servicioVencimientos, autenticacion, csrf });
  return {
    rutas: [
      ...autenticacion.rutas,
      ...paginas,
      ...paginasAsesor,
      ...rutasBecas,
      ...rutasComite,
      ...rutasDireccion,
    ],
    opcionesServidor: autenticacion.opcionesServidor,
    autenticacion,
    contexto,
  };
}

module.exports = { crearAplicacionWeb };
