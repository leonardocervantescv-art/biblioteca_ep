// Única puerta de entrada a la configuración: el resto del código lee de
// aquí en vez de tocar process.env directamente.
require('dotenv').config();

const config = {
  entorno: process.env.NODE_ENV || 'development',
  esProduccion: process.env.NODE_ENV === 'production',
  puerto: process.env.PORT || 3000,
  // '0.0.0.0' escucha en todas las interfaces (localhost e IP/dominio público).
  host: process.env.HOST || '0.0.0.0',
  // Detrás de un proxy inverso (Nginx, Apache, IIS/ARR…) para leer la IP real
  // del cliente y el protocolo vía X-Forwarded-*.
  confiarEnProxy: Boolean(process.env.TRUST_PROXY),
  // Dominios permitidos para CORS, separados por coma. Vacío = cualquier origen.
  corsOrigenes: (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  urlPublica: process.env.PUBLIC_URL || '',
  jwt: {
    secreto: process.env.JWT_SECRET,
    expiraEn: process.env.JWT_EXPIRES_IN || '8h',
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'biblioteca_ep',
  },
  admin: {
    nombre: process.env.ADMIN_NOMBRE,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  },
};

// Se llama al arrancar el servidor (no al importar este archivo, para que
// `npm run seed` no exija variables que no necesita).
config.validar = function validar() {
  if (!config.jwt.secreto) {
    throw new Error('JWT_SECRET es obligatorio: defínelo en el archivo .env antes de arrancar el servidor.');
  }
};

module.exports = config;
