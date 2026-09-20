const express = require('express');
const ExcelJS = require('exceljs');
const { query } = require('../db');
const { authRequired } = require('../auth');

const router = express.Router();
router.use(authRequired);

// Arma el WHERE/params compartido por el listado y la exportación a Excel.
function filtroLibros(q, categoria, disponibles) {
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
  return { where, params };
}

// Quita acentos, pasa a mayúsculas y colapsa espacios — para comparar o
// abreviar texto sin que acentos/espacios de más generen falsos distintos.
function normalizarTexto(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Palabras que no aportan al abreviar (artículos, conjunciones); se ignoran
// al construir las siglas de área/categoría para no gastar letras en ellas.
const PALABRAS_VACIAS = new Set(['Y', 'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'EN', 'A', 'PARA', 'AL', 'E']);

// Abrevia un texto de varias palabras: las primeras `letras` de la primera
// palabra significativa + la inicial de cada palabra significativa
// siguiente. "Investigación y Metodología" (letras=4) -> "INVEM".
function abreviarPalabras(texto, letras) {
  const palabras = normalizarTexto(texto)
    .split(/[^A-Z]+/)
    .filter((p) => p && !PALABRAS_VACIAS.has(p));
  if (!palabras.length) return '';
  let resultado = palabras[0].slice(0, letras);
  for (let i = 1; i < palabras.length; i++) resultado += palabras[i][0];
  return resultado;
}

// Siglas ya conocidas para las áreas de la biblioteca (columna Ubicación,
// parte después de "Zona X - "). Si aparece un área nueva que no está en
// esta lista, se abrevia automáticamente con `abreviarPalabras`.
const AREAS_CONOCIDAS = {
  'MEDICINA CLINICA Y ESPECIALIDADES': 'MCE',
  'ADMINISTRACION Y GESTION EN SALUD': 'AGS',
  'URGENCIAS, CUIDADOS CRITICOS Y ANESTESIA': 'UCA',
  ENFERMERIA: 'ENF',
  'LITERATURA, REVISTAS Y ESPARCIMIENTO': 'LRE',
  'CIENCIAS BASICAS DE LA SALUD Y FARMACOLOGIA': 'CBF',
  'BIOETICA Y LEGISLACION EN SALUD': 'BLS',
  'RECURSOS HUMANOS, LIDERAZGO Y NEGOCIOS': 'RHN',
  'SALUD PUBLICA, EPIDEMIOLOGIA Y NUTRICION': 'SPN',
  'INVESTIGACION Y METODOLOGIA': 'IYM',
  IDIOMAS: 'IDI',
  'TECNOLOGIA, CIENCIAS EXACTAS Y DIVULGACION': 'TCD',
  'HISTORIA, ARTE Y CULTURA GENERAL': 'HAC',
  EDUCACION: 'EDU',
  'CIENCIAS SOCIALES, POLITICA Y DERECHO': 'CSD',
  'PSICOLOGIA Y DESARROLLO HUMANO': 'PDH',
  'PARAPSICOLOGIA Y ESOTERISMO': 'PYE',
};

// La columna Ubicación viene como "Zona <letra> - <área>" (con espaciados
// inconsistentes: "Zona  A -", "Zona A- ", etc.). Si no calza con ese
// patrón (ubicaciones antiguas tipo "Estante A-3", o vacías), se usa "X"
// de zona y el texto completo como área, para no perder el dato.
function parseZonaArea(ubicacion) {
  const texto = String(ubicacion || '').trim();
  const m = texto.match(/ZONA\s*([A-Za-z])\s*-\s*(.+)/i);
  if (m) return { zona: m[1].toUpperCase(), area: m[2].trim() };
  return { zona: 'X', area: texto };
}

function codigoArea(area) {
  if (!area) return 'SU'; // sin ubicación
  const clave = normalizarTexto(area);
  return AREAS_CONOCIDAS[clave] || abreviarPalabras(area, 3) || 'SU';
}

// "Cutter" simplificado: apellido del primer autor. Ignora coautores
// (separados por ";"), notas entre paréntesis ("(editores)") e iniciales
// sueltas ("G.", "F."), y toma la última palabra "real" que queda —
// normalmente el apellido.
function cutterAutor(autor, letras) {
  const primero = String(autor || '').split(';')[0].replace(/\([^)]*\)/g, '');
  const palabras = normalizarTexto(primero)
    .split(/[^A-Z]+/)
    .filter((p) => p.length >= 3); // descarta iniciales tipo "G", "F"
  if (!palabras.length) return '';
  return palabras[palabras.length - 1].slice(0, letras);
}

// Código de estante: EP-<ZONA>-<ÁREA>-<CATEGORÍA>-<AUTOR>. No es un código
// de barras para escanear; es una signatura para etiquetar el lomo del
// libro combinando dónde vive físicamente (zona + área, de la columna
// Ubicación), de qué trata (categoría) y quién lo escribió (autor).
//
// No lleva número de ejemplares ni consecutivo visible. Si dos libros
// DISTINTOS llegaran a coincidir exactamente en los cuatro elementos (muy
// raro: mismo autor, misma categoría, misma zona y área), el sistema alarga
// en silencio la categoría y, si hiciera falta, el autor, hasta que el
// código sea único — nunca se mezclan dos libros bajo el mismo código.
async function generarCodigoUbicacion(ubicacion, categoria, autor) {
  const { zona, area } = parseZonaArea(ubicacion);
  const areaCod = codigoArea(area);

  for (let letrasCat = 4; letrasCat <= 10; letrasCat++) {
    const catCod = abreviarPalabras(categoria, letrasCat) || 'GEN';
    for (let letrasAutor = 3; letrasAutor <= 8; letrasAutor++) {
      const autorCod = cutterAutor(autor, letrasAutor) || 'SA';
      const cand = `EP-${zona}-${areaCod}-${catCod}-${autorCod}`;
      const existe = await query('SELECT id FROM libros WHERE codigo_barras = ?', [cand]);
      if (!existe.length) return cand;
    }
  }

  // Última salida, muy poco probable: ni ampliando categoría ni autor se
  // logró un código libre. Se agrega un número aleatorio para garantizar
  // unicidad.
  for (let intento = 0; intento < 10; intento++) {
    const cand = `EP-${zona}-${areaCod}-` + String(Math.floor(100000 + Math.random() * 900000));
    const existe = await query('SELECT id FROM libros WHERE codigo_barras = ?', [cand]);
    if (!existe.length) return cand;
  }
  throw new Error('No se pudo generar un código único para este libro');
}

// GET /api/libros  — catálogo con búsqueda (título, autor, tema, palabra clave, ISBN)
router.get('/', async (req, res) => {
  const { q, categoria, disponibles } = req.query;
  const { where, params } = filtroLibros(q, categoria, disponibles);
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

// Nombre de hoja de Excel válido a partir de un texto cualquiera: sin
// caracteres prohibidos, máximo 31 caracteres, y sin repetirse dentro del
// mismo libro.
function nombreHojaUnico(texto, usados) {
  const base = String(texto || 'Sin ubicación')
    .replace(/[:\\/?*[\]]/g, ' ')
    .trim()
    .slice(0, 31) || 'Sin ubicación';
  let nombre = base;
  let n = 2;
  while (usados.has(nombre.toLowerCase())) {
    const sufijo = ` (${n++})`;
    nombre = base.slice(0, 31 - sufijo.length) + sufijo;
  }
  usados.add(nombre.toLowerCase());
  return nombre;
}

// GET /api/libros/exportar  — Excel (.xlsx) con los datos de la etiqueta de
// cada libro, organizado en una hoja por zona/área física (misma agrupación
// que usa la signatura de ubicación), para poder imprimir las etiquetas
// recorriendo el acervo estante por estante. Respeta los mismos filtros que
// el listado.
router.get('/exportar', async (req, res) => {
  const { q, categoria, disponibles } = req.query;
  const { where, params } = filtroLibros(q, categoria, disponibles);
  const sql = `SELECT titulo, autor, categoria, ubicacion, codigo_barras FROM libros
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ubicacion ASC, categoria ASC, titulo ASC`;
  const libros = await query(sql, params);

  // Agrupa por zona + área ya interpretadas (parseZonaArea), no por el texto
  // crudo de "ubicacion": así "Zona A - X" y "Zona  A - X" (espaciados
  // distintos) caen en la misma hoja, igual que hace el generador de código.
  const grupos = new Map();
  for (const l of libros) {
    const { zona, area } = parseZonaArea(l.ubicacion);
    const clave = `${zona}|${normalizarTexto(area)}`;
    if (!grupos.has(clave)) {
      grupos.set(clave, { etiqueta: area ? `Zona ${zona} - ${area}` : 'Sin ubicación', filas: [] });
    }
    grupos.get(clave).filas.push(l);
  }
  if (!grupos.size) grupos.set('', { etiqueta: 'Sin ubicación', filas: [] });

  const gruposOrdenados = [...grupos.values()].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));

  const libro = new ExcelJS.Workbook();
  const nombresUsados = new Set();
  for (const { etiqueta, filas } of gruposOrdenados) {
    const hoja = libro.addWorksheet(nombreHojaUnico(etiqueta, nombresUsados));
    hoja.columns = [
      { header: 'Título', key: 'titulo', width: 50 },
      { header: 'Autor', key: 'autor', width: 30 },
      { header: 'Categoría', key: 'categoria', width: 25 },
      { header: 'Código', key: 'codigo_barras', width: 22 },
    ];
    hoja.getRow(1).font = { bold: true };
    filas.forEach((l) => hoja.addRow({
      titulo: l.titulo, autor: l.autor, categoria: l.categoria || '—', codigo_barras: l.codigo_barras,
    }));
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="codigos_libros.xlsx"');
  await libro.xlsx.write(res);
  res.end();
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
    codigo = await generarCodigoUbicacion(b.ubicacion, b.categoria, b.autor);
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
        codigo = await generarCodigoUbicacion(d.ubicacion, d.categoria, d.autor);
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
