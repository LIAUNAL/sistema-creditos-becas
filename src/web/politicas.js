'use strict';

// Las politicas viven en src/app (la capa de aplicacion no depende de src/web); este archivo las
// reexporta para conservar la ruta historica que usan las pruebas y la capa web.
module.exports = require('../app/politicas');
