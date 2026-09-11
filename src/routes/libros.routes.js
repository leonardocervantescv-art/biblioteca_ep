const express = require('express');
const { query } = require('../db');
const { authRequired } = require('../auth');

const router = express.Router();
router.use(authRequired);

// Genera un código de barras único con el prefijo institucional.
async function generarCodigoBarras() {
  for (let intento = 0; intento < 10; intento++) {
    const cand = 'EPBIB' + String(Math.floor(100000 + Math.random() * 900000));
    const existe = await query('SELECT id FROM libros WHERE codigo_barras = ?', [cand]);
    if (!existe.length) return cand;
  }
  throw new Error('No se pudo generar un código de barras único');
}

// GET /api/libros  — catálogo con búsqueda (título, autor, tema, palabra clave, ISBN)
router.get('/', async (req, res) => {
  const { q, categoria, disponibles } = req.query;
  const where = [];
  const params = [];
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
  const sql = `SELECT * FROM libros ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY titulo ASC`;
  res.json(await query(sql, params));
});

// GET /api/libros/categorias
router.get('/categorias', async (req, res) => {
  const rows = await query(
    'SELECT DISTINCT categoria FROM libros WHERE categoria IS NOT NULL AND categoria <> "" ORDER BY categoria'
  );
  res.json(rows.map((r) => r.categoria));
});

// GET /api/libros/:id  (incluye historial de préstamos del ejemplar)
router.get('/:id', async (req, res) => {
  const rows = await query('SELECT * FROM libros WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Libro no encontrado' });
  const historial = await query(
    `SELECT p.folio, p.fecha_prestamo, p.fecha_vencimiento, p.fecha_devolucion, p.estado,
            le.nombre AS lector_nombre
     FROM prestamos p JOIN lectores le ON le.id = p.lector_id
     WHERE p.libro_id = ? ORDER BY p.fecha_prestamo DESC LIMIT 20`,
    [req.params.id]
  );
  res.json({ ...rows[0], historial });
});

