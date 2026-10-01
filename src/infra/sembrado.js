'use strict';

const crypto = require('node:crypto');
const { abrirBaseDeDatos } = require('./baseDeDatos');
const { ejecutarMigraciones } = require('./migraciones');
const { hashearContrasena } = require('./contrasenas');

const ROLES = Object.freeze(['estudiante', 'asesor_financiero', 'comite_becas', 'direccion_academica']);

const VARIABLE_POR_ROL = Object.freeze({
  estudiante: 'SEED_PASSWORD_ESTUDIANTE',
  asesor_financiero: 'SEED_PASSWORD_ASESOR_FINANCIERO',
  comite_becas: 'SEED_PASSWORD_COMITE_BECAS',
  direccion_academica: 'SEED_PASSWORD_DIRECCION_ACADEMICA',
});

// Siembra un usuario por rol (nombre_usuario = rol). Sin contrasenas por defecto en el codigo:
// se toma la variable de entorno o se genera una aleatoria que se devuelve una sola vez.
// Idempotente: un usuario existente se conserva intacto.
async function sembrarUsuarios({ db, entorno = process.env }) {
  const existe = db.prepare('SELECT 1 FROM usuarios WHERE nombre_usuario = ?');
  const insertar = db.prepare(
    'INSERT INTO usuarios (nombre_usuario, hash_contrasena, rol, activo) VALUES (?, ?, ?, 1)',
  );
  const resultado = [];
  for (const rol of ROLES) {
    if (existe.get(rol)) {
      resultado.push({ nombre_usuario: rol, rol, creado: false });
      continue;
    }
    const configurada = entorno[VARIABLE_POR_ROL[rol]];
    const contrasena = configurada || crypto.randomBytes(18).toString('base64url');
    insertar.run(rol, await hashearContrasena(contrasena), rol);
    const fila = { nombre_usuario: rol, rol, creado: true };
    if (!configurada) fila.contrasenaGenerada = contrasena;
    resultado.push(fila);
  }
  return resultado;
}

async function main() {
  const db = abrirBaseDeDatos();
  try {
    ejecutarMigraciones(db);
    const resultado = await sembrarUsuarios({ db });
    for (const fila of resultado) {
      if (!fila.creado) {
        console.log(`${fila.nombre_usuario}: ya existia, sin cambios`);
      } else if (fila.contrasenaGenerada) {
        console.log(`${fila.nombre_usuario}: creado con contrasena generada (se muestra una sola vez): ${fila.contrasenaGenerada}`);
      } else {
        console.log(`${fila.nombre_usuario}: creado con la contrasena de ${VARIABLE_POR_ROL[fila.rol]}`);
      }
    }
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { sembrarUsuarios, ROLES };
