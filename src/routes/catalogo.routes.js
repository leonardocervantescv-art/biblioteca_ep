const express = require('express');
const { query } = require('../db');

const router = express.Router();

// Catálogo público de consulta para estudiantes: sólo lectura, sin autenticación.
// Refleja exactamente el acervo capturado por el administrador (mismas tablas
// `libros` / `prestamos`), incluida la disponibilidad en tiempo real.

// GET /api/catalogo/libros — catálogo con búsqueda y filtros por categoría/disponibilidad
router.get('/libros', async (req, res) => {
  const { q, categoria, disponibilidad } = req.query;
  const where = [];
  const params = [];
  if (q) {
    where.push('(l.titulo LIKE ? OR l.autor LIKE ? OR l.isbn LIKE ? OR l.categoria LIKE ? OR l.palabras_clave LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  if (categoria) {
    where.push('l.categoria = ?');
    params.push(categoria);
  }
  if (disponibilidad === 'disponible') {
    where.push('l.cantidad_disponible > 0');
  } else if (disponibilidad === 'no_disponible') {
    where.push('l.cantidad_disponible = 0');
  }

  const sql = `
    SELECT l.id, l.titulo, l.autor, l.isbn, l.editorial, l.anio, l.categoria,
           l.palabras_clave, l.ubicacion, l.descripcion,
           l.cantidad_total, l.cantidad_disponible,
           (l.cantidad_disponible > 0) AS disponible,
           (SELECT MIN(p.fecha_vencimiento) FROM prestamos p
              WHERE p.libro_id = l.id AND p.estado = 'activo') AS disponible_desde
    FROM libros l
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY l.titulo ASC`;
  const libros = await query(sql, params);
  res.json(libros.map((l) => ({ ...l, disponible: !!l.disponible })));
});

// GET /api/catalogo/categorias — categorías existentes, para el filtro
router.get('/categorias', async (req, res) => {
  const rows = await query(
    'SELECT DISTINCT categoria FROM libros WHERE categoria IS NOT NULL AND categoria <> "" ORDER BY categoria'
  );
  res.json(rows.map((r) => r.categoria));
});

module.exports = router;
