const ExcelJS = require('exceljs');
const { parseZonaArea, normalizarTexto } = require('../utils/signatura');

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

// Excel (.xlsx) con los datos de la etiqueta de cada libro, organizado en una
// hoja por zona/área física (misma agrupación que usa la signatura de
// ubicación), para poder imprimir las etiquetas recorriendo el acervo
// estante por estante.
function crearLibroDeCodigos(libros) {
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

  const ordenados = [...grupos.values()].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));

  const libro = new ExcelJS.Workbook();
  const nombresUsados = new Set();
  for (const { etiqueta, filas } of ordenados) {
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
  return libro;
}

module.exports = { crearLibroDeCodigos };
