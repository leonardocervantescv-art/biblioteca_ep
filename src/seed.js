const bcrypt = require('bcryptjs');
const config = require('./config/env');
const { initDatabase, getPool } = require('./config/database');
const usuarioModel = require('./models/usuario.model');
const campusModel = require('./models/campus.model');

// -------------------------------------------------------------------------
//  Bootstrap de la cuenta de administrador.
//
//  El sistema no siembra libros, lectores ni préstamos: toda esa información
//  se captura desde la aplicación y vive únicamente en la base de datos.
//
//  Lo único que se necesita para arrancar es una cuenta con la que iniciar
//  sesión. Si no existe ningún usuario, se crea el administrador con los
//  datos del archivo .env (ADMIN_NOMBRE / ADMIN_EMAIL / ADMIN_PASSWORD).
// -------------------------------------------------------------------------
async function ensureAdmin() {
  if ((await usuarioModel.contar()) > 0) return; // ya existe al menos un administrador

  const { nombre, email, password } = config.admin;
  if (!email || !password) {
    throw new Error('No hay usuarios: define ADMIN_EMAIL y ADMIN_PASSWORD en .env para crear el administrador inicial.');
  }

  // La migración multi-campus siempre deja un campus "principal"; el primer
  // usuario es superadmin (crea campus y administradores de otros campus).
  const campus = await campusModel.buscarPorClave('principal') || await campusModel.primeroActivo();
  await usuarioModel.crear({
    nombre, email, rol: 'superadmin', campusId: campus.id, passwordHash: await bcrypt.hash(password, 10),
  });

  console.log('  Cuenta de administrador creada.');
  console.log(`  Acceso:  ${email}  /  ${password}`);
  console.log('  Cambia la contraseña desde el sistema en cuanto inicies sesión.');
}

if (require.main === module) {
  (async () => {
    await initDatabase();
    await ensureAdmin();
    await getPool().end();
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { ensureAdmin };
