const prestamoService = require('../services/prestamo.service');

const listar = async (req, res) => res.json(await prestamoService.listar(req.user.campus_id, req.query));
const obtener = async (req, res) => res.json(await prestamoService.obtener(req.user.campus_id, req.params.id));
const recibo = async (req, res) => res.json(await prestamoService.recibo(req.user.campus_id, req.params.id));
const registrar = async (req, res) =>
  res.status(201).json(await prestamoService.registrar(req.user.campus_id, req.body || {}, req.user.id));
const devolver = async (req, res) => res.json(await prestamoService.devolver(req.user.campus_id, req.params.id, req.body || {}));
const renovar = async (req, res) => res.json(await prestamoService.renovar(req.user.campus_id, req.params.id, req.body || {}));

module.exports = { listar, obtener, recibo, registrar, devolver, renovar };
