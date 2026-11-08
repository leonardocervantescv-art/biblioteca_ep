const express = require('express');
const { envolver } = require('../middlewares/asyncHandler');
const ctrl = envolver(require('../controllers/catalogo.controller'));

// Catálogo público de consulta para estudiantes (sin autenticación).
const router = express.Router();

router.get('/campus', ctrl.campus);
router.get('/libros', ctrl.libros);
router.get('/categorias', ctrl.categorias);

module.exports = router;
