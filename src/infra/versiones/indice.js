'use strict';

const migracion001 = require('./001-audit-log');
const migracion002 = require('./002-usuarios-sesiones');
const migracion003 = require('./003-asignaciones');
const migracion004 = require('./004-notifications');
const migracion005 = require('./005-solicitudes');
const migracion006 = require('./006-condiciones-desembolsos');
const migracion007 = require('./007-becas');
const migracion008 = require('./008-casos-comite');
const migracion009 = require('./009-notificacion-desembolso-vencido');

// Lista ordenada por version. Las migraciones aplicadas no se editan: se agregan nuevas.
const MIGRACIONES = [
  migracion001,
  migracion002,
  migracion003,
  migracion004,
  migracion005,
  migracion006,
  migracion007,
  migracion008,
  migracion009,
];

module.exports = { MIGRACIONES };
