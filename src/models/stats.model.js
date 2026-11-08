const { query } = require('../config/database');

// Indicadores de un campus (`campusId` siempre primero).

const resumenLibros = async (campusId) => (await query(
  'SELECT COUNT(*) AS titulos, COALESCE(SUM(cantidad_total),0) AS ejemplares, COALESCE(SUM(cantidad_disponible),0) AS disponibles FROM libros WHERE campus_id = ?',
  [campusId]
))[0];

const resumenLectores = async (campusId) => (await query(
  'SELECT COUNT(*) AS total, SUM(activo = 1) AS activos FROM lectores WHERE campus_id = ?',
  [campusId]
))[0];

const resumenPrestamos = async (campusId) => (await query(
  `SELECT
     SUM(estado = 'activo') AS activos,
     SUM(estado = 'devuelto') AS devueltos,
     SUM(estado = 'activo' AND fecha_vencimiento < CURDATE()) AS vencidos,
     SUM(estado = 'activo' AND fecha_vencimiento = CURDATE()) AS vencen_hoy
   FROM prestamos WHERE campus_id = ?`,
  [campusId]
))[0];

const librosPorCategoria = (campusId) => query(
  "SELECT COALESCE(categoria,'Sin categoría') AS categoria, COUNT(*) AS n FROM libros WHERE campus_id = ? GROUP BY categoria ORDER BY n DESC",
  [campusId]
);

const prestamosRecientes = (campusId) => query(
  `SELECT p.folio, p.fecha_prestamo, p.fecha_vencimiento, p.estado,
          l.titulo AS libro_titulo, le.nombre AS lector_nombre
   FROM prestamos p JOIN libros l ON l.id = p.libro_id JOIN lectores le ON le.id = p.lector_id
   WHERE p.campus_id = ?
   ORDER BY p.id DESC LIMIT 8`,
  [campusId]
);

module.exports = { resumenLibros, resumenLectores, resumenPrestamos, librosPorCategoria, prestamosRecientes };
