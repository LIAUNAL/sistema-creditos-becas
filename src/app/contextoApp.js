'use strict';

const { crearAuditoria } = require('../infra/auditoria');
const { crearAsignaciones } = require('../infra/asignaciones');
const { crearNotificadorColector } = require('../infra/notificadorColector');
const { crearRepositorioSolicitudesSqlite } = require('../infra/repositorios/repositorioSolicitudesSqlite');
const { crearRepositorioDocumentosSqlite } = require('../infra/repositorios/repositorioDocumentosSqlite');
const { crearRepositorioDecisionesSqlite } = require('../infra/repositorios/repositorioDecisionesSqlite');
const { RegistroSolicitudCredito } = require('../solicitud-credito/registroSolicitudCredito');
const { EnvioSolicitudCredito } = require('../solicitud-credito/envioSolicitud');
const { DecisionAsesorFinanciero } = require('../solicitud-credito/decisionAsesor');
// Las politicas de visibilidad (P5) viven en la capa web; son funciones puras sobre asignaciones.
const { crearPoliticas } = require('../web/politicas');
const { crearServicioSolicitudes } = require('./servicioSolicitudes');
const { crearServicioAsesor, crearServicioDireccion } = require('./servicioAsesor');

/**
 * Construye UNA sola vez las piezas de larga vida de la aplicacion: colector de notificaciones,
 * repositorios SQLite, modulos de negocio reales, asignaciones y politicas. Los casos de uso
 * (servicios) crean su propia unidad de trabajo en cada llamada.
 */
function crearContextoApp({ db, reloj, auditoria = crearAuditoria({ db, reloj }) }) {
  const colector = crearNotificadorColector();
  const repositorios = {
    solicitudes: crearRepositorioSolicitudesSqlite({ db }),
    documentos: crearRepositorioDocumentosSqlite({ db }),
    decisiones: crearRepositorioDecisionesSqlite({ db }),
  };
  const registro = new RegistroSolicitudCredito({ repositorio: repositorios.solicitudes });
  const envio = new EnvioSolicitudCredito({ registro, notificador: colector, repositorio: repositorios.documentos });
  const decision = new DecisionAsesorFinanciero({
    registro,
    notificador: colector,
    reloj: () => reloj.ahora(),
    repositorio: repositorios.decisiones,
  });
  const asignaciones = crearAsignaciones({ db, reloj, auditoria });
  const politicas = crearPoliticas({ asignaciones });
  const servicioSolicitudes = crearServicioSolicitudes({
    db,
    reloj,
    colector,
    registro,
    envio,
    repositorios,
    politicas,
  });
  const piezas = { db, reloj, auditoria, colector, registro, envio, decision, repositorios, asignaciones, politicas };
  const servicioAsesor = crearServicioAsesor(piezas);
  const servicioDireccion = crearServicioDireccion(piezas);
  return {
    colector,
    repositorios,
    registro,
    envio,
    decision,
    asignaciones,
    politicas,
    servicioSolicitudes,
    servicioAsesor,
    servicioDireccion,
  };
}

module.exports = { crearContextoApp };
