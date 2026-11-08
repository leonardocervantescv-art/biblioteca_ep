const { query } = require('../config/database');

const CON_CAMPUS = `
  SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.campus_id, u.creado_en,
         c.nombre AS campus_nombre, c.clave AS campus_clave, c.activo AS campus_activo
  FROM usuarios u JOIN campus c ON c.id = u.campus_id`;

// Para el login (incluye el hash de la contraseña).
const buscarPorEmail = async (email) => (await query(
  `SELECT u.*, c.nombre AS campus_nombre, c.clave AS campus_clave, c.activo AS campus_activo
   FROM usuarios u JOIN campus c ON c.id = u.campus_id WHERE u.email = ? LIMIT 1`,
  [email]
))[0];

const buscarPorId = async (id) =>
  (await query('SELECT * FROM usuarios WHERE id = ?', [id]))[0];

// Usuario con los datos de su campus, sin el hash (lo usa la autenticación).
const perfilPorId = async (id) => (await query(`${CON_CAMPUS} WHERE u.id = ?`, [id]))[0];

const listar = () => query(`${CON_CAMPUS} ORDER BY c.id, u.nombre`);

const existeEmail = async (email, excluirId) => {
  const rows = excluirId
    ? await query('SELECT id FROM usuarios WHERE email = ? AND id <> ?', [email, excluirId])
    : await query('SELECT id FROM usuarios WHERE email = ?', [email]);
  return rows.length > 0;
};

const actualizarPassword = (id, hash) =>
  query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [hash, id]);

const contar = async () => (await query('SELECT COUNT(*) AS n FROM usuarios'))[0].n;

const contarSuperadminsActivos = async (excluirId) =>
  (await query("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'superadmin' AND activo = 1 AND id <> ?", [excluirId || 0]))[0].n;

async function crear({ nombre, email, passwordHash, rol, campusId }) {
  const result = await query(
    'INSERT INTO usuarios (nombre, email, password_hash, rol, campus_id) VALUES (?, ?, ?, ?, ?)',
    [nombre, email, passwordHash, rol, campusId]
  );
  return result.insertId;
}

const actualizar = (id, { nombre, email, rol, campusId, activo }) =>
  query('UPDATE usuarios SET nombre = ?, email = ?, rol = ?, campus_id = ?, activo = ? WHERE id = ?',
    [nombre, email, rol, campusId, activo, id]);

module.exports = {
  buscarPorEmail, buscarPorId, perfilPorId, listar, existeEmail, actualizarPassword,
  contar, contarSuperadminsActivos, crear, actualizar,
};
