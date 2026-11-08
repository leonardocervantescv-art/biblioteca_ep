const express = require('express');
const { envolver } = require('../middlewares/asyncHandler');
const { authRequired } = require('../middlewares/auth');
const ctrl = envolver(require('../controllers/auth.controller'));

const router = express.Router();

router.post('/login', ctrl.login);                                // acceso del administrador
router.get('/perfil', authRequired, ctrl.perfil);
router.patch('/password', authRequired, ctrl.cambiarPassword);    // cambia su propia contraseña

module.exports = router;
