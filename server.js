const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const { initDatabase, query } = require('./src/db');
const { authRequired } = require('./src/auth');
const { ensureAdmin } = require('./src/seed');

const authRoutes = require('./src/routes/auth.routes');
const librosRoutes = require('./src/routes/libros.routes');
const lectoresRoutes = require('./src/routes/lectores.routes');
const prestamosRoutes = require('./src/routes/prestamos.routes');
const catalogoRoutes = require('./src/routes/catalogo.routes');

const app = express();
const PORT = process.env.PORT || 3000;
// '0.0.0.0' escucha en todas las interfaces de red del servidor, no sólo en
// localhost: así es accesible por la IP pública o el dominio en producción.
const HOST = process.env.HOST || '0.0.0.0';

// Detrás de un proxy inverso (Nginx, Apache, IIS con ARR, un balanceador…)
// Express necesita esto para leer correctamente la IP real del cliente y el
// protocolo (http/https) que llegó al proxy, vía las cabeceras X-Forwarded-*.
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);

// CORS_ORIGIN: lista de dominios permitidos separados por coma
// (ej. "https://biblioteca.epdemexico.edu.mx,https://www.epdemexico.edu.mx").
// Si no se define, se permite cualquier origen (útil en desarrollo o cuando
// el frontend se sirve desde este mismo servidor, como aquí).
const corsOrigenes = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors(corsOrigenes.length ? { origin: corsOrigenes } : undefined));
// Límite amplio: la importación masiva de libros (CSV) puede enviar miles de filas.
app.use(express.json({ limit: '15mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/libros', librosRoutes);
app.use('/api/lectores', lectoresRoutes);
app.use('/api/prestamos', prestamosRoutes);
// Catálogo de consulta para estudiantes: sin autenticación, sólo lectura.
app.use('/api/catalogo', catalogoRoutes);

// Panel de indicadores para el administrador
app.get('/api/stats', authRequired, async (req, res) => {
  const [libros] = await query(
    'SELECT COUNT(*) AS titulos, COALESCE(SUM(cantidad_total),0) AS ejemplares, COALESCE(SUM(cantidad_disponible),0) AS disponibles FROM libros'
  );
  const [lectores] = await query(
    "SELECT COUNT(*) AS total, SUM(activo = 1) AS activos FROM lectores"
  );
  const [prestamos] = await query(
    `SELECT
       SUM(estado = 'activo') AS activos,
       SUM(estado = 'devuelto') AS devueltos,
       SUM(estado = 'activo' AND fecha_vencimiento < CURDATE()) AS vencidos,
       SUM(estado = 'activo' AND fecha_vencimiento = CURDATE()) AS vencen_hoy
     FROM prestamos`
  );
  const porCategoria = await query(
    "SELECT COALESCE(categoria,'Sin categoría') AS categoria, COUNT(*) AS n FROM libros GROUP BY categoria ORDER BY n DESC"
  );
  const prestamosRecientes = await query(
    `SELECT p.folio, p.fecha_prestamo, p.fecha_vencimiento, p.estado,
            l.titulo AS libro_titulo, le.nombre AS lector_nombre
     FROM prestamos p JOIN libros l ON l.id = p.libro_id JOIN lectores le ON le.id = p.lector_id
     ORDER BY p.id DESC LIMIT 8`
  );
  res.json({
    libros: { titulos: libros.titulos, ejemplares: Number(libros.ejemplares), disponibles: Number(libros.disponibles), prestados: Number(libros.ejemplares) - Number(libros.disponibles) },
    lectores: { total: lectores.total, activos: Number(lectores.activos || 0) },
    prestamos: {
      activos: Number(prestamos.activos || 0),
      devueltos: Number(prestamos.devueltos || 0),
      vencidos: Number(prestamos.vencidos || 0),
      vencen_hoy: Number(prestamos.vencen_hoy || 0),
    },
    porCategoria,
    prestamosRecientes,
  });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'El archivo es demasiado grande. Divídelo en partes más pequeñas (máximo 2000 libros por importación).',
    });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El contenido enviado no es válido' });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

(async () => {
  try {
    await initDatabase();
    await ensureAdmin();
    app.listen(PORT, HOST, () => {
      console.log('\n  Universidad EP de México — Sistema de Gestión de Biblioteca');
      console.log(`  Escuchando en ${HOST}:${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
      console.log(`  Local:   http://localhost:${PORT}`);
      if (process.env.PUBLIC_URL) console.log(`  Público: ${process.env.PUBLIC_URL}`);
      else console.log('  Público: usa la IP o el dominio del servidor en el puerto indicado (define PUBLIC_URL en .env para mostrarlo aquí).\n');
    });
  } catch (e) {
    console.error('No se pudo iniciar el servidor:', e.message);
    console.error('Revisa la configuración de MySQL en el archivo .env');
    process.exit(1);
  }
})();
