const express = require('express');
const { envolver } = require('../middlewares/asyncHandler');
const { authRequired } = require('../middlewares/auth');
const ctrl = envolver(require('../controllers/lector.controller'));

const router = express.Router();
router.use(authRequired);

router.get('/', ctrl.listar);
router.post('/importar', ctrl.importar); // antes de /:id
router.get('/:id', ctrl.obtener);
router.post('/', ctrl.crear);
router.put('/:id', ctrl.actualizar);
router.delete('/:id', ctrl.eliminar);

module.exports = router;
