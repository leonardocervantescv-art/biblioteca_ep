const bcrypt = require('bcryptjs');
const { initDatabase, query, getPool } = require('./db');
require('dotenv').config();

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
  const [{ n }] = await query('SELECT COUNT(*) AS n FROM usuarios');
  if (n > 0) return; // ya existe al menos un administrador

  const nombre = process.env.ADMIN_NOMBRE;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  const hash = await bcrypt.hash(password, 10);
  await query(
    'INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, "admin")',
    [nombre, email, hash]
  );

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
