'use strict';

const { crearAuditoria } = require('../infra/auditoria');
const { crearAsignaciones } = require('../infra/asignaciones');
const { crearNotificadorColector } = require('../infra/notificadorColector');
const { crearRepositorioSolicitudesSqlite } = require('../infra/repositorios/repositorioSolicitudesSqlite');
const { crearRepositorioDocumentosSqlite } = require('../infra/repositorios/repositorioDocumentosSqlite');
const { crearRepositorioDecisionesSqlite } = require('../infra/repositorios/repositorioDecisionesSqlite');
const { crearRepositorioCalendarioSqlite } = require('../infra/repositorios/repositorioCalendarioSqlite');
const { crearRepositorioCondicionesSqlite } = require('../infra/repositorios/repositorioCondicionesSqlite');
const { crearRepositorioCasosComiteSqlite } = require('../infra/repositorios/repositorioCasosComiteSqlite');
const { crearRevisionComite } = require('../evaluacion-elegibilidad/revisionComite');
const { CalendarioDesembolso } = require('../desembolso/calendarioDesembolso');
const { crearEjecucionDesembolso } = require('../desembolso/ejecucionDesembolso');
const { RegistroSolicitudCredito } = require('../solicitud-credito/registroSolicitudCredito');
const { EnvioSolicitudCredito } = require('../solicitud-credito/envioSolicitud');
const { DecisionAsesorFinanciero } = require('../solicitud-credito/decisionAsesor');
// Las politicas de visibilidad (P5) viven en la capa web; son funciones puras sobre asignaciones.
const { crearPoliticas } = require('../web/politicas');
const { crearServicioSolicitudes } = require('./servicioSolicitudes');
const { crearServicioAsesor, crearServicioDireccion } = require('./servicioAsesor');
const { crearServicioCondiciones, MAXIMO_CUOTAS } = require('./servicioCondiciones');
const { crearServicioDesembolsos } = require('./servicioDesembolsos');
const { crearServicioBecas } = require('./servicioBecas');
const { crearServicioComite } = require('./servicioComite');
const { crearServicioVencimientos } = require('./servicioVencimientos');
const { crearServicioAvisos } = require('./servicioAvisos');

/**
 * Construye UNA sola vez las piezas de larga vida de la aplicacion: colector de notificaciones,
 * repositorios SQLite, modulos de negocio reales, asignaciones y politicas. Los casos de uso
 * (servicios) crean su propia unidad de trabajo en cada llamada.
 */
// `vencimientos` (opcional): `{ plazoConfirmacionDias, plazosPorTipoCredito }` de la revision de vencidos (Story 5.15).
function crearContextoApp({ db, reloj, auditoria = crearAuditoria({ db, reloj }), vencimientos }) {
  const colector = crearNotificadorColector();
  const repositorios = {
    solicitudes: crearRepositorioSolicitudesSqlite({ db }),
    documentos: crearRepositorioDocumentosSqlite({ db }),
    decisiones: crearRepositorioDecisionesSqlite({ db }),
    calendario: crearRepositorioCalendarioSqlite({ db }),
    condiciones: crearRepositorioCondicionesSqlite({ db }),
    casosComite: crearRepositorioCasosComiteSqlite({ db }),
  };
  const calendario = new CalendarioDesembolso({
    repositorio: repositorios.calendario,
    reloj: () => reloj.ahora(),
    maximoCuotas: MAXIMO_CUOTAS,
  });
  const registro = new RegistroSolicitudCredito({ repositorio: repositorios.solicitudes });
  const envio = new EnvioSolicitudCredito({ registro, notificador: colector, repositorio: repositorios.documentos });
  const decision = new DecisionAsesorFinanciero({
    registro,
    notificador: colector,
    reloj: () => reloj.ahora(),
    repositorio: repositorios.decisiones,
  });
  // Story 5.14: modulo real de ejecucion, con el colector (el aviso se guarda en el outbox del caso de uso).
  const ejecucion = crearEjecucionDesembolso({ notificador: colector, reloj: () => reloj.ahora() });
  const revisionComite = crearRevisionComite({
    notificador: colector,
    reloj: () => reloj.ahora(),
    repositorio: repositorios.casosComite,
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
    ejecucion,
  });
  const piezas = {
    db,
    reloj,
    auditoria,
    colector,
    registro,
    envio,
    decision,
    calendario,
    ejecucion,
    repositorios,
    revisionComite,
    asignaciones,
    politicas,
  };
  const servicioAsesor = crearServicioAsesor(piezas);
  const servicioCondiciones = crearServicioCondiciones(piezas);
  const servicioDesembolsos = crearServicioDesembolsos(piezas);
  const servicioDireccion = crearServicioDireccion(piezas);
  const servicioBecas = crearServicioBecas(piezas);
  const servicioComite = crearServicioComite(piezas);
  const servicioVencimientos = crearServicioVencimientos({ ...piezas, opciones: vencimientos });
  const servicioAvisos = crearServicioAvisos(piezas);
  return {
    colector,
    repositorios,
    registro,
    envio,
    decision,
    calendario,
    ejecucion,
    revisionComite,
    asignaciones,
    politicas,
    servicioSolicitudes,
    servicioAsesor,
    servicioCondiciones,
    servicioDesembolsos,
    servicioDireccion,
    servicioBecas,
    servicioComite,
    servicioVencimientos,
    servicioAvisos,
  };
}

module.exports = { crearContextoApp };
