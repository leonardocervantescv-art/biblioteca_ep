const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { signToken, authRequired } = require('../auth');

const router = express.Router();

// POST /api/auth/login  — acceso del administrador
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
  }
  const rows = await query('SELECT * FROM usuarios WHERE email = ? LIMIT 1', [
    String(email).trim().toLowerCase(),
  ]);
  const user = rows[0];
  if (!user || !user.activo) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas' });

  res.json({
    token: signToken(user),
    usuario: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol },
  });
});

// GET /api/auth/perfil
router.get('/perfil', authRequired, async (req, res) => {
  const rows = await query(
    'SELECT id, nombre, email, rol, creado_en FROM usuarios WHERE id = ?',
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(rows[0]);
});

// PATCH /api/auth/password  — el administrador cambia su propia contraseña
router.patch('/password', authRequired, async (req, res) => {
  const { actual, nueva } = req.body || {};
  if (!actual || !nueva) {
    return res.status(400).json({ error: 'Debes indicar la contraseña actual y la nueva' });
  }
  if (String(nueva).length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }
  const rows = await query('SELECT * FROM usuarios WHERE id = ?', [req.user.id]);
  const user = rows[0];
  const ok = await bcrypt.compare(actual, user.password_hash);
  if (!ok) return res.status(400).json({ error: 'La contraseña actual no es correcta' });

  const hash = await bcrypt.hash(nueva, 10);
  await query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
