const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { db: config } = require('./env');
const { ejecutarMigraciones } = require('./migrations');

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...config,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      multipleStatements: true,
      dateStrings: true,
    });
  }
  return pool;
}

// Crea la base de datos si no existe y aplica el esquema.
async function initDatabase() {
  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    multipleStatements: true,
  });
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await conn.changeUser({ database: config.database });

  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await conn.query(schema);
  await ejecutarMigraciones(conn);
  await conn.end();
}

async function query(sql, params) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

// Ejecuta `fn(conn)` dentro de una transacción: commit si termina bien,
// rollback si lanza, y siempre devuelve la conexión al pool.
async function withTransaction(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const resultado = await fn(conn);
    await conn.commit();
    return resultado;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Devuelve una función con la misma forma que `query`, pero que usa la
// conexión de una transacción si se le pasa `conn`. Permite que un mismo
// método de modelo sirva dentro y fuera de transacciones.
function ejecutor(conn) {
  if (!conn) return query;
  return async (sql, params) => (await conn.execute(sql, params))[0];
}

module.exports = { getPool, initDatabase, query, withTransaction, ejecutor, config };
