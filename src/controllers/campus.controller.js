const campusService = require('../services/campus.service');

const listar = async (req, res) => res.json(await campusService.listar());
const crear = async (req, res) => res.status(201).json(await campusService.crear(req.body || {}));
const actualizar = async (req, res) => res.json(await campusService.actualizar(req.params.id, req.body || {}));

module.exports = { listar, crear, actualizar };
