const jwt = require('jsonwebtoken');
const config = require('../config/env');
const usuarioModel = require('../models/usuario.model');
const cacheUsuarios = require('../utils/cacheUsuarios');

// Exige una sesión válida. req.user = { id, nombre, email, rol, campus_id }.
//
// El rol y el campus NO se toman del token (que podría estar desactualizado):
// se leen de la base de datos (con un caché corto, ver cacheUsuarios). Así,
// desactivar a un administrador o cambiarlo de campus surte efecto en
// segundos y no hasta que expire su sesión.
async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secreto);
  } catch (e) {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }

  try {
    const u = await cacheUsuarios.obtener(payload.id, usuarioModel.perfilPorId);
    if (!u || !u.activo) return res.status(401).json({ error: 'Sesión inválida o expirada' });
    if (u.rol !== 'superadmin' && !u.campus_activo) {
      return res.status(401).json({ error: 'El campus de tu cuenta está desactivado' });
    }
    req.user = { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, campus_id: u.campus_id };
    next();
  } catch (e) {
    next(e);
  }
}

// Restringe una ruta a ciertos roles (se usa después de authRequired).
const requerirRol = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.rol)) {
    return res.status(403).json({ error: 'No tienes permiso para realizar esta acción' });
  }
  next();
};

module.exports = { authRequired, requerirRol };
