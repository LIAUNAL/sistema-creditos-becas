'use strict';

const { umbralMoraDesdeEntorno } = require('../app/servicioReportes');
const { intervaloDesdeEntorno } = require('../infra/planificador');
const { crearCsrf } = require('./csrf');

const PUERTO_POR_DEFECTO = 3000;

function puertoDesdeEntorno(valor) {
  if (valor === undefined || valor === '') return PUERTO_POR_DEFECTO;
  const puerto = /^\d+$/.test(valor) ? Number(valor) : Number.NaN;
  // 0 pide un puerto efimero al sistema operativo (el arranque imprime el puerto real).
  if (!Number.isInteger(puerto) || puerto < 0 || puerto > 65535) {
    throw new Error(`PORT inválido: ${valor} (entero de 0 a 65535)`);
  }
  return puerto;
}

function plazoDesdeEntorno(valor) {
  if (valor === undefined || valor === '') return undefined;
  if (!/^\d+$/.test(valor)) throw new Error(`VENCIMIENTOS_PLAZO_DIAS inválido: ${valor} (entero de días)`);
  return { plazoConfirmacionDias: Number(valor) };
}

/**
 * Lee y valida TODA la configuracion de arranque desde el entorno, sin abrir la base ni el puerto.
 * Cualquier valor invalido lanza un `Error` con un mensaje de una sola linea; `main.js` lo imprime y
 * sale con codigo 1 antes de escuchar. Variables: PORT, CSRF_SECRET, VENCIMIENTOS_PLAZO_DIAS,
 * VENCIMIENTOS_INTERVALO_MS, VENCIMIENTOS_AL_INICIAR y UMBRAL_MORA_DEFECTO.
 */
function leerConfiguracion(entorno = process.env) {
  return {
    puerto: puertoDesdeEntorno(entorno.PORT),
    csrf: crearCsrf({ secreto: entorno.CSRF_SECRET }),
    vencimientos: plazoDesdeEntorno(entorno.VENCIMIENTOS_PLAZO_DIAS),
    reportes: { umbralMoraDefecto: umbralMoraDesdeEntorno(entorno.UMBRAL_MORA_DEFECTO) },
    intervaloVencimientosMs: intervaloDesdeEntorno(entorno.VENCIMIENTOS_INTERVALO_MS),
    revisarVencimientosAlIniciar: entorno.VENCIMIENTOS_AL_INICIAR !== 'false',
  };
}

module.exports = { leerConfiguracion, PUERTO_POR_DEFECTO };
