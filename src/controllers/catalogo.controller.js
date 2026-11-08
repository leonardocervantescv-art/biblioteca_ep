const libroService = require('../services/libro.service');
const campusService = require('../services/campus.service');

// Catálogo público de consulta para estudiantes: sólo lectura, sin
// autenticación. ?campus=<clave> elige el campus (por defecto, el primero).
const campus = async (req, res) => res.json(await campusService.publicos());

const libros = async (req, res) => {
  const c = await campusService.resolverPublico(req.query.campus);
  res.json(await libroService.catalogo(c.id, req.query));
};

const categorias = async (req, res) => {
  const c = await campusService.resolverPublico(req.query.campus);
  res.json(await libroService.categorias(c.id));
};

module.exports = { campus, libros, categorias };
