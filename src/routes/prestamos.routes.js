const express = require('express');
const { envolver } = require('../middlewares/asyncHandler');
const { authRequired } = require('../middlewares/auth');
const ctrl = envolver(require('../controllers/prestamo.controller'));

const router = express.Router();
router.use(authRequired);

router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.get('/:id/recibo', ctrl.recibo);
router.post('/', ctrl.registrar);
router.patch('/:id/devolucion', ctrl.devolver);
router.patch('/:id/renovacion', ctrl.renovar);

module.exports = router;
