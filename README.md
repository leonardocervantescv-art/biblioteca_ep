# Sistema de Gestión de Biblioteca — Universidad EP de México

Aplicación web para administrar el préstamo y salvaguardo de libros de la
biblioteca, conforme al procedimiento **PR-GE-16 "Préstamos y salvaguardo de
libros dentro de la biblioteca"**.

El sistema tiene **un único usuario: el administrador** (Responsable de
Biblioteca), quien realiza toda la gestión.

## Stack

- **Node.js + Express** (API REST)
- **MySQL** (`mysql2`)
- Autenticación con **JWT** + `bcryptjs`
- Frontend en HTML/CSS/JavaScript sin framework (`public/`)

## Requisitos

- Node.js 18+
- MySQL 8 en `localhost:3306`

## Puesta en marcha

```bash
npm install
cp .env.example .env      # ajusta credenciales de MySQL si es necesario
npm start
```

El servidor, al arrancar:

1. Crea la base de datos `biblioteca_ep` si no existe.
2. Aplica el esquema `src/schema.sql`.
3. Si **no existe ningún usuario**, crea la cuenta de administrador con los
   datos del `.env` (`ADMIN_NOMBRE` / `ADMIN_EMAIL` / `ADMIN_PASSWORD`).

**No se cargan libros, lectores ni préstamos de ejemplo.** Todo el contenido se
captura desde la aplicación y vive únicamente en la base de datos.

Abre <http://localhost:3000>.

### Cuenta del administrador

Se toma del archivo `.env`. Valores por defecto:

| Correo | Contraseña |
| --- | --- |
| `admin@universidadep.mx` | `Admin123` |

> Cambia `ADMIN_EMAIL` / `ADMIN_PASSWORD` en `.env` **antes** del primer arranque,
> o cambia la contraseña desde **Cambiar contraseña** dentro del sistema.

Para recrear sólo la cuenta de administrador (si la tabla `usuarios` está vacía):
`npm run seed`. Para empezar de cero: `DROP DATABASE biblioteca_ep;` y `npm start`.

## Funcionalidad (según PR-GE-16)

### Registro de libros
Alta con título, autor, ISBN, editorial, año, **categoría / clasificación**
(Materia, Tema…), palabras clave, **código de barras único** (se genera solo si
no se indica), **ubicación en estantería**, estado físico y número de ejemplares.
Edición, baja y ficha con historial de préstamos.

**Importación masiva por CSV** (botón *Importar CSV*): se sube un archivo o se
pega su contenido. La primera fila son los encabezados; se reconocen
`titulo, autor, isbn, editorial, anio, categoria, palabras_clave, codigo_barras,
ubicacion, descripcion, estado_fisico, cantidad_total` (con acentos, mayúsculas o
sinónimos como *ejemplares*, *clasificación*, *tema*…). Separador coma, punto y
coma o tabulación. Sólo `titulo` y `autor` son obligatorios. Hay una plantilla
descargable.

**Manejo de errores por fila:** cada fila se valida y se sanea de forma
independiente. Los valores fuera de rango o con formato inválido se corrigen y la
fila se guarda igual (año no numérico o fuera de `-3000…año+1` → vacío; cantidad
inválida → 1; cantidad excesiva → 10000; `estado_fisico` desconocido → `bueno`;
texto que excede el límite de su columna → recortado). Sólo se **omite** la fila
completa si le falta el título o el autor, si su código de barras está duplicado,
o si MySQL rechaza la inserción. El resultado muestra: libros creados, filas
omitidas (con motivo) y correcciones aplicadas (con detalle). Endpoint:
`POST /api/libros/importar` → `{ total, creados, omitidos, errores, avisos }`.

### Lectores
Registro de las personas autorizadas para préstamo: **estudiantes** (credencial
de estudiante), **personal administrativo** y **personal académico** (INE). El
sistema valida que el tipo de identificación corresponda al tipo de lector.

### Operación de préstamo
- El administrador registra el préstamo eligiendo lector y libro (búsqueda por
  título, autor, tema, palabra clave o código de barras).
- Debe confirmar que el lector **presentó identificación válida** y que el libro
  se entrega en buen estado.
- El sistema verifica disponibilidad y observaciones del libro.
- Calcula la **fecha de vencimiento a 6 días hábiles** (máximo permitido).
- Genera un **recibo imprimible** con los datos del préstamo, la fecha de
  vencimiento y los lineamientos de la biblioteca.

### Devolución
Registro de la devolución indicando el **estado del libro**. Si se recibe en
estado regular o malo, queda la observación en el sistema (aplicar Disposiciones
generales del Formato de Préstamo) y el acervo refleja el deterioro.

### Renovación
Renovación **en persona, una sola vez**, ampliando 6 días hábiles. Requiere
registrar una **observación** en el sistema.

### Panel
Indicadores: títulos, ejemplares totales / disponibles / prestados, lectores
activos, préstamos activos, que vencen hoy y vencidos; libros por categoría y
últimos préstamos.

## Estructura

```
server.js                 Arranque y endpoint /api/stats
src/
  db.js                   Pool de MySQL + creación de BD/esquema
  auth.js                 JWT (middleware authRequired)
  seed.js                 Bootstrap de la cuenta de administrador (sin datos demo)
  schema.sql              Esquema de la base de datos
  util/fechas.js          Cálculo de días hábiles
  routes/
    auth.routes.js        login, perfil, cambio de contraseña
    libros.routes.js      CRUD de libros + búsqueda + categorías
    lectores.routes.js    CRUD de lectores
    prestamos.routes.js   préstamo, devolución, renovación, recibo
public/                   Cliente web (SPA vanilla)
```

## API (resumen)

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/api/auth/login` | Inicio de sesión |
| PATCH | `/api/auth/password` | Cambiar contraseña |
| GET | `/api/stats` | Indicadores del panel |
| GET/POST | `/api/libros` | Listar (con `?q=&categoria=&disponibles=1`) / crear |
| POST | `/api/libros/importar` | Alta masiva `{ libros: [...] }` (CSV) |
| GET/PUT/DELETE | `/api/libros/:id` | Ficha / editar / eliminar |
| GET | `/api/libros/categorias` | Categorías existentes |
| GET/POST | `/api/lectores` | Listar (`?q=&tipo=&activo=`) / crear |
| GET/PUT/DELETE | `/api/lectores/:id` | Ficha / editar / eliminar (o desactivar) |
| GET/POST | `/api/prestamos` | Listar (`?q=&estado=activo\|vencido\|devuelto`) / registrar |
| GET | `/api/prestamos/:id/recibo` | Datos del recibo |
| PATCH | `/api/prestamos/:id/devolucion` | Registrar devolución |
| PATCH | `/api/prestamos/:id/renovacion` | Renovar (una vez) |

Todas las rutas (excepto `login`) requieren cabecera
`Authorization: Bearer <token>`.
