// Lectores: se elimina el campo "número de identificación". Se conserva el
// tipo de identificación (credencial de estudiante / INE) y los datos del
// lector quedan en: nombre, tipo, tipo de identificación, matrícula, carrera
// o área, correo y teléfono.
//
// Al quitar el número desaparece también la restricción de unicidad por
// (campus, tipo, número); la matrícula, si se captura, se valida por campus
// desde el servicio.
//
// Idempotente: se puede volver a ejecutar si se interrumpe a la mitad.
const { existeColumna, existeIndice } = require('./helpers');

module.exports = {
  nombre: '002_lectores_sin_numero_identificacion',
  async up(conn) {
    if (await existeIndice(conn, 'lectores', 'uq_lector_campus_identificacion')) {
      await conn.query('ALTER TABLE lectores DROP INDEX uq_lector_campus_identificacion');
    }
    if (await existeIndice(conn, 'lectores', 'uq_lector_identificacion')) {
      await conn.query('ALTER TABLE lectores DROP INDEX uq_lector_identificacion');
    }
    if (await existeColumna(conn, 'lectores', 'identificacion_num')) {
      await conn.query('ALTER TABLE lectores DROP COLUMN identificacion_num');
    }
    if (!(await existeIndice(conn, 'lectores', 'idx_lectores_campus_matricula'))) {
      await conn.query('ALTER TABLE lectores ADD INDEX idx_lectores_campus_matricula (campus_id, matricula)');
    }
  },
};
