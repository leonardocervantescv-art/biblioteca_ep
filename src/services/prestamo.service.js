const { withTransaction } = require('../config/database');
const prestamoModel = require('../models/prestamo.model');
const libroModel = require('../models/libro.model');
const lectorModel = require('../models/lector.model');
const { httpError } = require('../utils/httpError');
const { hoyISO, calcularVencimiento, DIAS_HABILES_PRESTAMO } = require('../utils/fechas');

const listar = (campusId, filtros) => prestamoModel.listar(campusId, filtros);

async function obtener(campusId, id) {
  const prestamo = await prestamoModel.buscarPorId(campusId, id);
  if (!prestamo) throw httpError(404, 'Préstamo no encontrado');
  return prestamo;
}

// Datos para el recibo de préstamo (PR-GE-16 3.6).
async function recibo(campusId, id) {
  return {
    prestamo: await obtener(campusId, id),
    institucion: 'Universidad EP de México — Biblioteca',
    procedimiento: 'PR-GE-16 Préstamos y salvaguardo de libros dentro de la biblioteca',
    lineamientos: [
      `El tiempo máximo de préstamo es de ${DIAS_HABILES_PRESTAMO} días hábiles.`,
      'La renovación se solicita en persona y sólo procede si no hay reservas para el mismo libro. Se permite una sola renovación.',
      'El libro debe devolverse en buen estado. La entrega en mal estado se sujeta a las Disposiciones generales del Formato de Préstamo firmado.',
      'El préstamo de libros es totalmente gratuito.',
      'No se realizan préstamos a usuarios que no presenten identificación válida.',
    ],
  };
}

// El Responsable de Biblioteca registra un préstamo.
async function registrar(campusId, b, usuarioId) {
  const { libro_id, lector_id } = b;
  if (!libro_id || !lector_id) throw httpError(400, 'Debes indicar el libro y el lector');
  // PR-GE-16: no se realiza préstamo a quien no presente identificación válida.
  if (b.identificacion_verificada !== true) {
    throw httpError(400, 'Debes confirmar que el lector presentó una identificación válida');
  }

  const fechaPrestamo = b.fecha_prestamo || hoyISO();
  const dias = Math.min(DIAS_HABILES_PRESTAMO, Math.max(1, parseInt(b.dias_habiles, 10) || DIAS_HABILES_PRESTAMO));
  const fechaVencimiento = calcularVencimiento(fechaPrestamo, dias);

  const prestamoId = await withTransaction(async (conn) => {
    const lector = await lectorModel.buscarPorId(campusId, lector_id, conn);
    if (!lector) throw httpError(404, 'Lector no encontrado');
    if (!lector.activo) throw httpError(400, 'El lector está inactivo');

    const libro = await libroModel.buscarPorIdBloqueando(campusId, libro_id, conn);
    if (!libro) throw httpError(404, 'Libro no encontrado');
    if (libro.observacion) throw httpError(400, `El libro tiene una observación en el sistema: ${libro.observacion}`);
    if (libro.cantidad_disponible < 1) throw httpError(400, 'No hay ejemplares disponibles de este libro');
    if (libro.estado_fisico === 'malo') throw httpError(400, 'El ejemplar está en mal estado y no puede prestarse');

    if (await prestamoModel.existeActivo(libro_id, lector_id, conn)) {
      throw httpError(409, 'El lector ya tiene un préstamo activo de este libro');
    }

    const id = await prestamoModel.insertar(campusId, {
      folio: await prestamoModel.siguienteFolio(conn),
      libro_id,
      lector_id,
      registrado_por: usuarioId,
      fecha_prestamo: fechaPrestamo,
      fecha_vencimiento: fechaVencimiento,
      estado_libro_entrega: libro.estado_fisico,
      observaciones: b.observaciones || null,
    }, conn);
    await libroModel.decrementarDisponible(libro_id, conn);
    return id;
  });

  return prestamoModel.buscarPorId(campusId, prestamoId);
}

// Registra la devolución del libro.
async function devolver(campusId, id, b) {
  const estadoDev = ['bueno', 'regular', 'malo'].includes(b.estado_libro) ? b.estado_libro : 'bueno';

  await withTransaction(async (conn) => {
    const p = await prestamoModel.buscarCrudoBloqueando(campusId, id, conn);
    if (!p) throw httpError(404, 'Préstamo no encontrado');
    if (p.estado !== 'activo') throw httpError(400, 'El préstamo ya fue devuelto');

    let obs = p.observaciones || '';
    if (estadoDev === 'malo' || estadoDev === 'regular') {
      const nota = `Devuelto en estado ${estadoDev}${b.nota ? ': ' + b.nota : ''} (aplicar Disposiciones generales del Formato de Préstamo).`;
      obs = obs ? `${obs} | ${nota}` : nota;
    } else if (b.nota) {
      obs = obs ? `${obs} | ${b.nota}` : b.nota;
    }

    await prestamoModel.marcarDevuelto({ id: p.id, fecha: hoyISO(), estadoLibro: estadoDev, observaciones: obs || null }, conn);
    await libroModel.incrementarDisponible(p.libro_id, conn);
    // Si el libro regresa deteriorado, se refleja en el acervo.
    if (estadoDev !== 'bueno') await libroModel.actualizarEstadoFisico(p.libro_id, estadoDev, conn);
  });

  return prestamoModel.buscarPorId(campusId, id);
}

// Renovación en persona (una sola vez).
async function renovar(campusId, id, b) {
  if (!b.observacion || !b.observacion.trim()) {
    throw httpError(400, 'La renovación requiere registrar una observación en el sistema');
  }

  await withTransaction(async (conn) => {
    const p = await prestamoModel.buscarCrudoBloqueando(campusId, id, conn);
    if (!p) throw httpError(404, 'Préstamo no encontrado');
    if (p.estado !== 'activo') throw httpError(400, 'Sólo se pueden renovar préstamos activos');
    if (p.renovaciones >= 1) throw httpError(400, 'Este préstamo ya fue renovado una vez (máximo permitido)');

    const base = hoyISO() > p.fecha_vencimiento ? hoyISO() : p.fecha_vencimiento;
    const nuevoVenc = calcularVencimiento(base, DIAS_HABILES_PRESTAMO);
    const nota = `Renovación: ${b.observacion.trim()}`;
    const obs = p.observaciones ? `${p.observaciones} | ${nota}` : nota;

    await prestamoModel.registrarRenovacion({ id: p.id, fechaVencimiento: nuevoVenc, observaciones: obs }, conn);
  });

  return prestamoModel.buscarPorId(campusId, id);
}

module.exports = { listar, obtener, recibo, registrar, devolver, renovar };