// POST /api/libros  — registro de un libro nuevo
router.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.titulo || !b.autor) {
    return res.status(400).json({ error: 'Título y autor son obligatorios' });
  }
  let codigo = (b.codigo_barras || '').trim();
  if (codigo) {
    const dup = await query('SELECT id FROM libros WHERE codigo_barras = ?', [codigo]);
    if (dup.length) return res.status(409).json({ error: 'Ya existe un libro con ese código de barras' });
  } else {
    codigo = await generarCodigoBarras();
  }
  const total = Math.max(1, parseInt(b.cantidad_total, 10) || 1);
  const result = await query(
    `INSERT INTO libros (titulo, autor, isbn, editorial, anio, categoria, palabras_clave,
       codigo_barras, ubicacion, descripcion, estado_fisico, observacion, cantidad_total, cantidad_disponible)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      b.titulo.trim(), b.autor.trim(), b.isbn || null, b.editorial || null,
      b.anio || null, b.categoria || null, b.palabras_clave || null, codigo,
      b.ubicacion || null, b.descripcion || null,
      ['bueno', 'regular', 'malo'].includes(b.estado_fisico) ? b.estado_fisico : 'bueno',
      b.observacion || null, total, total,
    ]
  );
  const rows = await query('SELECT * FROM libros WHERE id = ?', [result.insertId]);
  res.status(201).json(rows[0]);
});

// Límites de longitud de cada columna de texto (deben coincidir con schema.sql).
const LIMITES = {
  titulo: 255, autor: 200, isbn: 20, editorial: 150,
  categoria: 100, palabras_clave: 255, codigo_barras: 40, ubicacion: 100,
};
const ANIO_MIN = -3000;
const ANIO_MAX = new Date().getFullYear() + 1;
const CANT_MAX = 10000;

// Limpia y valida una fila del CSV. Nunca lanza: corrige los campos fuera de
// rango o con formato inválido y deja constancia en `avisos`. Devuelve `null`
// sólo cuando la fila es irrecuperable (sin título o sin autor).
function saneaFila(l, fila, avisos) {
  const texto = (valor, campo) => {
    let s = String(valor ?? '').trim();
    if (!s) return null;
    if (LIMITES[campo] && s.length > LIMITES[campo]) {
      s = s.slice(0, LIMITES[campo]);
      avisos.push({ fila, aviso: `"${campo}" excedía ${LIMITES[campo]} caracteres; se recortó` });
    }
    return s;
  };

  const titulo = texto(l.titulo, 'titulo');
  const autor = texto(l.autor, 'autor');
  if (!titulo || !autor) return null;

  // Año: entero dentro de un rango razonable; si no, se omite el dato.
  let anio = null;
  const anioRaw = String(l.anio ?? '').trim();
  if (anioRaw !== '') {
    const n = Number.parseInt(anioRaw, 10);
    if (!Number.isFinite(n) || String(n) !== anioRaw.replace(/^\+/, '')) {
      avisos.push({ fila, aviso: `"anio" no es un número entero ("${anioRaw}"); se dejó vacío` });
    } else if (n < ANIO_MIN || n > ANIO_MAX) {
      avisos.push({ fila, aviso: `"anio" fuera de rango (${n}); se dejó vacío` });
    } else {
      anio = n;
    }
  }

  // Cantidad de ejemplares: entero >= 1, acotado a un máximo.
  let cantidad = 1;
  const cantRaw = String(l.cantidad_total ?? '').trim();
  if (cantRaw !== '') {
    const n = Number.parseInt(cantRaw, 10);
    if (!Number.isFinite(n) || n < 1) {
      avisos.push({ fila, aviso: `"cantidad_total" inválida ("${cantRaw}"); se usó 1` });
    } else if (n > CANT_MAX) {
      cantidad = CANT_MAX;
      avisos.push({ fila, aviso: `"cantidad_total" demasiado alta (${n}); se acotó a ${CANT_MAX}` });
    } else {
      cantidad = n;
    }
  }

  // Estado físico: valor del catálogo; cualquier otra cosa -> "bueno".
  let estado = 'bueno';
  const estRaw = String(l.estado_fisico ?? '').trim().toLowerCase();
  if (estRaw) {
    if (['bueno', 'regular', 'malo'].includes(estRaw)) estado = estRaw;
    else avisos.push({ fila, aviso: `"estado_fisico" no reconocido ("${estRaw}"); se usó "bueno"` });
  }

  return {
    titulo, autor,
    isbn: texto(l.isbn, 'isbn'),
    editorial: texto(l.editorial, 'editorial'),
    anio,
    categoria: texto(l.categoria, 'categoria'),
    palabras_clave: texto(l.palabras_clave, 'palabras_clave'),
    codigo_barras: texto(l.codigo_barras, 'codigo_barras'),
    ubicacion: texto(l.ubicacion, 'ubicacion'),
    descripcion: String(l.descripcion ?? '').trim() || null,
    estado_fisico: estado,
    cantidad_total: cantidad,
  };
}

// POST /api/libros/importar  — alta masiva desde un CSV ya parseado en el cliente.
// Cada fila con datos inválidos o fuera de rango se corrige en la medida de lo
// posible (queda registrado en `avisos`); sólo se omite por completo si le falta
// el título o el autor, si el código de barras está duplicado, o si la base de
// datos rechaza la inserción. Las filas correctas siempre se guardan.
router.post('/importar', async (req, res) => {
  const filas = Array.isArray(req.body && req.body.libros) ? req.body.libros : null;
  if (!filas || !filas.length) {
    return res.status(400).json({ error: 'No se recibieron filas para importar' });
  }
  if (filas.length > 2000) {
    return res.status(400).json({ error: 'Máximo 2000 libros por importación' });
  }

  let creados = 0;
  const errores = []; // filas omitidas
  const avisos = [];  // correcciones aplicadas a filas que sí se guardaron
  const codigosVistos = new Set();

  for (let i = 0; i < filas.length; i++) {
    const fila = i + 1; // número de fila de datos (sin contar encabezado)
    const avisosFila = [];
    const d = saneaFila(filas[i] || {}, fila, avisosFila);

    if (!d) {
      errores.push({ fila, error: 'Se omitió: falta el título o el autor' });
      continue;
    }

    try {
      let codigo = d.codigo_barras;
      if (codigo) {
        if (codigosVistos.has(codigo)) {
          errores.push({ fila, error: `Se omitió: código de barras repetido en el archivo (${codigo})` });
          continue;
        }
        const dup = await query('SELECT id FROM libros WHERE codigo_barras = ?', [codigo]);
        if (dup.length) {
          errores.push({ fila, error: `Se omitió: el código de barras ya existe (${codigo})` });
          continue;
        }
      } else {
        codigo = await generarCodigoBarras();
      }
      codigosVistos.add(codigo);

      await query(
        `INSERT INTO libros (titulo, autor, isbn, editorial, anio, categoria, palabras_clave,
           codigo_barras, ubicacion, descripcion, estado_fisico, cantidad_total, cantidad_disponible)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          d.titulo, d.autor, d.isbn, d.editorial, d.anio, d.categoria, d.palabras_clave,
          codigo, d.ubicacion, d.descripcion, d.estado_fisico, d.cantidad_total, d.cantidad_total,
        ]
      );
      creados++;
      avisos.push(...avisosFila);
    } catch (e) {
      errores.push({ fila, error: 'Se omitió: la base de datos rechazó la fila (' + (e.code || e.message) + ')' });
    }
  }

  res.status(creados ? 200 : 422).json({ total: filas.length, creados, omitidos: errores.length, errores, avisos });
});

