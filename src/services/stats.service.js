const statsModel = require('../models/stats.model');

// Indicadores del panel del administrador.
async function resumen(campusId) {
  const [libros, lectores, prestamos, porCategoria, prestamosRecientes] = await Promise.all([
    statsModel.resumenLibros(campusId),
    statsModel.resumenLectores(campusId),
    statsModel.resumenPrestamos(campusId),
    statsModel.librosPorCategoria(campusId),
    statsModel.prestamosRecientes(campusId),
  ]);

  return {
    libros: {
      titulos: libros.titulos,
      ejemplares: Number(libros.ejemplares),
      disponibles: Number(libros.disponibles),
      prestados: Number(libros.ejemplares) - Number(libros.disponibles),
    },
    lectores: { total: lectores.total, activos: Number(lectores.activos || 0) },
    prestamos: {
      activos: Number(prestamos.activos || 0),
      devueltos: Number(prestamos.devueltos || 0),
      vencidos: Number(prestamos.vencidos || 0),
      vencen_hoy: Number(prestamos.vencen_hoy || 0),
    },
    porCategoria,
    prestamosRecientes,
  };
}

module.exports = { resumen };
