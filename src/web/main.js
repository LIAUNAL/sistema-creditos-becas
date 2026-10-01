'use strict';

const { iniciarServidor } = require('./servidor');
const { abrirBaseDeDatos } = require('../infra/baseDeDatos');
const { ejecutarMigraciones } = require('../infra/migraciones');
const { crearAuditoria } = require('../infra/auditoria');
const { relojSistema } = require('../infra/reloj');
const { crearAutenticacion } = require('./autenticacion');

async function main() {
  const puerto = Number.parseInt(process.env.PORT ?? '3000', 10);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    throw new Error(`PORT inválido: ${process.env.PORT}`);
  }

  const db = abrirBaseDeDatos(); // usa DB_PATH
  ejecutarMigraciones(db);
  const auditoria = crearAuditoria({ db, reloj: relojSistema });
  const autenticacion = crearAutenticacion({ db, reloj: relojSistema, auditoria });

  const { puerto: escucha, cerrar } = await iniciarServidor({
    puerto,
    host: '0.0.0.0',
    rutas: [...autenticacion.rutas],
  });
  console.log(`Servidor escuchando en el puerto ${escucha}`);

  const detener = () => {
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
