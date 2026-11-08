// Rutas /api que no existen: JSON en vez del HTML por defecto de Express.
function apiNoEncontrada(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

// Último middleware: convierte cualquier error en una respuesta JSON.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'El archivo es demasiado grande. Divídelo en partes más pequeñas (máximo 2000 libros por importación).',
    });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El contenido enviado no es válido' });
  }
  // Errores esperados lanzados por los servicios (HttpError 400/404/409…).
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
}

module.exports = { apiNoEncontrada, errorHandler };
