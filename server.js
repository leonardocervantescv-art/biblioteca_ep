const config = require('./src/config/env');
const app = require('./src/app');
const { initDatabase } = require('./src/config/database');
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
