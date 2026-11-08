// Migraciones: cambios al esquema posteriores a schema.sql (que es la base
// inicial y no se modifica). Se aplican en orden, una sola vez cada una, y se
// registran en la tabla `migraciones`. Para agregar una nueva, crea el
// archivo NNN_descripcion.js (exporta { nombre, up(conn) }) y añádelo aquí.
const MIGRACIONES = [
  require('./001_multi_campus'),
];

const LOCK = 'biblioteca_migraciones';

async function ejecutarMigraciones(conn) {
  // Si arrancan varias instancias a la vez (PM2 en modo cluster), sólo una
  // aplica las migraciones; las demás esperan y luego ven todo ya aplicado.
  await conn.query('SELECT GET_LOCK(?, 60)', [LOCK]);
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS migraciones (
        nombre      VARCHAR(100) PRIMARY KEY,
        aplicada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    const [hechas] = await conn.query('SELECT nombre FROM migraciones');
    const aplicadas = new Set(hechas.map((r) => r.nombre));

    for (const migracion of MIGRACIONES) {
      if (aplicadas.has(migracion.nombre)) continue;
      console.log(`  Aplicando migración ${migracion.nombre}…`);
      await migracion.up(conn);
      await conn.query('INSERT INTO migraciones (nombre) VALUES (?)', [migracion.nombre]);
    }
  } finally {
    await conn.query('SELECT RELEASE_LOCK(?)', [LOCK]);
  }
}

module.exports = { ejecutarMigraciones };
