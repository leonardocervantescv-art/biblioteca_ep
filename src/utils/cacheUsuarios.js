// Caché corto (30 s) del usuario autenticado, para no consultar la base de
// datos en cada petición. Cuando se modifica un usuario o un campus se vacía
// con `invalidar()` para que el cambio se vea de inmediato en este proceso
// (otros procesos lo verán en cuanto expire el TTL).
const TTL_MS = 30 * 1000;
const cache = new Map();

async function obtener(id, cargar) {
  const hit = cache.get(id);
  if (hit && hit.expira > Date.now()) return hit.valor;
  const valor = await cargar(id);
  cache.set(id, { valor, expira: Date.now() + TTL_MS });
  return valor;
}

const invalidar = () => cache.clear();

module.exports = { obtener, invalidar };
