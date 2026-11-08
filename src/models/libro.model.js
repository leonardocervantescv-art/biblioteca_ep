const { query, ejecutor } = require('../config/database');

// Todas las consultas reciben `campusId` primero: cada campus sólo ve y
// modifica su propio acervo, incluso si conoce el id de un libro ajeno.

// WHERE/params compartido por el listado y la exportación a Excel.
function armarFiltro(campusId, { q, categoria, disponibles } = {}) {
  const where = ['campus_id = ?'];
  const params = [campusId];
  if (q) {
    where.push('(titulo LIKE ? OR autor LIKE ? OR isbn LIKE ? OR categoria LIKE ? OR palabras_clave LIKE ? OR codigo_barras = ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like, q);
  }
  if (categoria) {
    where.push('categoria = ?');
    params.push(categoria);
  }
  if (disponibles === '1' || disponibles === 'true') {
    where.push('cantidad_disponible > 0');
  }
  return { donde: 'WHERE ' + where.join(' AND '), params };
}

function listar(campusId, filtros) {
  const { donde, params } = armarFiltro(campusId, filtros);
  return query(`SELECT * FROM libros ${donde} ORDER BY titulo ASC`, params);
}

function listarParaExportar(campusId, filtros) {
  const { donde, params } = armarFiltro(campusId, filtros);
  return query(
    `SELECT titulo, autor, categoria, ubicacion, codigo_barras FROM libros
     ${donde} ORDER BY ubicacion ASC, categoria ASC, titulo ASC`,
    params
  );
}

// Catálogo público (vista del estudiante): sólo columnas no sensibles, con la
// disponibilidad y la fecha en que se espera el ejemplar más próximo.
function listarCatalogo(campusId, { q, categoria, disponibilidad } = {}) {
  const where = ['l.campus_id = ?'];
  const params = [campusId];
  if (q) {
    where.push('(l.titulo LIKE ? OR l.autor LIKE ? OR l.isbn LIKE ? OR l.categoria LIKE ? OR l.palabras_clave LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  if (categoria) {
    where.push('l.categoria = ?');
    params.push(categoria);
  }
  if (disponibilidad === 'disponible') where.push('l.cantidad_disponible > 0');
  else if (disponibilidad === 'no_disponible') where.push('l.cantidad_disponible = 0');

  return query(
    `SELECT l.id, l.titulo, l.autor, l.isbn, l.editorial, l.anio, l.categoria,
            l.palabras_clave, l.ubicacion, l.descripcion,
            l.cantidad_total, l.cantidad_disponible,
            (l.cantidad_disponible > 0) AS disponible,
            (SELECT MIN(p.fecha_vencimiento) FROM prestamos p
               WHERE p.libro_id = l.id AND p.estado = 'activo') AS disponible_desde
     FROM libros l
     WHERE ${where.join(' AND ')}
     ORDER BY l.titulo ASC`,
    params
  );
}

const categorias = async (campusId) => (await query(
  'SELECT DISTINCT categoria FROM libros WHERE campus_id = ? AND categoria IS NOT NULL AND categoria <> "" ORDER BY categoria',
  [campusId]
)).map((r) => r.categoria);

const buscarPorId = async (campusId, id, conn) =>
  (await ejecutor(conn)('SELECT * FROM libros WHERE id = ? AND campus_id = ?', [id, campusId]))[0];

// Bloquea la fila hasta terminar la transacción (evita prestar dos veces el
// último ejemplar en peticiones simultáneas).
const buscarPorIdBloqueando = async (campusId, id, conn) =>
  (await ejecutor(conn)('SELECT * FROM libros WHERE id = ? AND campus_id = ? FOR UPDATE', [id, campusId]))[0];

async function existeCodigo(campusId, codigo, excluirId) {
  const rows = excluirId
    ? await query('SELECT id FROM libros WHERE campus_id = ? AND codigo_barras = ? AND id <> ?', [campusId, codigo, excluirId])
    : await query('SELECT id FROM libros WHERE campus_id = ? AND codigo_barras = ?', [campusId, codigo]);
  return rows.length > 0;
}

async function crear(campusId, d) {
  const result = await query(
    `INSERT INTO libros (campus_id, titulo, autor, isbn, editorial, anio, categoria, palabras_clave,
       codigo_barras, ubicacion, descripcion, estado_fisico, observacion, cantidad_total, cantidad_disponible)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      campusId, d.titulo, d.autor, d.isbn, d.editorial, d.anio, d.categoria, d.palabras_clave,
      d.codigo_barras, d.ubicacion, d.descripcion, d.estado_fisico, d.observacion ?? null,
      d.cantidad_total, d.cantidad_disponible,
    ]
  );
  return result.insertId;
}

function actualizar(campusId, id, d) {
  return query(
    `UPDATE libros SET titulo=?, autor=?, isbn=?, editorial=?, anio=?, categoria=?, palabras_clave=?,
       codigo_barras=?, ubicacion=?, descripcion=?, estado_fisico=?, observacion=?,
       cantidad_total=?, cantidad_disponible=? WHERE id=? AND campus_id=?`,
    [
      d.titulo, d.autor, d.isbn, d.editorial, d.anio, d.categoria, d.palabras_clave,
      d.codigo_barras, d.ubicacion, d.descripcion, d.estado_fisico, d.observacion,
      d.cantidad_total, d.cantidad_disponible, id, campusId,
    ]
  );
}

const eliminar = (campusId, id) => query('DELETE FROM libros WHERE id = ? AND campus_id = ?', [id, campusId]);

// Estas tres reciben un id que el servicio ya comprobó que es del campus.
const decrementarDisponible = (id, conn) =>
  ejecutor(conn)('UPDATE libros SET cantidad_disponible = cantidad_disponible - 1 WHERE id = ?', [id]);

const incrementarDisponible = (id, conn) =>
  ejecutor(conn)('UPDATE libros SET cantidad_disponible = cantidad_disponible + 1 WHERE id = ?', [id]);

const actualizarEstadoFisico = (id, estado, conn) =>
  ejecutor(conn)('UPDATE libros SET estado_fisico = ? WHERE id = ?', [estado, id]);

module.exports = {
  listar, listarParaExportar, listarCatalogo, categorias, buscarPorId, buscarPorIdBloqueando,
  existeCodigo, crear, actualizar, eliminar,
  decrementarDisponible, incrementarDisponible, actualizarEstadoFisico,
};
