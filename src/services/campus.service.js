const campusModel = require('../models/campus.model');
const cacheUsuarios = require('../utils/cacheUsuarios');
const { httpError } = require('../utils/httpError');
const { normalizarTexto } = require('../utils/signatura');

const CLAVE_VALIDA = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// "Campus Guadalajara" -> "campus-guadalajara"
function generarClave(nombre) {
  return normalizarTexto(nombre).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

const listar = () => campusModel.listarConConteos();

// Campus que consulta un estudiante: cada campus tiene su propia vista, así
// que el enlace debe indicar su clave y NO existe un listado público de campus.
// Sólo si el sistema tiene un único campus activo se puede omitir la clave.
async function resolverPublico(clave) {
  let campus;
  if (clave) {
    campus = await campusModel.buscarPorClave(String(clave));
  } else {
    if ((await campusModel.contarActivos()) !== 1) {
      throw httpError(400, 'Falta indicar el campus: usa el enlace de la biblioteca de tu campus');
    }
    campus = await campusModel.primeroActivo();
  }
  if (!campus || !campus.activo) throw httpError(404, 'Campus no encontrado');
  return campus;
}

const datosPublicos = (c) => ({ clave: c.clave, nombre: c.nombre, ciudad: c.ciudad });

function validarDatos(b) {
  const nombre = String(b.nombre || '').trim();
  if (!nombre) throw httpError(400, 'El nombre del campus es obligatorio');
  if (nombre.length > 150) throw httpError(400, 'El nombre del campus es demasiado largo (máximo 150 caracteres)');
  const ciudad = String(b.ciudad || '').trim() || null;
  if (ciudad && ciudad.length > 100) throw httpError(400, 'La ciudad es demasiado larga (máximo 100 caracteres)');
  return { nombre, ciudad };
}

async function crear(b) {
  const { nombre, ciudad } = validarDatos(b);
  const clave = String(b.clave || '').trim().toLowerCase() || generarClave(nombre);
  if (clave.length < 2 || clave.length > 30 || !CLAVE_VALIDA.test(clave)) {
    throw httpError(400, 'La clave sólo admite letras minúsculas, números y guiones (2 a 30 caracteres)');
  }
  if (await campusModel.buscarPorClave(clave)) throw httpError(409, 'Ya existe un campus con esa clave');

  const id = await campusModel.crear({ clave, nombre, ciudad });
  return campusModel.buscarPorId(id);
}

// La clave no se puede cambiar: forma parte de las direcciones públicas.
async function actualizar(id, b) {
  const campus = await campusModel.buscarPorId(id);
  if (!campus) throw httpError(404, 'Campus no encontrado');
  const { nombre, ciudad } = validarDatos(b);
  const activo = b.activo === undefined ? campus.activo : (b.activo ? 1 : 0);

  if (!activo && campus.activo && (await campusModel.contarActivos()) <= 1) {
    throw httpError(400, 'Debe haber al menos un campus activo');
  }
  await campusModel.actualizar(id, { nombre, ciudad, activo });
  cacheUsuarios.invalidar();
  return campusModel.buscarPorId(id);
}

module.exports = { listar, resolverPublico, datosPublicos, crear, actualizar };
