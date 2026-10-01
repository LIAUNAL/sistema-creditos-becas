'use strict';

const { iniciarServidor } = require('./servidor');

async function main() {
  const puerto = Number.parseInt(process.env.PORT ?? '3000', 10);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    throw new Error(`PORT inválido: ${process.env.PORT}`);
  }
  const { puerto: escucha, cerrar } = await iniciarServidor({ puerto, host: '0.0.0.0' });
  console.log(`Servidor escuchando en el puerto ${escucha}`);

  const detener = () => {
    cerrar().then(
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
