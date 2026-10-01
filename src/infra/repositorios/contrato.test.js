'use strict';

const { abrirBaseDeDatos } = require('../baseDeDatos');
const { ejecutarMigraciones } = require('../migraciones');
const { enTransaccion } = require('../transaccion');
const { crearUnidadDeTrabajo } = require('../unidadDeTrabajo');
const {
  crearRepositorioSolicitudesEnMemoria,
  crearRepositorioDocumentosEnMemoria,
  crearRepositorioDecisionesEnMemoria,
} = require('../../solicitud-credito/repositoriosEnMemoria');
const { crearRepositorioSolicitudesSqlite } = require('./repositorioSolicitudesSqlite');
const { crearRepositorioDocumentosSqlite } = require('./repositorioDocumentosSqlite');
const { crearRepositorioDecisionesSqlite } = require('./repositorioDecisionesSqlite');
const { definirSuiteDeContrato } = require('./contrato');

function fabricaEnMemoria() {
  return {
    repositorios: {
      solicitudes: crearRepositorioSolicitudesEnMemoria(),
      documentos: crearRepositorioDocumentosEnMemoria(),
      decisiones: crearRepositorioDecisionesEnMemoria(),
    },
    ciclo: (fn) => fn(),
  };
}

function fabricaSqlite() {
  const db = abrirBaseDeDatos({ ruta: ':memory:' });
  ejecutarMigraciones(db);
  return {
    repositorios: {
      solicitudes: crearRepositorioSolicitudesSqlite({ db }),
      documentos: crearRepositorioDocumentosSqlite({ db }),
      decisiones: crearRepositorioDecisionesSqlite({ db }),
    },
    // Un ciclo SQLite es un caso de uso: unidad de trabajo nueva y volcado en una transaccion.
    ciclo(fn) {
      const unidad = crearUnidadDeTrabajo();
      const resultado = unidad.correr(fn);
      enTransaccion(db, () => unidad.volcar(db));
      return resultado;
    },
  };
}

definirSuiteDeContrato('memoria', fabricaEnMemoria);
definirSuiteDeContrato('sqlite', fabricaSqlite);
