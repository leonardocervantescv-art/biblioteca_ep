const libroModel = require('../models/libro.model');
const prestamoModel = require('../models/prestamo.model');
const { httpError } = require('../utils/httpError');
const { parseZonaArea, codigoArea, abreviarPalabras, cutterAutor } = require('../utils/signatura');
const { saneaFila } = require('../utils/saneaLibroCsv');

const ESTADOS_FISICOS = ['bueno', 'regular', 'malo'];

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
async function generarCodigoUbicacion(campusId, ubicacion, categoria, autor) {
  const { zona, area } = parseZonaArea(ubicacion);
  const areaCod = codigoArea(area);

  for (let letrasCat = 4; letrasCat <= 10; letrasCat++) {
    const catCod = abreviarPalabras(categoria, letrasCat) || 'GEN';
    for (let letrasAutor = 3; letrasAutor <= 8; letrasAutor++) {
      const autorCod = cutterAutor(autor, letrasAutor) || 'SA';
      const cand = `EP-${zona}-${areaCod}-${catCod}-${autorCod}`;
      if (!(await libroModel.existeCodigo(campusId, cand))) return cand;
    }
  }

  // Última salida, muy poco probable: ni ampliando categoría ni autor se
  // logró un código libre. Se agrega un número aleatorio para garantizar
  // unicidad.
  for (let intento = 0; intento < 10; intento++) {
    const cand = `EP-${zona}-${areaCod}-` + String(Math.floor(100000 + Math.random() * 900000));
    if (!(await libroModel.existeCodigo(campusId, cand))) return cand;
  }
  throw new Error('No se pudo generar un código único para este libro');
}

const listar = (campusId, filtros) => libroModel.listar(campusId, filtros);
const listarParaExportar = (campusId, filtros) => libroModel.listarParaExportar(campusId, filtros);
const categorias = (campusId) => libroModel.categorias(campusId);

// Catálogo público de consulta para estudiantes.
async function catalogo(campusId, filtros) {
  const libros = await libroModel.listarCatalogo(campusId, filtros);
  return libros.map((l) => ({ ...l, disponible: !!l.disponible }));
}

async function obtener(campusId, id) {
  const libro = await libroModel.buscarPorId(campusId, id);
  if (!libro) throw httpError(404, 'Libro no encontrado');
  return { ...libro, historial: await prestamoModel.historialPorLibro(id) };
}

async function crear(campusId, b) {
  if (!b.titulo || !b.autor) throw httpError(400, 'Título y autor son obligatorios');

  let codigo = (b.codigo_barras || '').trim();
  if (codigo) {
    if (await libroModel.existeCodigo(campusId, codigo)) throw httpError(409, 'Ya existe un libro con ese código de barras');
  } else {
    codigo = await generarCodigoUbicacion(campusId, b.ubicacion, b.categoria, b.autor);
  }
  const total = Math.max(1, parseInt(b.cantidad_total, 10) || 1);

  const id = await libroModel.crear(campusId, {
    titulo: b.titulo.trim(),
    autor: b.autor.trim(),
    isbn: b.isbn || null,
    editorial: b.editorial || null,
    anio: b.anio || null,
    categoria: b.categoria || null,
    palabras_clave: b.palabras_clave || null,
    codigo_barras: codigo,
    ubicacion: b.ubicacion || null,
    descripcion: b.descripcion || null,
    estado_fisico: ESTADOS_FISICOS.includes(b.estado_fisico) ? b.estado_fisico : 'bueno',
    observacion: b.observacion || null,
    cantidad_total: total,
    cantidad_disponible: total,
  });
  return libroModel.buscarPorId(campusId, id);
}

// Alta masiva desde un CSV ya parseado en el cliente. Cada fila con datos
// inválidos o fuera de rango se corrige en la medida de lo posible (queda
// registrado en `avisos`); sólo se omite por completo si le falta el título o
// el autor, si el código de barras está duplicado, o si la base de datos
// rechaza la inserción. Las filas correctas siempre se guardan.
async function importar(campusId, filas) {
  if (!Array.isArray(filas) || !filas.length) throw httpError(400, 'No se recibieron filas para importar');
  if (filas.length > 2000) throw httpError(400, 'Máximo 2000 libros por importación');

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
        if (await libroModel.existeCodigo(campusId, codigo)) {
          errores.push({ fila, error: `Se omitió: el código de barras ya existe (${codigo})` });
          continue;
        }
      } else {
        codigo = await generarCodigoUbicacion(campusId, d.ubicacion, d.categoria, d.autor);
      }
      codigosVistos.add(codigo);

      await libroModel.crear(campusId, {
        ...d,
        codigo_barras: codigo,
        observacion: null,
        cantidad_disponible: d.cantidad_total,
      });
      creados++;
      avisos.push(...avisosFila);
    } catch (e) {
      errores.push({ fila, error: 'Se omitió: la base de datos rechazó la fila (' + (e.code || e.message) + ')' });
    }
  }

  return { total: filas.length, creados, omitidos: errores.length, errores, avisos };
}

async function actualizar(campusId, id, b) {
  const libro = await libroModel.buscarPorId(campusId, id);
  if (!libro) throw httpError(404, 'Libro no encontrado');

  const nuevoTotal = b.cantidad_total != null ? Math.max(0, parseInt(b.cantidad_total, 10) || 0) : libro.cantidad_total;
  const prestados = libro.cantidad_total - libro.cantidad_disponible;
  if (nuevoTotal < prestados) {
    throw httpError(400, `No puedes bajar el total por debajo de ${prestados} (ejemplares prestados)`);
  }
  if (b.codigo_barras && b.codigo_barras.trim() !== libro.codigo_barras) {
    if (await libroModel.existeCodigo(campusId, b.codigo_barras.trim(), libro.id)) {
      throw httpError(409, 'Ya existe un libro con ese código de barras');
    }
  }

  await libroModel.actualizar(campusId, id, {
    titulo: b.titulo ?? libro.titulo,
    autor: b.autor ?? libro.autor,
    isbn: b.isbn ?? libro.isbn,
    editorial: b.editorial ?? libro.editorial,
    anio: b.anio ?? libro.anio,
    categoria: b.categoria ?? libro.categoria,
    palabras_clave: b.palabras_clave ?? libro.palabras_clave,
    codigo_barras: (b.codigo_barras && b.codigo_barras.trim()) || libro.codigo_barras,
    ubicacion: b.ubicacion ?? libro.ubicacion,
    descripcion: b.descripcion ?? libro.descripcion,
    estado_fisico: ESTADOS_FISICOS.includes(b.estado_fisico) ? b.estado_fisico : libro.estado_fisico,
    observacion: b.observacion ?? libro.observacion,
    cantidad_total: nuevoTotal,
    cantidad_disponible: nuevoTotal - prestados,
  });
  return libroModel.buscarPorId(campusId, id);
}

async function eliminar(campusId, id) {
  // Un libro de otro campus se trata igual que uno inexistente: no se toca
  // nada ni se revela que existe.
  if (!(await libroModel.buscarPorId(campusId, id))) return { ok: true };
  if ((await prestamoModel.contarActivosPorLibro(id)) > 0) {
    throw httpError(400, 'No se puede eliminar: el libro tiene préstamos activos');
  }
  await prestamoModel.eliminarPorLibro(id);
  await libroModel.eliminar(campusId, id);
  return { ok: true };
}

module.exports = {
  generarCodigoUbicacion, listar, listarParaExportar, categorias, catalogo,
  obtener, crear, importar, actualizar, eliminar,
};
