const express = require('express');
const { getPool, query } = require('../db');
const { authRequired } = require('../auth');
const { hoyISO, calcularVencimiento, DIAS_HABILES_PRESTAMO } = require('../util/fechas');

const router = express.Router();
router.use(authRequired);

const SELECT_BASE = `
  SELECT p.*,
         l.titulo AS libro_titulo, l.autor AS libro_autor, l.isbn AS libro_isbn,
         l.codigo_barras AS libro_codigo_barras, l.ubicacion AS libro_ubicacion,
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

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function siguienteFolio(conn) {
  const [rows] = await conn.execute("SELECT folio FROM prestamos ORDER BY id DESC LIMIT 1");
  const ultimo = rows.length ? parseInt(rows[0].folio.replace(/\D/g, ''), 10) : 0;
  return 'P-' + String(ultimo + 1).padStart(6, '0');
}

// GET /api/prestamos?estado=activo|devuelto|vencido&q=...&lector_id=...
router.get('/', async (req, res) => {
  const { estado, q, lector_id, libro_id } = req.query;
  const where = [];
  const params = [];
  if (estado === 'activo' || estado === 'devuelto') {
    where.push('p.estado = ?');
    params.push(estado);
  } else if (estado === 'vencido') {
    where.push("p.estado = 'activo' AND p.fecha_vencimiento < CURDATE()");
  }
  if (lector_id) { where.push('p.lector_id = ?'); params.push(lector_id); }
  if (libro_id) { where.push('p.libro_id = ?'); params.push(libro_id); }
  if (q) {
    where.push('(p.folio LIKE ? OR l.titulo LIKE ? OR le.nombre LIKE ? OR le.matricula LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  const sql = `${SELECT_BASE} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.fecha_prestamo DESC, p.id DESC`;
  res.json(await query(sql, params));
});

// GET /api/prestamos/:id
router.get('/:id', async (req, res) => {
  const rows = await query(`${SELECT_BASE} WHERE p.id = ?`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Préstamo no encontrado' });
  res.json(rows[0]);
});

// GET /api/prestamos/:id/recibo  — datos para el recibo de préstamo (PR-GE-16 3.6)
router.get('/:id/recibo', async (req, res) => {
  const rows = await query(`${SELECT_BASE} WHERE p.id = ?`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Préstamo no encontrado' });
  const p = rows[0];
  res.json({
    prestamo: p,
    institucion: 'Universidad EP de México — Biblioteca',
    procedimiento: 'PR-GE-16 Préstamos y salvaguardo de libros dentro de la biblioteca',
    lineamientos: [
      `El tiempo máximo de préstamo es de ${DIAS_HABILES_PRESTAMO} días hábiles.`,
      'La renovación se solicita en persona y sólo procede si no hay reservas para el mismo libro. Se permite una sola renovación.',
      'El libro debe devolverse en buen estado. La entrega en mal estado se sujeta a las Disposiciones generales del Formato de Préstamo firmado.',
      'El préstamo de libros es totalmente gratuito.',
      'No se realizan préstamos a usuarios que no presenten identificación válida.',
    ],
  });
});

// POST /api/prestamos  — el Responsable de Biblioteca registra un préstamo
router.post('/', async (req, res) => {
  const b = req.body || {};
  const { libro_id, lector_id } = b;
  if (!libro_id || !lector_id) {
    return res.status(400).json({ error: 'Debes indicar el libro y el lector' });
  }
  // PR-GE-16: no se realiza préstamo a quien no presente identificación válida.
  if (b.identificacion_verificada !== true) {
    return res.status(400).json({ error: 'Debes confirmar que el lector presentó una identificación válida' });
  }

  const fechaPrestamo = b.fecha_prestamo || hoyISO();
  const dias = Math.min(DIAS_HABILES_PRESTAMO, Math.max(1, parseInt(b.dias_habiles, 10) || DIAS_HABILES_PRESTAMO));
  const fechaVencimiento = calcularVencimiento(fechaPrestamo, dias);

  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();

    const [lectores] = await conn.execute('SELECT * FROM lectores WHERE id = ?', [lector_id]);
    if (!lectores.length) throw httpError(404, 'Lector no encontrado');
    if (!lectores[0].activo) throw httpError(400, 'El lector está inactivo');

    const [libros] = await conn.execute('SELECT * FROM libros WHERE id = ? FOR UPDATE', [libro_id]);
    if (!libros.length) throw httpError(404, 'Libro no encontrado');
    const libro = libros[0];
    if (libro.observacion) throw httpError(400, `El libro tiene una observación en el sistema: ${libro.observacion}`);
    if (libro.cantidad_disponible < 1) throw httpError(400, 'No hay ejemplares disponibles de este libro');
    if (libro.estado_fisico === 'malo') throw httpError(400, 'El ejemplar está en mal estado y no puede prestarse');

    const [dup] = await conn.execute(
      "SELECT id FROM prestamos WHERE libro_id = ? AND lector_id = ? AND estado = 'activo'",
      [libro_id, lector_id]
    );
    if (dup.length) throw httpError(409, 'El lector ya tiene un préstamo activo de este libro');

    const folio = await siguienteFolio(conn);
    const [result] = await conn.execute(
      `INSERT INTO prestamos (folio, libro_id, lector_id, registrado_por, fecha_prestamo, fecha_vencimiento, estado_libro_entrega, observaciones)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [folio, libro_id, lector_id, req.user.id, fechaPrestamo, fechaVencimiento, libro.estado_fisico, b.observaciones || null]
    );
    await conn.execute('UPDATE libros SET cantidad_disponible = cantidad_disponible - 1 WHERE id = ?', [libro_id]);
    await conn.commit();

    const rows = await query(`${SELECT_BASE} WHERE p.id = ?`, [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (e) {
    await conn.rollback();
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  } finally {
    conn.release();
  }
});

