const authService = require('../services/auth.service');

const login = async (req, res) => {
  const { email, password } = req.body || {};
  res.json(await authService.login(email, password));
};

const perfil = async (req, res) => res.json(await authService.perfil(req.user.id));

const cambiarPassword = async (req, res) => {
  const { actual, nueva } = req.body || {};
  res.json(await authService.cambiarPassword(req.user.id, actual, nueva));
};

module.exports = { login, perfil, cambiarPassword };
