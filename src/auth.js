const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET es obligatorio en producción: defínelo en el archivo .env antes de arrancar el servidor.');
}
const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN;

function signToken(user) {
  return jwt.sign(
    { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

// El sistema sólo tiene un tipo de usuario: el administrador (Responsable de
// Biblioteca). Cualquier acceso a la API requiere una sesión válida.
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

module.exports = { signToken, authRequired };
