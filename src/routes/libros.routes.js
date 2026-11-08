const express = require('express');
const { envolver } = require('../middlewares/asyncHandler');
const { authRequired } = require('../middlewares/auth');
const ctrl = envolver(require('../controllers/libro.controller'));

const router = express.Router();
router.use(authRequired);

// Las rutas fijas (/categorias, /exportar, /importar) van antes de /:id.
router.get('/', ctrl.listar);
router.get('/categorias', ctrl.categorias);
router.get('/exportar', ctrl.exportar);
router.post('/importar', ctrl.importar);
router.get('/:id', ctrl.obtener);
router.post('/', ctrl.crear);
router.put('/:id', ctrl.actualizar);
router.delete('/:id', ctrl.eliminar);

module.exports = router;
