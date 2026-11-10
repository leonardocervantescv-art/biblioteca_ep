const lectorModel = require('../models/lector.model');
const prestamoModel = require('../models/prestamo.model');
const { httpError } = require('../utils/httpError');
const { normalizarTexto } = require('../utils/signatura');

const TIPOS = ['estudiante', 'administrativo', 'academico'];
const IDS = ['credencial_estudiante', 'INE'];

// PR-GE-16: los estudiantes se identifican con credencial de estudiante; el
// personal administrativo y académico con INE.
function validar(b) {
  if (!b.nombre || !b.nombre.trim()) return 'El nombre es obligatorio';
  if (!TIPOS.includes(b.tipo)) return 'Tipo de lector inválido';
  if (!IDS.includes(b.identificacion_tipo)) return 'Tipo de identificación inválido';
  if (b.tipo === 'estudiante' && b.identificacion_tipo !== 'credencial_estudiante') {
    return 'Los estudiantes deben identificarse con credencial de estudiante';
  }
  if (b.tipo !== 'estudiante' && b.identificacion_tipo !== 'INE') {
    return 'El personal administrativo y académico debe identificarse con INE';
  }
  return null;
}

function listar(campusId, { q, tipo, activo } = {}) {
  return lectorModel.listar(campusId, {
    q,
    tipo: tipo && TIPOS.includes(tipo) ? tipo : undefined,
    activo: activo === '1' || activo === '0' ? Number(activo) : undefined,
  });
}

// Con préstamos activos e historial.
async function obtener(campusId, id) {
  const lector = await lectorModel.buscarPorId(campusId, id);
  if (!lector) throw httpError(404, 'Lector no encontrado');
  return { ...lector, prestamos: await prestamoModel.listarPorLector(id) };
}

async function crear(campusId, b) {
  const err = validar(b);
  if (err) throw httpError(400, err);

  const matricula = String(b.matricula || '').trim() || null;
  if (matricula && await lectorModel.existeMatricula(campusId, matricula)) {
    throw httpError(409, 'Ya existe un lector con esa matrícula');
  }
  const id = await lectorModel.crear(campusId, {
    nombre: b.nombre.trim(),
    tipo: b.tipo,
    identificacion_tipo: b.identificacion_tipo,
    matricula,
    carrera_area: b.carrera_area || null,
    email: b.email || null,
    telefono: b.telefono || null,
  });
  return lectorModel.buscarPorId(campusId, id);
}

async function actualizar(campusId, id, cambios) {
  const actual = await lectorModel.buscarPorId(campusId, id);
  if (!actual) throw httpError(404, 'Lector no encontrado');
  const b = { ...actual, ...cambios };
  const err = validar(b);
  if (err) throw httpError(400, err);

  const matricula = String(b.matricula || '').trim() || null;
  if (matricula && matricula !== actual.matricula && await lectorModel.existeMatricula(campusId, matricula, id)) {
    throw httpError(409, 'Ya existe un lector con esa matrícula');
  }
  await lectorModel.actualizar(campusId, id, {
    nombre: String(b.nombre).trim(),
    tipo: b.tipo,
    identificacion_tipo: b.identificacion_tipo,
    matricula,
    carrera_area: b.carrera_area || null,
    email: b.email || null,
    telefono: b.telefono || null,
    activo: b.activo ? 1 : 0,
  });
  return lectorModel.buscarPorId(campusId, id);
}

// Longitudes máximas (deben coincidir con schema.sql).
const LIMITES = { nombre: 150, matricula: 30, carrera_area: 150, email: 150, telefono: 30 };
const MAX_IMPORTAR = 2000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Alta masiva desde un CSV ya parseado en el cliente. Todas las filas son del
// mismo `tipo` (el que se elige al subir el archivo) y la identificación se
// deduce de él. Sólo se omite una fila si no tiene nombre o si el lector ya
// existe en el campus (misma matrícula o, sin matrícula, mismo nombre y tipo);
// los datos fuera de formato se corrigen y se avisa. Las filas correctas
// siempre se guardan.
async function importar(campusId, tipo, filas) {
  if (!TIPOS.includes(tipo)) throw httpError(400, 'Selecciona el tipo de lector: estudiante, administrativo o académico');
  if (!Array.isArray(filas) || !filas.length) throw httpError(400, 'No se recibieron filas para importar');
  if (filas.length > MAX_IMPORTAR) throw httpError(400, `Máximo ${MAX_IMPORTAR} lectores por importación`);

  const idTipo = tipo === 'estudiante' ? 'credencial_estudiante' : 'INE';
  const claveMat = (m) => normalizarTexto(m);
  const claveNombre = (n) => `${tipo}|${normalizarTexto(n)}`;

  const existentes = await lectorModel.clavesDuplicado(campusId);
  const matriculas = new Set(existentes.filter((l) => l.matricula).map((l) => claveMat(l.matricula)));
  const nombres = new Set(existentes.filter((l) => !l.matricula && l.tipo === tipo).map((l) => claveNombre(l.nombre)));

  let creados = 0;
  const errores = [];
  const avisos = [];

  for (let i = 0; i < filas.length; i++) {
    const fila = i + 1;
    const f = filas[i] || {};
    const texto = (campo) => {
      let v = String(f[campo] ?? '').trim();
      if (!v) return null;
      if (v.length > LIMITES[campo]) {
        v = v.slice(0, LIMITES[campo]);
        avisos.push({ fila, aviso: `"${campo}" excedía ${LIMITES[campo]} caracteres; se recortó` });
      }
      return v;
    };

    const nombre = texto('nombre');
    if (!nombre) { errores.push({ fila, error: 'Se omitió: falta el nombre' }); continue; }
    const matricula = texto('matricula');
    const carrera_area = texto('carrera_area');
    const telefono = texto('telefono');
    let email = texto('email');
    if (email && !EMAIL.test(email)) {
      avisos.push({ fila, aviso: `el correo "${email}" no es válido; se guardó sin correo` });
      email = null;
    }

    const clave = matricula ? claveMat(matricula) : claveNombre(nombre);
    const vistos = matricula ? matriculas : nombres;
    if (vistos.has(clave)) {
      errores.push({ fila, error: matricula
        ? `Se omitió: la matrícula ${matricula} ya existe en este campus o está repetida en el archivo`
        : `Se omitió: ya existe un lector con el nombre "${nombre}" y sin matrícula` });
      continue;
    }

    try {
      await lectorModel.crear(campusId, { nombre, tipo, identificacion_tipo: idTipo, matricula, carrera_area, email, telefono });
      vistos.add(clave);
      creados++;
    } catch (e) {
      errores.push({ fila, error: 'Se omitió: la base de datos rechazó la fila (' + (e.code || e.message) + ')' });
    }
  }

  return { total: filas.length, creados, omitidos: errores.length, errores, avisos };
}

async function eliminar(campusId, id) {
  // Un lector de otro campus se trata igual que uno inexistente.
  if (!(await lectorModel.buscarPorId(campusId, id))) return { ok: true };
  if ((await prestamoModel.contarActivosPorLector(id)) > 0) {
    throw httpError(400, 'No se puede eliminar: el lector tiene préstamos activos');
  }
  if ((await prestamoModel.contarPorLector(id)) > 0) {
    // Conservar el historial: sólo se desactiva.
    await lectorModel.desactivar(campusId, id);
    return { ok: true, desactivado: true };
  }
  await lectorModel.eliminar(campusId, id);
  return { ok: true };
}

module.exports = { listar, obtener, crear, importar, actualizar, eliminar };
