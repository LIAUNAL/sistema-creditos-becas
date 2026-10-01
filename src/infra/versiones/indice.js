'use strict';

const migracion001 = require('./001-audit-log');
const migracion002 = require('./002-usuarios-sesiones');
const migracion003 = require('./003-asignaciones');
const migracion004 = require('./004-notifications');
const migracion005 = require('./005-solicitudes');
const migracion006 = require('./006-condiciones-desembolsos');

// Lista ordenada por version. Las migraciones aplicadas no se editan: se agregan nuevas.
const MIGRACIONES = [migracion001, migracion002, migracion003, migracion004, migracion005, migracion006];

module.exports = { MIGRACIONES };
