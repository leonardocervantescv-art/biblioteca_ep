const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const usuarioModel = require('../models/usuario.model');
const { httpError } = require('../utils/httpError');

function firmarToken(user) {
  return jwt.sign(
    { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, campus_id: user.campus_id },
    config.jwt.secreto,
    { expiresIn: config.jwt.expiraEn }
  );
}

// Forma en que el cliente ve al usuario (sin hash).
const vistaUsuario = (u) => ({
  id: u.id,
  nombre: u.nombre,
  email: u.email,
  rol: u.rol,
  campus: { id: u.campus_id, nombre: u.campus_nombre, clave: u.campus_clave },
});

async function login(email, password) {
  if (!email || !password) throw httpError(400, 'Email y contraseña son obligatorios');
  const user = await usuarioModel.buscarPorEmail(String(email).trim().toLowerCase());
  if (!user || !user.activo) throw httpError(401, 'Credenciales incorrectas');
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw httpError(401, 'Credenciales incorrectas');
  if (user.rol !== 'superadmin' && !user.campus_activo) {
    throw httpError(401, 'El campus de tu cuenta está desactivado');
  }

  return { token: firmarToken(user), usuario: vistaUsuario(user) };
}

async function perfil(userId) {
  const user = await usuarioModel.perfilPorId(userId);
  if (!user) throw httpError(404, 'Usuario no encontrado');
  return { ...vistaUsuario(user), creado_en: user.creado_en };
}

// El administrador cambia su propia contraseña.
async function cambiarPassword(userId, actual, nueva) {
  if (!actual || !nueva) throw httpError(400, 'Debes indicar la contraseña actual y la nueva');
  if (String(nueva).length < 6) throw httpError(400, 'La nueva contraseña debe tener al menos 6 caracteres');

  const user = await usuarioModel.buscarPorId(userId);
  if (!user) throw httpError(404, 'Usuario no encontrado');
  const ok = await bcrypt.compare(actual, user.password_hash);
  if (!ok) throw httpError(400, 'La contraseña actual no es correcta');

  await usuarioModel.actualizarPassword(userId, await bcrypt.hash(nueva, 10));
  return { ok: true };
}

module.exports = { login, perfil, cambiarPassword };
