// Express 4 no captura los errores de funciones async: una promesa rechazada
// (p. ej. MySQL caído o una consulta que falla) dejaría la petición colgada o
// tumbaría el proceso. Este envoltorio la manda al middleware de errores.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Envuelve todas las funciones de un controlador de una vez.
const envolver = (controlador) => Object.fromEntries(
  Object.entries(controlador).map(([nombre, fn]) => [nombre, asyncHandler(fn)])
);

module.exports = { asyncHandler, envolver };
