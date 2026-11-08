const lectorModel = require('../models/lector.model');
const prestamoModel = require('../models/prestamo.model');
const { httpError } = require('../utils/httpError');

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

  const numero = b.identificacion_num.trim();
  if (await lectorModel.existeIdentificacion(campusId, b.identificacion_tipo, numero)) {
    throw httpError(409, 'Ya existe un lector con esa identificación');
  }
  const id = await lectorModel.crear(campusId, {
    nombre: b.nombre.trim(),
    tipo: b.tipo,
    identificacion_tipo: b.identificacion_tipo,
    identificacion_num: numero,
    matricula: b.matricula || null,
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

  const numero = String(b.identificacion_num).trim();
  if (await lectorModel.existeIdentificacion(campusId, b.identificacion_tipo, numero, id)) {
    throw httpError(409, 'Ya existe un lector con esa identificación');
  }
  await lectorModel.actualizar(campusId, id, {
    nombre: String(b.nombre).trim(),
    tipo: b.tipo,
    identificacion_tipo: b.identificacion_tipo,
    identificacion_num: numero,
    matricula: b.matricula || null,
    carrera_area: b.carrera_area || null,
    email: b.email || null,
    telefono: b.telefono || null,
    activo: b.activo ? 1 : 0,
  });
  return lectorModel.buscarPorId(campusId, id);
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

module.exports = { listar, obtener, crear, actualizar, eliminar };
