'use strict';

const { iniciarServidor } = require('./servidor');
const { abrirBaseDeDatos } = require('../infra/baseDeDatos');
const { ejecutarMigraciones } = require('../infra/migraciones');
const { crearAuditoria } = require('../infra/auditoria');
const { relojSistema } = require('../infra/reloj');
const { crearAplicacionWeb } = require('./aplicacionWeb');
const { leerConfiguracion } = require('./configuracion');
const { iniciarPlanificadorVencimientos } = require('../infra/planificador');

async function main() {
  // Story 5.18: toda la configuracion se valida ANTES de abrir la base o el puerto (PORT, CSRF_SECRET,
  // VENCIMIENTOS_*, UMBRAL_MORA_DEFECTO). Un valor invalido sale con codigo 1 sin haber escuchado.
  const configuracion = leerConfiguracion(process.env);
  const { puerto, csrf, vencimientos, reportes } = configuracion;

  const db = abrirBaseDeDatos(); // usa DB_PATH
  ejecutarMigraciones(db);
  const auditoria = crearAuditoria({ db, reloj: relojSistema });
  if (csrf.usaSecretoAleatorio) {
    console.warn('CSRF_SECRET no definido: secreto aleatorio por proceso (solo una instancia; los tokens caducan al reiniciar)');
  }
  // Identidad + casos de uso (repositorios SQLite, colector, modulos reales) + paginas.
  const aplicacion = crearAplicacionWeb({ db, reloj: relojSistema, csrf, auditoria, vencimientos, reportes });

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
    intervaloMs: configuracion.intervaloVencimientosMs,
    ejecutarAlIniciar: configuracion.revisarVencimientosAlIniciar,
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
