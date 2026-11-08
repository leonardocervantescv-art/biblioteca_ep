const { query, ejecutor } = require('../config/database');

// Todas las consultas reciben `campusId` primero: cada campus tiene sus
// propios lectores. `tipo` y `activo` llegan ya validados desde el servicio.
function listar(campusId, { q, tipo, activo } = {}) {
  const where = ['campus_id = ?'];
  const params = [campusId];
  if (q) {
    where.push('(nombre LIKE ? OR matricula LIKE ? OR identificacion_num LIKE ? OR email LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (tipo) {
    where.push('tipo = ?');
    params.push(tipo);
  }
  if (activo !== undefined) {
    where.push('activo = ?');
    params.push(activo);
  }
  return query(`SELECT * FROM lectores WHERE ${where.join(' AND ')} ORDER BY nombre ASC`, params);
}

const buscarPorId = async (campusId, id, conn) =>
  (await ejecutor(conn)('SELECT * FROM lectores WHERE id = ? AND campus_id = ?', [id, campusId]))[0];

async function existeIdentificacion(campusId, tipo, numero, excluirId) {
  const rows = excluirId
    ? await query('SELECT id FROM lectores WHERE campus_id = ? AND identificacion_tipo = ? AND identificacion_num = ? AND id <> ?', [campusId, tipo, numero, excluirId])
    : await query('SELECT id FROM lectores WHERE campus_id = ? AND identificacion_tipo = ? AND identificacion_num = ?', [campusId, tipo, numero]);
  return rows.length > 0;
}

async function crear(campusId, d) {
  const result = await query(
    `INSERT INTO lectores (campus_id, nombre, tipo, identificacion_tipo, identificacion_num, matricula, carrera_area, email, telefono)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [campusId, d.nombre, d.tipo, d.identificacion_tipo, d.identificacion_num, d.matricula, d.carrera_area, d.email, d.telefono]
  );
  return result.insertId;
}

function actualizar(campusId, id, d) {
  return query(
    `UPDATE lectores SET nombre=?, tipo=?, identificacion_tipo=?, identificacion_num=?, matricula=?,
       carrera_area=?, email=?, telefono=?, activo=? WHERE id=? AND campus_id=?`,
    [d.nombre, d.tipo, d.identificacion_tipo, d.identificacion_num, d.matricula, d.carrera_area, d.email, d.telefono, d.activo, id, campusId]
  );
}

const desactivar = (campusId, id) => query('UPDATE lectores SET activo = 0 WHERE id = ? AND campus_id = ?', [id, campusId]);
const eliminar = (campusId, id) => query('DELETE FROM lectores WHERE id = ? AND campus_id = ?', [id, campusId]);

module.exports = { listar, buscarPorId, existeIdentificacion, crear, actualizar, desactivar, eliminar };
