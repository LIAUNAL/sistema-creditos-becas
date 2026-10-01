'use strict';

const migracion001 = require('./001-audit-log');
const migracion002 = require('./002-usuarios-sesiones');
const migracion003 = require('./003-asignaciones');
const migracion004 = require('./004-notifications');

// Lista ordenada por version. Las migraciones aplicadas no se editan: se agregan nuevas.
const MIGRACIONES = [migracion001, migracion002, migracion003, migracion004];

module.exports = { MIGRACIONES };
