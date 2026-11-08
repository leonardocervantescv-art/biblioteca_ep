// Utilidades de fechas para el cálculo de plazos de préstamo.
// PR-GE-16: "El tiempo máximo de préstamo de libros es de 10 días hábiles".

const DIAS_HABILES_PRESTAMO = 10;

// Suma `n` días hábiles (lunes a viernes) a una fecha, saltando sábados y
// domingos. No contempla días festivos oficiales.
function sumarDiasHabiles(fecha, n) {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  let restantes = n;
  while (restantes > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay(); // 0 = domingo, 6 = sábado
    if (dow !== 0 && dow !== 6) restantes--;
  }
  return d;
}

// Devuelve una fecha en formato YYYY-MM-DD (para columnas DATE de MySQL).
function aISO(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function hoyISO() {
  return aISO(new Date());
}

// Fecha de vencimiento a partir de una fecha de préstamo (string YYYY-MM-DD).
function calcularVencimiento(fechaPrestamoISO, dias = DIAS_HABILES_PRESTAMO) {
  const [y, m, d] = fechaPrestamoISO.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  return aISO(sumarDiasHabiles(base, dias));
}

module.exports = { DIAS_HABILES_PRESTAMO, sumarDiasHabiles, aISO, hoyISO, calcularVencimiento };
