// Utilidades para escribir migraciones idempotentes (MySQL 8 no tiene
// ADD COLUMN IF NOT EXISTS ni DROP INDEX IF EXISTS).

async function existeColumna(conn, tabla, columna) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabla, columna]
  );
  return rows.length > 0;
}

async function existeIndice(conn, tabla, indice) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [tabla, indice]
  );
  return rows.length > 0;
}

// Nombres de los índices UNIQUE (que no son la clave primaria) formados
// únicamente por `columna`.
async function indicesUnicosDeColumna(conn, tabla, columna) {
  const [rows] = await conn.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'
     GROUP BY INDEX_NAME
     HAVING COUNT(*) = 1 AND MAX(COLUMN_NAME) = ?`,
    [tabla, columna]
  );
  return rows.map((r) => r.INDEX_NAME);
}

async function existeFk(conn, tabla, nombre) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [tabla, nombre]
  );
  return rows.length > 0;
}

module.exports = { existeColumna, existeIndice, indicesUnicosDeColumna, existeFk };
