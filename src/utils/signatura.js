// Piezas puras (sin base de datos) de la signatura de ubicación:
//   EP-<ZONA>-<ÁREA>-<CATEGORÍA>-<AUTOR>
// La generación completa (que necesita comprobar unicidad en la base de
// datos) vive en services/libro.service.js.

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

module.exports = { normalizarTexto, abreviarPalabras, AREAS_CONOCIDAS, parseZonaArea, codigoArea, cutterAutor };
