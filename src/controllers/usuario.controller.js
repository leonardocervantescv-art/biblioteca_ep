const usuarioService = require('../services/usuario.service');

const listar = async (req, res) => res.json(await usuarioService.listar());
const crear = async (req, res) => res.status(201).json(await usuarioService.crear(req.body || {}));
const actualizar = async (req, res) => res.json(await usuarioService.actualizar(req.user.id, req.params.id, req.body || {}));

module.exports = { listar, crear, actualizar };
