'use strict';

const migracion001 = require('./001-audit-log');

// Lista ordenada por version. Las migraciones aplicadas no se editan: se agregan nuevas.
const MIGRACIONES = [migracion001];

module.exports = { MIGRACIONES };
