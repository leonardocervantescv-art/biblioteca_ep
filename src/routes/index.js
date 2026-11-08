const express = require('express');
const { envolver } = require('../middlewares/asyncHandler');
const { authRequired } = require('../middlewares/auth');
const stats = envolver(require('../controllers/stats.controller'));

// Todas las rutas de la API (se montan bajo /api en app.js).
const router = express.Router();

router.get('/health', (req, res) => res.json({ ok: true }));

router.use('/auth', require('./auth.routes'));
router.use('/libros', require('./libros.routes'));
router.use('/lectores', require('./lectores.routes'));
router.use('/prestamos', require('./prestamos.routes'));
router.use('/campus', require('./campus.routes'));      // sólo superadmin
router.use('/usuarios', require('./usuarios.routes'));  // sólo superadmin
router.use('/catalogo', require('./catalogo.routes'));  // público, sólo lectura
router.get('/stats', authRequired, stats.resumen);      // indicadores del panel

module.exports = router;
