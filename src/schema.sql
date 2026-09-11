
CREATE TABLE IF NOT EXISTS usuarios (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(150) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol           ENUM('admin') NOT NULL DEFAULT 'admin',
  activo        TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS lectores (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  nombre              VARCHAR(150) NOT NULL,
  tipo                ENUM('estudiante','administrativo','academico') NOT NULL,
  identificacion_tipo ENUM('credencial_estudiante','INE') NOT NULL,
  identificacion_num  VARCHAR(50)  NOT NULL,
  matricula           VARCHAR(30)  NULL,
  carrera_area        VARCHAR(150) NULL,
  email               VARCHAR(150) NULL,
  telefono            VARCHAR(30)  NULL,
  activo              TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lector_identificacion (identificacion_tipo, identificacion_num),
  INDEX idx_lectores_nombre (nombre),
  INDEX idx_lectores_matricula (matricula)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  libros: registro del acervo (PR-GE-16 sección "Registro de libros").
--  Cada ejemplar se identifica con un código de barras único y una ubicación
--  específica en las estanterías.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS libros (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  titulo              VARCHAR(255) NOT NULL,
  autor               VARCHAR(200) NOT NULL,
  isbn                VARCHAR(20)  NULL,
  editorial           VARCHAR(150) NULL,
  anio                SMALLINT     NULL,
  categoria           VARCHAR(100) NULL,          -- sistema de clasificación (Materia, Tema, ...)
  palabras_clave      VARCHAR(255) NULL,          -- para rastrear el libro en el sistema
  codigo_barras       VARCHAR(40)  NOT NULL UNIQUE,
  ubicacion           VARCHAR(100) NULL,          -- estantería / posición
  descripcion         TEXT         NULL,
  estado_fisico       ENUM('bueno','regular','malo') NOT NULL DEFAULT 'bueno',
  observacion         VARCHAR(255) NULL,          -- ej. "en reparación", "extraviado"
  cantidad_total      INT NOT NULL DEFAULT 1,
  cantidad_disponible INT NOT NULL DEFAULT 1,
  creado_en           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_libros_titulo (titulo),
  INDEX idx_libros_autor (autor),
  INDEX idx_libros_categoria (categoria)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  prestamos: operación de préstamo registrada por el Responsable de Biblioteca.
--  Plazo máximo: 6 días hábiles. Se permite una renovación en persona si no hay
--  otras reservas para el mismo libro.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prestamos (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  folio                  VARCHAR(20)  NOT NULL UNIQUE,
  libro_id               INT NOT NULL,
  lector_id              INT NOT NULL,
  registrado_por         INT NULL,
  fecha_prestamo         DATE NOT NULL,
  fecha_vencimiento      DATE NOT NULL,
  fecha_devolucion       DATE NULL,
  estado                 ENUM('activo','devuelto') NOT NULL DEFAULT 'activo',
  renovaciones           INT NOT NULL DEFAULT 0,
  estado_libro_entrega   ENUM('bueno','regular','malo') NOT NULL DEFAULT 'bueno',
  estado_libro_devolucion ENUM('bueno','regular','malo') NULL,
  observaciones          VARCHAR(500) NULL,
  creado_en              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prestamo_libro   FOREIGN KEY (libro_id)       REFERENCES libros(id),
  CONSTRAINT fk_prestamo_lector  FOREIGN KEY (lector_id)      REFERENCES lectores(id),
  CONSTRAINT fk_prestamo_usuario FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_prestamos_estado (estado),
  INDEX idx_prestamos_vencimiento (fecha_vencimiento)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
