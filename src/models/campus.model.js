const { query } = require('../config/database');

// Lista para el superadmin, con cuántos libros, lectores y administradores
// tiene cada campus.
const listarConConteos = () => query(
  `SELECT c.*,
          (SELECT COUNT(*) FROM libros l WHERE l.campus_id = c.id) AS libros,
          (SELECT COUNT(*) FROM lectores le WHERE le.campus_id = c.id) AS lectores,
          (SELECT COUNT(*) FROM usuarios u WHERE u.campus_id = c.id) AS administradores
   FROM campus c ORDER BY c.id`
);

const listarActivos = () =>
  query('SELECT clave, nombre, ciudad FROM campus WHERE activo = 1 ORDER BY id');

const buscarPorId = async (id) => (await query('SELECT * FROM campus WHERE id = ?', [id]))[0];
const buscarPorClave = async (clave) => (await query('SELECT * FROM campus WHERE clave = ?', [clave]))[0];

// Campus que se usa cuando el cliente no indica cuál (el primero activo).
const primeroActivo = async () =>
  (await query('SELECT * FROM campus WHERE activo = 1 ORDER BY id LIMIT 1'))[0];

const contarActivos = async () => (await query('SELECT COUNT(*) AS n FROM campus WHERE activo = 1'))[0].n;

async function crear({ clave, nombre, ciudad }) {
  const result = await query('INSERT INTO campus (clave, nombre, ciudad) VALUES (?, ?, ?)', [clave, nombre, ciudad]);
  return result.insertId;
}

const actualizar = (id, { nombre, ciudad, activo }) =>
  query('UPDATE campus SET nombre = ?, ciudad = ?, activo = ? WHERE id = ?', [nombre, ciudad, activo, id]);

module.exports = {
  listarConConteos, listarActivos, buscarPorId, buscarPorClave, primeroActivo, contarActivos, crear, actualizar,
};
