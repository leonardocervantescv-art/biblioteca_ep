const libroService = require('../services/libro.service');
const campusService = require('../services/campus.service');

// Catálogo público de consulta para estudiantes: sólo lectura, sin
// autenticación. Cada campus tiene su propia vista: ?campus=<clave> es
// obligatorio (salvo que exista un único campus) y no se listan otros campus.
const campus = async (req, res) => res.json(campusService.datosPublicos(await campusService.resolverPublico(req.query.campus)));

const libros = async (req, res) => {
  const c = await campusService.resolverPublico(req.query.campus);
  res.json(await libroService.catalogo(c.id, req.query));
};

const categorias = async (req, res) => {
  const c = await campusService.resolverPublico(req.query.campus);
  res.json(await libroService.categorias(c.id));
};

module.exports = { campus, libros, categorias };