// PUT /api/libros/:id
router.put('/:id', async (req, res) => {
  const rows = await query('SELECT * FROM libros WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Libro no encontrado' });
  const libro = rows[0];
  const b = req.body || {};

  const nuevoTotal = b.cantidad_total != null ? Math.max(0, parseInt(b.cantidad_total, 10) || 0) : libro.cantidad_total;
  const prestados = libro.cantidad_total - libro.cantidad_disponible;
  if (nuevoTotal < prestados) {
    return res.status(400).json({ error: `No puedes bajar el total por debajo de ${prestados} (ejemplares prestados)` });
  }
  if (b.codigo_barras && b.codigo_barras.trim() !== libro.codigo_barras) {
    const dup = await query('SELECT id FROM libros WHERE codigo_barras = ? AND id <> ?', [b.codigo_barras.trim(), libro.id]);
    if (dup.length) return res.status(409).json({ error: 'Ya existe un libro con ese código de barras' });
  }

  await query(
    `UPDATE libros SET titulo=?, autor=?, isbn=?, editorial=?, anio=?, categoria=?, palabras_clave=?,
       codigo_barras=?, ubicacion=?, descripcion=?, estado_fisico=?, observacion=?,
       cantidad_total=?, cantidad_disponible=? WHERE id=?`,
    [
      b.titulo ?? libro.titulo,
      b.autor ?? libro.autor,
      b.isbn ?? libro.isbn,
      b.editorial ?? libro.editorial,
      b.anio ?? libro.anio,
      b.categoria ?? libro.categoria,
      b.palabras_clave ?? libro.palabras_clave,
      (b.codigo_barras && b.codigo_barras.trim()) || libro.codigo_barras,
      b.ubicacion ?? libro.ubicacion,
      b.descripcion ?? libro.descripcion,
      ['bueno', 'regular', 'malo'].includes(b.estado_fisico) ? b.estado_fisico : libro.estado_fisico,
      b.observacion ?? libro.observacion,
      nuevoTotal,
      nuevoTotal - prestados,
      req.params.id,
    ]
  );
  res.json((await query('SELECT * FROM libros WHERE id = ?', [req.params.id]))[0]);
});

// DELETE /api/libros/:id
router.delete('/:id', async (req, res) => {
  const activos = await query(
    'SELECT COUNT(*) AS n FROM prestamos WHERE libro_id = ? AND estado = "activo"',
    [req.params.id]
  );
  if (activos[0].n > 0) {
    return res.status(400).json({ error: 'No se puede eliminar: el libro tiene préstamos activos' });
  }
  await query('DELETE FROM prestamos WHERE libro_id = ?', [req.params.id]);
  await query('DELETE FROM libros WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
