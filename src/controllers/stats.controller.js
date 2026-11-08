const statsService = require('../services/stats.service');

const resumen = async (req, res) => res.json(await statsService.resumen(req.user.campus_id));

module.exports = { resumen };
