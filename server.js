<<<<<<< HEAD
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Salvavidas para toda la app:
// - uncaughtException: errores síncronos que se escapan sin try/catch (por
//   ejemplo, que falte una variable obligatoria en .env al cargar un módulo).
//   Se muestra un mensaje claro y se cierra — igual que antes, pero legible.
// - unhandledRejection: errores dentro de una ruta `async` que nadie captura.
//   Antes esto tumbaba TODO el servidor para todos los usuarios con sólo un
//   dato faltante en una petición (así se cayó todo el proceso al iniciar
//   sesión sin JWT_SECRET). Ahora sólo se registra en consola: esa petición
//   se queda sin respuesta, pero el resto de la biblioteca sigue funcionando.
process.on('uncaughtException', (err) => {
  console.error('\n  No se pudo iniciar/mantener el servidor:', err.message);
  console.error('  Revisa tu archivo .env (compáralo con .env.example) y vuelve a intentar.\n');
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('Error no controlado en una petición (no se detuvo el servidor):', err);
});

const { initDatabase, query } = require('./src/db');
const { authRequired } = require('./src/auth');
=======
const config = require('./src/config/env');
const app = require('./src/app');
const { initDatabase } = require('./src/config/database');
>>>>>>> 0981d66 (Usuarios para otros campus)
const { ensureAdmin } = require('./src/seed');

// Un error no controlado no debe dejar el servidor "colgado" sin pistas:
// se deja constancia en el log. Tras una excepción no capturada el estado del
// proceso es incierto, así que se sale para que PM2/systemd lo reinicien.
process.on('unhandledRejection', (motivo) => console.error('Promesa rechazada sin manejar:', motivo));
process.on('uncaughtException', (err) => {
  console.error('Excepción no capturada:', err);
  process.exit(1);
});

(async () => {
  try {
    config.validar();
    await initDatabase();
    await ensureAdmin();
    app.listen(config.puerto, config.host, () => {
      console.log('\n  Universidad EP de México — Sistema de Gestión de Biblioteca');
      console.log(`  Escuchando en ${config.host}:${config.puerto} (NODE_ENV=${config.entorno})`);
      console.log(`  Local:   http://localhost:${config.puerto}`);
      if (config.urlPublica) console.log(`  Público: ${config.urlPublica}`);
      else console.log('  Público: usa la IP o el dominio del servidor en el puerto indicado (define PUBLIC_URL en .env para mostrarlo aquí).\n');
    });
  } catch (e) {
    console.error('No se pudo iniciar el servidor:', e.message);
    console.error('Revisa la configuración del archivo .env y que MySQL esté corriendo.');
    process.exit(1);
  }
})();
