// Error con código HTTP: los servicios lo lanzan y el middleware de errores
// lo convierte en la respuesta JSON correspondiente.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const httpError = (status, message) => new HttpError(status, message);

module.exports = { HttpError, httpError };
