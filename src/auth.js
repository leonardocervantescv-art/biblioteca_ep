const jwt = require('jsonwebtoken');

// Sin JWT_SECRET no se puede firmar ni verificar ninguna sesión: se valida
// aquí, al cargar el módulo (es decir, al arrancar `node server.js`), para
// que el problema se vea de inmediato con un mensaje claro — en vez de que
// el servidor arranque "bien" y luego se caiga por completo en el primer
// intento de inicio de sesión (como pasaba antes: el error quedaba sin
// capturar dentro de una ruta async y tumbaba todo el proceso de Node).
if (!process.env.JWT_SECRET) {
  throw new Error(
    'Falta JWT_SECRET en el archivo .env. Cópialo de .env.example, complétalo ' +
    '(usa una cadena larga y aleatoria) y vuelve a arrancar el servidor.'
  );
}
const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

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