// PATCH /api/prestamos/:id/devolucion  — registrar la devolución del libro
router.patch('/:id/devolucion', async (req, res) => {
  const b = req.body || {};
  const estadoDev = ['bueno', 'regular', 'malo'].includes(b.estado_libro) ? b.estado_libro : 'bueno';

  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM prestamos WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!rows.length) throw httpError(404, 'Préstamo no encontrado');
    const p = rows[0];
    if (p.estado !== 'activo') throw httpError(400, 'El préstamo ya fue devuelto');

    let obs = p.observaciones || '';
    if (estadoDev === 'malo' || estadoDev === 'regular') {
      const nota = `Devuelto en estado ${estadoDev}${b.nota ? ': ' + b.nota : ''} (aplicar Disposiciones generales del Formato de Préstamo).`;
      obs = obs ? `${obs} | ${nota}` : nota;
    } else if (b.nota) {
      obs = obs ? `${obs} | ${b.nota}` : b.nota;
    }

    await conn.execute(
      `UPDATE prestamos SET estado='devuelto', fecha_devolucion=?, estado_libro_devolucion=?, observaciones=? WHERE id=?`,
      [hoyISO(), estadoDev, obs || null, p.id]
    );
    await conn.execute('UPDATE libros SET cantidad_disponible = cantidad_disponible + 1 WHERE id = ?', [p.libro_id]);
    // Si el libro regresa deteriorado, se refleja en el acervo.
    if (estadoDev !== 'bueno') {
      await conn.execute('UPDATE libros SET estado_fisico = ? WHERE id = ?', [estadoDev, p.libro_id]);
    }
    await conn.commit();

    const updated = await query(`${SELECT_BASE} WHERE p.id = ?`, [p.id]);
    res.json(updated[0]);
  } catch (e) {
    await conn.rollback();
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  } finally {
    conn.release();
  }
});

// PATCH /api/prestamos/:id/renovacion  — renovación en persona (una sola vez)
router.patch('/:id/renovacion', async (req, res) => {
  const b = req.body || {};
  if (!b.observacion || !b.observacion.trim()) {
    return res.status(400).json({ error: 'La renovación requiere registrar una observación en el sistema' });
  }
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM prestamos WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!rows.length) throw httpError(404, 'Préstamo no encontrado');
    const p = rows[0];
    if (p.estado !== 'activo') throw httpError(400, 'Sólo se pueden renovar préstamos activos');
    if (p.renovaciones >= 1) throw httpError(400, 'Este préstamo ya fue renovado una vez (máximo permitido)');

    const base = hoyISO() > p.fecha_vencimiento ? hoyISO() : p.fecha_vencimiento;
    const nuevoVenc = calcularVencimiento(base, DIAS_HABILES_PRESTAMO);
    const nota = `Renovación: ${b.observacion.trim()}`;
    const obs = p.observaciones ? `${p.observaciones} | ${nota}` : nota;

    await conn.execute(
      `UPDATE prestamos SET fecha_vencimiento=?, renovaciones=renovaciones+1, observaciones=? WHERE id=?`,
      [nuevoVenc, obs, p.id]
    );
    await conn.commit();

    const updated = await query(`${SELECT_BASE} WHERE p.id = ?`, [p.id]);
    res.json(updated[0]);
  } catch (e) {
    await conn.rollback();
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  } finally {
    conn.release();
  }
});

module.exports = router;
