const libroService = require('../services/libro.service');
const exportacionService = require('../services/exportacion.service');

// Todas las operaciones se hacen sobre el campus de la sesión (req.user.campus_id).

const listar = async (req, res) => res.json(await libroService.listar(req.user.campus_id, req.query));

const categorias = async (req, res) => res.json(await libroService.categorias(req.user.campus_id));

// Excel (.xlsx) con los códigos de los libros, respetando los filtros del listado.
const exportar = async (req, res) => {
  const libros = await libroService.listarParaExportar(req.user.campus_id, req.query);
  const excel = exportacionService.crearLibroDeCodigos(libros);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="codigos_libros.xlsx"');
  await excel.xlsx.write(res);
  res.end();
};

const obtener = async (req, res) => res.json(await libroService.obtener(req.user.campus_id, req.params.id));

const crear = async (req, res) => res.status(201).json(await libroService.crear(req.user.campus_id, req.body || {}));

const importar = async (req, res) => {
  const resultado = await libroService.importar(req.user.campus_id, req.body && req.body.libros);
  res.status(resultado.creados ? 200 : 422).json(resultado);
};

const actualizar = async (req, res) => res.json(await libroService.actualizar(req.user.campus_id, req.params.id, req.body || {}));

const eliminar = async (req, res) => res.json(await libroService.eliminar(req.user.campus_id, req.params.id));

module.exports = { listar, categorias, exportar, obtener, crear, importar, actualizar, eliminar };
