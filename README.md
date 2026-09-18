Sistema de Gestión de Biblioteca — Universidad EP de México
Aplicación web para administrar el préstamo y salvaguardo de libros de la biblioteca, conforme al procedimiento PR-GE-16 "Préstamos y salvaguardo de libros dentro de la biblioteca".

El sistema tiene un único usuario: el administrador (Responsable de Biblioteca), quien realiza toda la gestión.

Registro de libros
Alta con título, autor, ISBN, editorial, año, categoría / clasificación (Materia, Tema…), palabras clave, código de barras único (se genera solo si no se indica), ubicación en estantería, estado físico y número de ejemplares. Edición, baja y ficha con historial de préstamos.

Importación masiva por CSV (botón Importar CSV): se sube un archivo o se pega su contenido. La primera fila son los encabezados; se reconocen titulo, autor, isbn, editorial, anio, categoria, palabras_clave, codigo_barras, ubicacion, descripcion, estado_fisico, cantidad_total (con acentos, mayúsculas o sinónimos como ejemplares, clasificación, tema…). Separador coma, punto y coma o tabulación. Sólo titulo y autor son obligatorios. Hay una plantilla descargable.

Lectores
Registro de las personas autorizadas para préstamo: estudiantes (credencial de estudiante), personal administrativo y personal académico (INE). El sistema valida que el tipo de identificación corresponda al tipo de lector.

Operación de préstamo
El administrador registra el préstamo eligiendo lector y libro (búsqueda por título, autor, tema, palabra clave o código de barras).
Debe confirmar que el lector presentó identificación válida y que el libro se entrega en buen estado.
El sistema verifica disponibilidad y observaciones del libro.
Calcula la fecha de vencimiento a 6 días hábiles (máximo permitido).
Genera un recibo imprimible con los datos del préstamo, la fecha de vencimiento y los lineamientos de la biblioteca.
Devolución
Registro de la devolución indicando el estado del libro. Si se recibe en estado regular o malo, queda la observación en el sistema (aplicar Disposiciones generales del Formato de Préstamo) y el acervo refleja el deterioro.

Renovación
Renovación en persona, una sola vez, ampliando 6 días hábiles. Requiere registrar una observación en el sistema.

Panel
Indicadores: títulos, ejemplares totales / disponibles / prestados, lectores activos, préstamos activos, que vencen hoy y vencidos; libros por categoría y últimos préstamos.