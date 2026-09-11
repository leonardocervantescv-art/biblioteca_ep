const express = require('express');
const { query } = require('../db');
const { authRequired } = require('../auth');

const router = express.Router();
router.use(authRequired);

const TIPOS = ['estudiante', 'administrativo', 'academico'];
const IDS = ['credencial_estudiante', 'INE'];

// PR-GE-16: los estudiantes se identifican con credencial de estudiante; el
// personal administrativo y académico con INE.
function validar(b) {
  if (!b.nombre || !b.nombre.trim()) return 'El nombre es obligatorio';
  if (!TIPOS.includes(b.tipo)) return 'Tipo de lector inválido';
  if (!IDS.includes(b.identificacion_tipo)) return 'Tipo de identificación inválido';
  if (!b.identificacion_num || !b.identificacion_num.trim()) return 'El número de identificación es obligatorio';
  if (b.tipo === 'estudiante' && b.identificacion_tipo !== 'credencial_estudiante') {
    return 'Los estudiantes deben identificarse con credencial de estudiante';
  }
  if (b.tipo !== 'estudiante' && b.identificacion_tipo !== 'INE') {
    return 'El personal administrativo y académico debe identificarse con INE';
  }
  return null;
}

// GET /api/lectores
router.get('/', async (req, res) => {
  const { q, tipo, activo } = req.query;
  const where = [];
  const params = [];
  if (q) {
    where.push('(nombre LIKE ? OR matricula LIKE ? OR identificacion_num LIKE ? OR email LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (tipo && TIPOS.includes(tipo)) {
    where.push('tipo = ?');
    params.push(tipo);
  }
  if (activo === '1' || activo === '0') {
    where.push('activo = ?');
    params.push(Number(activo));
  }
  const sql = `SELECT * FROM lectores ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY nombre ASC`;
  res.json(await query(sql, params));
});

// GET /api/lectores/:id  (con préstamos activos e historial)
router.get('/:id', async (req, res) => {
  const rows = await query('SELECT * FROM lectores WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Lector no encontrado' });
  const prestamos = await query(
    `SELECT p.*, l.titulo AS libro_titulo, l.codigo_barras
     FROM prestamos p JOIN libros l ON l.id = p.libro_id
     WHERE p.lector_id = ? ORDER BY p.fecha_prestamo DESC`,
    [req.params.id]
  );
  res.json({ ...rows[0], prestamos });
});

// POST /api/lectores
router.post('/', async (req, res) => {
  const b = req.body || {};
  const err = validar(b);
  if (err) return res.status(400).json({ error: err });

  const dup = await query(
    'SELECT id FROM lectores WHERE identificacion_tipo = ? AND identificacion_num = ?',
    [b.identificacion_tipo, b.identificacion_num.trim()]
  );
  if (dup.length) return res.status(409).json({ error: 'Ya existe un lector con esa identificación' });

  const result = await query(
    `INSERT INTO lectores (nombre, tipo, identificacion_tipo, identificacion_num, matricula, carrera_area, email, telefono)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      b.nombre.trim(), b.tipo, b.identificacion_tipo, b.identificacion_num.trim(),
      b.matricula || null, b.carrera_area || null, b.email || null, b.telefono || null,
    ]
  );
  res.status(201).json((await query('SELECT * FROM lectores WHERE id = ?', [result.insertId]))[0]);
});

// PUT /api/lectores/:id
router.put('/:id', async (req, res) => {
  const rows = await query('SELECT * FROM lectores WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Lector no encontrado' });
  const b = { ...rows[0], ...req.body };
  const err = validar(b);
  if (err) return res.status(400).json({ error: err });

  const dup = await query(
    'SELECT id FROM lectores WHERE identificacion_tipo = ? AND identificacion_num = ? AND id <> ?',
    [b.identificacion_tipo, String(b.identificacion_num).trim(), req.params.id]
  );
  if (dup.length) return res.status(409).json({ error: 'Ya existe un lector con esa identificación' });

  await query(
    `UPDATE lectores SET nombre=?, tipo=?, identificacion_tipo=?, identificacion_num=?, matricula=?,
       carrera_area=?, email=?, telefono=?, activo=? WHERE id=?`,
    [
      String(b.nombre).trim(), b.tipo, b.identificacion_tipo, String(b.identificacion_num).trim(),
      b.matricula || null, b.carrera_area || null, b.email || null, b.telefono || null,
      b.activo ? 1 : 0, req.params.id,
    ]
  );
  res.json((await query('SELECT * FROM lectores WHERE id = ?', [req.params.id]))[0]);
});

// DELETE /api/lectores/:id
router.delete('/:id', async (req, res) => {
  const activos = await query(
    'SELECT COUNT(*) AS n FROM prestamos WHERE lector_id = ? AND estado = "activo"',
    [req.params.id]
  );
  if (activos[0].n > 0) {
    return res.status(400).json({ error: 'No se puede eliminar: el lector tiene préstamos activos' });
  }
  const conHistorial = await query('SELECT COUNT(*) AS n FROM prestamos WHERE lector_id = ?', [req.params.id]);
  if (conHistorial[0].n > 0) {
    // Conservar el historial: sólo se desactiva.
    await query('UPDATE lectores SET activo = 0 WHERE id = ?', [req.params.id]);
    return res.json({ ok: true, desactivado: true });
  }
  await query('DELETE FROM lectores WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
