const { query, ejecutor } = require('../config/database');

const SELECT_BASE = `
  SELECT p.*,
         l.titulo AS libro_titulo, l.autor AS libro_autor, l.isbn AS libro_isbn,
         l.codigo_barras AS libro_codigo_barras, l.ubicacion AS libro_ubicacion,
         l.categoria AS libro_categoria,
         le.nombre AS lector_nombre, le.tipo AS lector_tipo,
         le.identificacion_tipo AS lector_identificacion_tipo,
         le.identificacion_num AS lector_identificacion_num,
         le.matricula AS lector_matricula, le.email AS lector_email,
         (p.estado = 'activo' AND p.fecha_vencimiento < CURDATE()) AS vencido,
         DATEDIFF(CURDATE(), p.fecha_vencimiento) AS dias_atraso
  FROM prestamos p
  JOIN libros l    ON l.id = p.libro_id
  JOIN lectores le ON le.id = p.lector_id
`;

// Cada campus sólo ve sus propios préstamos (`campusId` va primero).
// estado: 'activo' | 'devuelto' | 'vencido' (los demás valores se ignoran).
function listar(campusId, { estado, q, lector_id, libro_id, categoria } = {}) {
  const where = ['p.campus_id = ?'];
  const params = [campusId];
  if (estado === 'activo' || estado === 'devuelto') {
    where.push('p.estado = ?');
    params.push(estado);
  } else if (estado === 'vencido') {
    where.push("p.estado = 'activo' AND p.fecha_vencimiento < CURDATE()");
  }
  if (lector_id) { where.push('p.lector_id = ?'); params.push(lector_id); }
  if (libro_id) { where.push('p.libro_id = ?'); params.push(libro_id); }
  if (categoria) { where.push('l.categoria = ?'); params.push(categoria); }
  if (q) {
    where.push('(p.folio LIKE ? OR l.titulo LIKE ? OR le.nombre LIKE ? OR le.matricula LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  return query(
    `${SELECT_BASE} WHERE ${where.join(' AND ')} ORDER BY p.fecha_prestamo DESC, p.id DESC`,
    params
  );
}

const buscarPorId = async (campusId, id) =>
  (await query(`${SELECT_BASE} WHERE p.id = ? AND p.campus_id = ?`, [id, campusId]))[0];

// Fila cruda (sin joins) bloqueada hasta terminar la transacción.
const buscarCrudoBloqueando = async (campusId, id, conn) =>
  (await ejecutor(conn)('SELECT * FROM prestamos WHERE id = ? AND campus_id = ? FOR UPDATE', [id, campusId]))[0];

async function siguienteFolio(conn) {
  const rows = await ejecutor(conn)('SELECT folio FROM prestamos ORDER BY id DESC LIMIT 1');
  const ultimo = rows.length ? parseInt(rows[0].folio.replace(/\D/g, ''), 10) : 0;
  return 'P-' + String(ultimo + 1).padStart(6, '0');
}

async function existeActivo(libroId, lectorId, conn) {
  const rows = await ejecutor(conn)(
    "SELECT id FROM prestamos WHERE libro_id = ? AND lector_id = ? AND estado = 'activo'",
    [libroId, lectorId]
  );
  return rows.length > 0;
}

async function insertar(campusId, d, conn) {
  const result = await ejecutor(conn)(
    `INSERT INTO prestamos (campus_id, folio, libro_id, lector_id, registrado_por, fecha_prestamo, fecha_vencimiento, estado_libro_entrega, observaciones)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [campusId, d.folio, d.libro_id, d.lector_id, d.registrado_por, d.fecha_prestamo, d.fecha_vencimiento, d.estado_libro_entrega, d.observaciones]
  );
  return result.insertId;
}

const marcarDevuelto = ({ id, fecha, estadoLibro, observaciones }, conn) =>
  ejecutor(conn)(
    `UPDATE prestamos SET estado='devuelto', fecha_devolucion=?, estado_libro_devolucion=?, observaciones=? WHERE id=?`,
    [fecha, estadoLibro, observaciones, id]
  );

const registrarRenovacion = ({ id, fechaVencimiento, observaciones }, conn) =>
  ejecutor(conn)(
    'UPDATE prestamos SET fecha_vencimiento=?, renovaciones=renovaciones+1, observaciones=? WHERE id=?',
    [fechaVencimiento, observaciones, id]
  );

const historialPorLibro = (libroId) =>
  query(
    `SELECT p.folio, p.fecha_prestamo, p.fecha_vencimiento, p.fecha_devolucion, p.estado,
            le.nombre AS lector_nombre
     FROM prestamos p JOIN lectores le ON le.id = p.lector_id
     WHERE p.libro_id = ? ORDER BY p.fecha_prestamo DESC LIMIT 20`,
    [libroId]
  );

const listarPorLector = (lectorId) =>
  query(
    `SELECT p.*, l.titulo AS libro_titulo, l.codigo_barras
     FROM prestamos p JOIN libros l ON l.id = p.libro_id
     WHERE p.lector_id = ? ORDER BY p.fecha_prestamo DESC`,
    [lectorId]
  );

const contarActivosPorLibro = async (libroId) =>
  (await query('SELECT COUNT(*) AS n FROM prestamos WHERE libro_id = ? AND estado = "activo"', [libroId]))[0].n;

const contarActivosPorLector = async (lectorId) =>
  (await query('SELECT COUNT(*) AS n FROM prestamos WHERE lector_id = ? AND estado = "activo"', [lectorId]))[0].n;

const contarPorLector = async (lectorId) =>
  (await query('SELECT COUNT(*) AS n FROM prestamos WHERE lector_id = ?', [lectorId]))[0].n;

const eliminarPorLibro = (libroId) => query('DELETE FROM prestamos WHERE libro_id = ?', [libroId]);

module.exports = {
  listar, buscarPorId, buscarCrudoBloqueando, siguienteFolio, existeActivo, insertar,
  marcarDevuelto, registrarRenovacion, historialPorLibro, listarPorLector,
  contarActivosPorLibro, contarActivosPorLector, contarPorLector, eliminarPorLibro,
};
