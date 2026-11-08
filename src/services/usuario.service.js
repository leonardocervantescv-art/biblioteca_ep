const bcrypt = require('bcryptjs');
const usuarioModel = require('../models/usuario.model');
const campusModel = require('../models/campus.model');
const cacheUsuarios = require('../utils/cacheUsuarios');
const { httpError } = require('../utils/httpError');

// Gestión de administradores (sólo el superadmin llega aquí, ver las rutas).
//   superadmin: crea campus y administradores; además opera en su propio campus.
//   admin:      administra únicamente el campus al que pertenece.
const ROLES = ['admin', 'superadmin'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const listar = () => usuarioModel.listar();

async function validarCampus(campusId) {
  const campus = campusId ? await campusModel.buscarPorId(campusId) : null;
  if (!campus) throw httpError(400, 'Selecciona un campus válido');
  return campus;
}

function validarCorreo(email) {
  const correo = String(email || '').trim().toLowerCase();
  if (!EMAIL.test(correo)) throw httpError(400, 'El correo electrónico no es válido');
  if (correo.length > 150) throw httpError(400, 'El correo es demasiado largo');
  return correo;
}

function validarPassword(password) {
  if (String(password || '').length < 6) throw httpError(400, 'La contraseña debe tener al menos 6 caracteres');
  return String(password);
}

async function crear(b) {
  const nombre = String(b.nombre || '').trim();
  if (!nombre) throw httpError(400, 'El nombre es obligatorio');
  const email = validarCorreo(b.email);
  const password = validarPassword(b.password);
  const rol = b.rol || 'admin';
  if (!ROLES.includes(rol)) throw httpError(400, 'Rol inválido');
  const campus = await validarCampus(b.campus_id);
  if (!campus.activo) throw httpError(400, 'No se pueden crear administradores en un campus desactivado');
  if (await usuarioModel.existeEmail(email)) throw httpError(409, 'Ya existe un usuario con ese correo');

  const id = await usuarioModel.crear({
    nombre, email, rol, campusId: campus.id, passwordHash: await bcrypt.hash(password, 10),
  });
  return usuarioModel.perfilPorId(id);
}

// `actorId` es quien hace el cambio (para impedir que se quite sus propios
// permisos y se bloquee fuera del sistema).
async function actualizar(actorId, id, b) {
  const usuario = await usuarioModel.buscarPorId(id);
  if (!usuario) throw httpError(404, 'Usuario no encontrado');

  const nombre = b.nombre === undefined ? usuario.nombre : String(b.nombre).trim();
  if (!nombre) throw httpError(400, 'El nombre es obligatorio');
  const email = b.email === undefined ? usuario.email : validarCorreo(b.email);
  const rol = b.rol === undefined ? usuario.rol : b.rol;
  if (!ROLES.includes(rol)) throw httpError(400, 'Rol inválido');
  const campusId = b.campus_id === undefined ? usuario.campus_id : (await validarCampus(b.campus_id)).id;
  const activo = b.activo === undefined ? usuario.activo : (b.activo ? 1 : 0);

  if (email !== usuario.email && (await usuarioModel.existeEmail(email, id))) {
    throw httpError(409, 'Ya existe un usuario con ese correo');
  }
  if (Number(id) === actorId && (!activo || rol !== 'superadmin')) {
    throw httpError(400, 'No puedes desactivar tu propia cuenta ni quitarte el rol de superadministrador');
  }
  // Siempre debe quedar al menos un superadministrador activo.
  const seguiaSiendoSuperadmin = usuario.rol === 'superadmin' && usuario.activo;
  if (seguiaSiendoSuperadmin && (rol !== 'superadmin' || !activo) && (await usuarioModel.contarSuperadminsActivos(id)) < 1) {
    throw httpError(400, 'Debe quedar al menos un superadministrador activo');
  }

  await usuarioModel.actualizar(id, { nombre, email, rol, campusId, activo });
  if (b.password !== undefined && b.password !== '') {
    await usuarioModel.actualizarPassword(id, await bcrypt.hash(validarPassword(b.password), 10));
  }
  cacheUsuarios.invalidar();
  return usuarioModel.perfilPorId(id);
}

module.exports = { listar, crear, actualizar };
