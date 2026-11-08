const lectorService = require('../services/lector.service');

const listar = async (req, res) => res.json(await lectorService.listar(req.user.campus_id, req.query));
const obtener = async (req, res) => res.json(await lectorService.obtener(req.user.campus_id, req.params.id));
const crear = async (req, res) => res.status(201).json(await lectorService.crear(req.user.campus_id, req.body || {}));
const actualizar = async (req, res) => res.json(await lectorService.actualizar(req.user.campus_id, req.params.id, req.body || {}));
const eliminar = async (req, res) => res.json(await lectorService.eliminar(req.user.campus_id, req.params.id));

module.exports = { listar, obtener, crear, actualizar, eliminar };
