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

module.exports = { saneaFila };
