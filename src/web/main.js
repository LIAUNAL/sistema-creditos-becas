'use strict';

const { iniciarServidor } = require('./servidor');
const { abrirBaseDeDatos } = require('../infra/baseDeDatos');
const { ejecutarMigraciones } = require('../infra/migraciones');
const { crearAuditoria } = require('../infra/auditoria');
const { relojSistema } = require('../infra/reloj');
const { crearAplicacionWeb } = require('./aplicacionWeb');
const { crearCsrf } = require('./csrf');
const { iniciarPlanificadorVencimientos, intervaloDesdeEntorno } = require('../infra/planificador');

async function main() {
  const puerto = Number.parseInt(process.env.PORT ?? '3000', 10);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    throw new Error(`PORT inválido: ${process.env.PORT}`);
  }

  const db = abrirBaseDeDatos(); // usa DB_PATH
  ejecutarMigraciones(db);
  const auditoria = crearAuditoria({ db, reloj: relojSistema });
  const csrf = crearCsrf(); // usa CSRF_SECRET
  if (csrf.usaSecretoAleatorio) {
    console.warn('CSRF_SECRET no definido: secreto aleatorio por proceso (solo una instancia; los tokens caducan al reiniciar)');
  }
  // Identidad + casos de uso (repositorios SQLite, colector, modulos reales) + paginas del estudiante.
  // Story 5.15: plazo de confirmacion de desembolsos (VENCIMIENTOS_PLAZO_DIAS, por defecto 15 dias).
  const plazoDias = process.env.VENCIMIENTOS_PLAZO_DIAS;
  let vencimientos;
  if (plazoDias !== undefined && plazoDias !== '') {
    if (!/^\d+$/.test(plazoDias)) throw new Error(`VENCIMIENTOS_PLAZO_DIAS inválido: ${plazoDias} (entero de días)`);
    vencimientos = { plazoConfirmacionDias: Number(plazoDias) };
  }
  const aplicacion = crearAplicacionWeb({ db, reloj: relojSistema, csrf, auditoria, vencimientos });

  const { puerto: escucha, cerrar } = await iniciarServidor({
    puerto,
    host: '0.0.0.0',
    rutas: aplicacion.rutas,
    ...aplicacion.opcionesServidor,
  });
  console.log(`Servidor escuchando en el puerto ${escucha}`);

  // Story 5.15: revision diaria de vencidos EN PROCESO (una sola instancia, R5). Corre al iniciar y cada
  // VENCIMIENTOS_INTERVALO_MS (24 h por defecto); VENCIMIENTOS_AL_INICIAR=false omite la corrida de arranque.
  const planificador = iniciarPlanificadorVencimientos({
    revisar: async () => {
      const { marcados } = await aplicacion.contexto.servicioVencimientos.revisarVencimientos();
      if (marcados > 0) console.log(`Revisión de vencidos: ${marcados} desembolso(s) marcado(s) como vencido(s)`);
    },
    intervaloMs: intervaloDesdeEntorno(process.env.VENCIMIENTOS_INTERVALO_MS),
    ejecutarAlIniciar: process.env.VENCIMIENTOS_AL_INICIAR !== 'false',
    alError: (error) => console.error('Revisión de vencidos fallida:', error.message),
  });

  const detener = () => {
    planificador.detener();
    cerrar()
      .then(() => db.close())
      .then(
        () => process.exit(0),
        (error) => {
          console.error(error);
          process.exit(1);
        },
      );
  };
  process.once('SIGINT', detener);
  process.once('SIGTERM', detener);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
