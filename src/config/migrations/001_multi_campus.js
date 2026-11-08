// Multi-campus: cada campus tiene su propio catálogo de libros, lectores y
// préstamos, y sus propios administradores.
//
//  - Crea la tabla `campus` y un "Campus principal" al que se asigna todo lo
//    que ya existía (la base de producción no pierde nada).
//  - `usuarios`, `libros`, `lectores` y `prestamos` pasan a llevar `campus_id`.
//  - Los usuarios existentes pasan a ser `superadmin` (pueden crear campus y
//    administradores); los nuevos se crean como `admin` de un campus.
//  - Los códigos de libro y las identificaciones de lector dejan de ser únicos
//    en todo el sistema y pasan a serlo por campus.
//
// Todos los pasos comprueban antes si ya están aplicados, así que se puede
// volver a ejecutar sin riesgo si se interrumpe a la mitad (el DDL de MySQL
// no es transaccional).
const { existeColumna, existeIndice, indicesUnicosDeColumna, existeFk } = require('./helpers');

async function agregarCampusId(conn, tabla, campusPorDefecto) {
  if (!(await existeColumna(conn, tabla, 'campus_id'))) {
    await conn.query(`ALTER TABLE ${tabla} ADD COLUMN campus_id INT NULL`);
  }
  await conn.query(`UPDATE ${tabla} SET campus_id = ? WHERE campus_id IS NULL`, [campusPorDefecto]);
  await conn.query(`ALTER TABLE ${tabla} MODIFY campus_id INT NOT NULL`);
  if (!(await existeFk(conn, tabla, `fk_${tabla}_campus`))) {
    await conn.query(`ALTER TABLE ${tabla} ADD CONSTRAINT fk_${tabla}_campus FOREIGN KEY (campus_id) REFERENCES campus(id)`);
  }
}

async function crearIndice(conn, tabla, nombre, definicion, unico = false) {
  if (await existeIndice(conn, tabla, nombre)) return;
  await conn.query(`ALTER TABLE ${tabla} ADD ${unico ? 'UNIQUE ' : ''}INDEX ${nombre} (${definicion})`);
}

module.exports = {
  nombre: '001_multi_campus',

  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS campus (
        id        INT AUTO_INCREMENT PRIMARY KEY,
        clave     VARCHAR(30)  NOT NULL UNIQUE,
        nombre    VARCHAR(150) NOT NULL,
        ciudad    VARCHAR(100) NULL,
        activo    TINYINT(1)   NOT NULL DEFAULT 1,
        creado_en TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    let [[campus]] = await conn.query("SELECT id FROM campus WHERE clave = 'principal'");
    if (!campus) {
      const [r] = await conn.query("INSERT INTO campus (clave, nombre) VALUES ('principal', 'Campus principal')");
      campus = { id: r.insertId };
    }
    const campusId = campus.id;

    // ---- usuarios: pertenecen a un campus y tienen rol ----
    if (!(await existeColumna(conn, 'usuarios', 'campus_id'))) {
      await conn.query('ALTER TABLE usuarios ADD COLUMN campus_id INT NULL');
      // Los usuarios que ya existían manejan todo el sistema: superadmin.
      await conn.query("ALTER TABLE usuarios MODIFY rol ENUM('superadmin','admin') NOT NULL DEFAULT 'admin'");
      await conn.query("UPDATE usuarios SET rol = 'superadmin', campus_id = ?", [campusId]);
    }
    await conn.query('UPDATE usuarios SET campus_id = ? WHERE campus_id IS NULL', [campusId]);
    await conn.query('ALTER TABLE usuarios MODIFY campus_id INT NOT NULL');
    if (!(await existeFk(conn, 'usuarios', 'fk_usuarios_campus'))) {
      await conn.query('ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_campus FOREIGN KEY (campus_id) REFERENCES campus(id)');
    }

    // ---- libros, lectores, préstamos: datos propios de cada campus ----
    await agregarCampusId(conn, 'libros', campusId);
    await agregarCampusId(conn, 'lectores', campusId);
    await agregarCampusId(conn, 'prestamos', campusId);
    // Los préstamos existentes heredan el campus de su libro.
    await conn.query('UPDATE prestamos p JOIN libros l ON l.id = p.libro_id SET p.campus_id = l.campus_id');

    // ---- unicidad por campus ----
    for (const idx of await indicesUnicosDeColumna(conn, 'libros', 'codigo_barras')) {
      await conn.query(`ALTER TABLE libros DROP INDEX \`${idx}\``);
    }
    await crearIndice(conn, 'libros', 'uq_libros_campus_codigo', 'campus_id, codigo_barras', true);

    if (await existeIndice(conn, 'lectores', 'uq_lector_identificacion')) {
      await conn.query('ALTER TABLE lectores DROP INDEX uq_lector_identificacion');
    }
    await crearIndice(conn, 'lectores', 'uq_lector_campus_identificacion', 'campus_id, identificacion_tipo, identificacion_num', true);

    // ---- índices para filtrar y ordenar dentro de un campus ----
    await crearIndice(conn, 'libros', 'idx_libros_campus_titulo', 'campus_id, titulo');
    await crearIndice(conn, 'libros', 'idx_libros_campus_categoria', 'campus_id, categoria');
    await crearIndice(conn, 'lectores', 'idx_lectores_campus_nombre', 'campus_id, nombre');
    await crearIndice(conn, 'prestamos', 'idx_prestamos_campus_estado', 'campus_id, estado');
  },
};
