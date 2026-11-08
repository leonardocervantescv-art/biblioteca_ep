const express = require('express');
const { envolver } = require('../middlewares/asyncHandler');
const { authRequired, requerirRol } = require('../middlewares/auth');
const ctrl = envolver(require('../controllers/usuario.controller'));

// Gestión de administradores: sólo el superadministrador.
const router = express.Router();
router.use(authRequired, requerirRol('superadmin'));

router.get('/', ctrl.listar);
router.post('/', ctrl.crear);
router.put('/:id', ctrl.actualizar);

module.exports = router;
