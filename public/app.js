/* ==========================================================================
   Sistema de Gestión de Biblioteca — Universidad EP de México
   Cliente de una sola página. Usuario único: administrador (Responsable de
   Biblioteca). Procedimiento PR-GE-16.
   ========================================================================== */

const state = {
  token: localStorage.getItem('bib_token') || null,
  usuario: JSON.parse(localStorage.getItem('bib_usuario') || 'null'),
};

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = (v) => (v ? new Date(v + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const TIPO_LECTOR = { estudiante: 'Estudiante', administrativo: 'Personal administrativo', academico: 'Personal académico' };
const ID_LECTOR = { credencial_estudiante: 'Credencial de estudiante', INE: 'INE' };
const ESTADO_FISICO = { bueno: 'Bueno', regular: 'Regular', malo: 'Malo' };

/* ---------------------------- API ---------------------------- */
async function api(ruta, opciones = {}) {
  const cfg = { headers: { 'Content-Type': 'application/json' }, ...opciones };
  if (state.token) cfg.headers.Authorization = `Bearer ${state.token}`;
  if (cfg.body && typeof cfg.body !== 'string') cfg.body = JSON.stringify(cfg.body);

  const res = await fetch(`/api${ruta}`, cfg);
  if (res.status === 401 && state.token) { cerrarSesion(); throw new Error('Sesión expirada'); }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
  return data;
}

/* ---------------------------- Toast ---------------------------- */
let toastTimer;
function toast(msg, tipo = 'ok') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast ${tipo}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

/* ---------------------------- Modal ---------------------------- */
function abrirModal(titulo, htmlCuerpo) {
  $('#modal-titulo').textContent = titulo;
  $('#modal-cuerpo').innerHTML = htmlCuerpo;
  $('#modal').hidden = false;
}
function cerrarModal() { $('#modal').hidden = true; $('#modal-cuerpo').innerHTML = ''; }
$('#modal-cerrar').addEventListener('click', cerrarModal);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') cerrarModal(); });

/* ---------------------------- Autenticación ---------------------------- */
$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('#login-error');
  errEl.hidden = true;
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: { email: $('#login-email').value, password: $('#login-password').value },
    });
    state.token = data.token;
    state.usuario = data.usuario;
    localStorage.setItem('bib_token', data.token);
    localStorage.setItem('bib_usuario', JSON.stringify(data.usuario));
    iniciarApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  }
});

function cerrarSesion() {
  state.token = null;
  state.usuario = null;
  localStorage.removeItem('bib_token');
  localStorage.removeItem('bib_usuario');
  $('#app').hidden = true;
  $('#pantalla-login').hidden = false;
}
$('#btn-logout').addEventListener('click', cerrarSesion);

$('#btn-password').addEventListener('click', () => {
  abrirModal('Cambiar contraseña', `
    <form id="form-pass">
      <label>Contraseña actual<input type="password" name="actual" required></label>
      <label style="margin-top:.8rem">Nueva contraseña<input type="password" name="nueva" minlength="6" required></label>
      <p class="ayuda">Mínimo 6 caracteres.</p>
      <div class="form-actions">
        <button type="button" class="btn" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>`);
  $('#form-pass').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/auth/password', { method: 'PATCH', body: { actual: f.actual.value, nueva: f.nueva.value } });
      cerrarModal();
      toast('Contraseña actualizada');
    } catch (err) { toast(err.message, 'error'); }
  });
});

/* ---------------------------- Router ---------------------------- */
const vistas = {
  panel: renderPanel,
  prestamos: renderPrestamos,
  libros: renderLibros,
  lectores: renderLectores,
};
let vistaActual = 'panel';

$$('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => irA(btn.dataset.vista));
});

function irA(nombre) {
  vistaActual = nombre;
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.vista === nombre));
  $$('.vista').forEach((v) => (v.hidden = v.id !== `vista-${nombre}`));
  vistas[nombre]();
}

document.addEventListener('click', (e) => { if (e.target.matches('[data-cerrar]')) cerrarModal(); });

/* ---------------------------- Inicio ---------------------------- */
function iniciarApp() {
  $('#pantalla-login').hidden = true;
  $('#app').hidden = false;
  $('#sidebar-usuario').textContent = state.usuario ? state.usuario.nombre : '';
  irA('panel');
}

/* ==========================================================================
   VISTA: PANEL
   ========================================================================== */
async function renderPanel() {
  const cont = $('#vista-panel');
  cont.innerHTML = '<p class="vacio">Cargando indicadores…</p>';
  try {
    const s = await api('/stats');
    cont.innerHTML = `
      <div class="vista-head">
        <div>
          <h2>Panel de biblioteca</h2>
          <p>Resumen de la operación de préstamos y salvaguardo de libros.</p>
        </div>
        <button class="btn btn-primary" id="btn-nuevo-prestamo-panel">+ Registrar préstamo</button>
      </div>
      <div class="cards">
        <div class="card"><div class="valor">${s.libros.titulos}</div><div class="etiqueta">Títulos registrados</div></div>
        <div class="card"><div class="valor">${s.libros.ejemplares}</div><div class="etiqueta">Ejemplares totales</div></div>
        <div class="card ok"><div class="valor">${s.libros.disponibles}</div><div class="etiqueta">Ejemplares disponibles</div></div>
        <div class="card"><div class="valor">${s.libros.prestados}</div><div class="etiqueta">Ejemplares prestados</div></div>
        <div class="card"><div class="valor">${s.lectores.activos}</div><div class="etiqueta">Lectores activos</div></div>
        <div class="card"><div class="valor">${s.prestamos.activos}</div><div class="etiqueta">Préstamos activos</div></div>
        <div class="card ${s.prestamos.vencen_hoy ? 'alerta' : ''}"><div class="valor">${s.prestamos.vencen_hoy}</div><div class="etiqueta">Vencen hoy</div></div>
        <div class="card ${s.prestamos.vencidos ? 'alerta' : ''}"><div class="valor">${s.prestamos.vencidos}</div><div class="etiqueta">Préstamos vencidos</div></div>
      </div>

      <div class="panel">
        <div class="panel-head">Últimos préstamos registrados</div>
        <table>
          <thead><tr><th>Folio</th><th>Libro</th><th>Lector</th><th>Préstamo</th><th>Vencimiento</th><th>Estado</th></tr></thead>
          <tbody>
            ${s.prestamosRecientes.length ? s.prestamosRecientes.map((p) => `
              <tr>
                <td>${esc(p.folio)}</td>
                <td>${esc(p.libro_titulo)}</td>
                <td>${esc(p.lector_nombre)}</td>
                <td>${fecha(p.fecha_prestamo)}</td>
                <td>${fecha(p.fecha_vencimiento)}</td>
                <td>${badgeEstadoPrestamo(p)}</td>
              </tr>`).join('') : '<tr><td colspan="6" class="vacio">Sin préstamos aún.</td></tr>'}
          </tbody>
        </table>
      </div>

      <div class="panel">
        <div class="panel-head">Libros por categoría</div>
        <table>
          <thead><tr><th>Categoría</th><th>Títulos</th></tr></thead>
          <tbody>
            ${s.porCategoria.map((c) => `<tr><td>${esc(c.categoria)}</td><td>${c.n}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    $('#btn-nuevo-prestamo-panel').addEventListener('click', () => modalNuevoPrestamo());
  } catch (err) {
    cont.innerHTML = `<p class="vacio">${esc(err.message)}</p>`;
  }
}

function badgeEstadoPrestamo(p) {
  if (p.estado === 'devuelto') return '<span class="badge verde">Devuelto</span>';
  if (p.vencido || (p.fecha_vencimiento && p.estado === 'activo' && p.fecha_vencimiento < hoy())) {
    return `<span class="badge rojo">Vencido${p.dias_atraso ? ' · ' + p.dias_atraso + 'd' : ''}</span>`;
  }
  return '<span class="badge azul">Activo</span>';
}
const hoy = () => new Date().toISOString().slice(0, 10);

/* ==========================================================================
   VISTA: LIBROS
   ========================================================================== */
let librosCache = [];
async function renderLibros() {
  const cont = $('#vista-libros');
  cont.innerHTML = `
    <div class="vista-head">
      <div><h2>Registro de libros</h2><p>Acervo de la biblioteca: título, autor, ISBN, editorial, clasificación, código de barras y ubicación.</p></div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn" id="btn-importar-libros">Importar CSV</button>
        <button class="btn btn-primary" id="btn-nuevo-libro">+ Nuevo libro</button>
      </div>
    </div>
    <div class="panel">
      <div class="filtros">
        <input type="search" id="f-libro-q" placeholder="Buscar por título, autor, tema, ISBN, código…">
        <select id="f-libro-cat"><option value="">Todas las categorías</option></select>
        <label class="check-linea"><input type="checkbox" id="f-libro-disp"> Sólo disponibles</label>
      </div>
      <div id="tabla-libros"></div>
    </div>`;
  $('#btn-nuevo-libro').addEventListener('click', () => modalLibro());
  $('#btn-importar-libros').addEventListener('click', () => modalImportarCSV());
  const cats = await api('/libros/categorias').catch(() => []);
  $('#f-libro-cat').insertAdjacentHTML('beforeend', cats.map((c) => `<option>${esc(c)}</option>`).join(''));
  ['f-libro-q', 'f-libro-cat', 'f-libro-disp'].forEach((id) => $(`#${id}`).addEventListener('input', cargarLibros));
  cargarLibros();
}

async function cargarLibros() {
  const q = $('#f-libro-q').value.trim();
  const cat = $('#f-libro-cat').value;
  const disp = $('#f-libro-disp').checked;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (cat) params.set('categoria', cat);
  if (disp) params.set('disponibles', '1');
  const tabla = $('#tabla-libros');
  tabla.innerHTML = '<p class="vacio">Cargando…</p>';
  try {
    librosCache = await api(`/libros?${params}`);
    if (!librosCache.length) { tabla.innerHTML = '<p class="vacio">No hay libros que coincidan.</p>'; return; }
    tabla.innerHTML = `
      <table>
        <thead><tr><th>Título / Autor</th><th>Categoría</th><th>Código de barras</th><th>Ubicación</th><th>Estado</th><th>Disp.</th><th></th></tr></thead>
        <tbody>
          ${librosCache.map((l) => `
            <tr>
              <td><strong>${esc(l.titulo)}</strong><br><span style="color:var(--texto-suave)">${esc(l.autor)}</span></td>
              <td>${esc(l.categoria || '—')}</td>
              <td>${esc(l.codigo_barras)}</td>
              <td>${esc(l.ubicacion || '—')}</td>
              <td>${badgeFisico(l)}</td>
              <td>${l.cantidad_disponible}/${l.cantidad_total}</td>
              <td><div class="acciones-fila">
                <button class="btn btn-sm" data-ver="${l.id}">Ver</button>
                <button class="btn btn-sm" data-editar="${l.id}">Editar</button>
                <button class="btn btn-sm btn-peligro" data-eliminar="${l.id}">Eliminar</button>
              </div></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
    tabla.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => verLibro(b.dataset.ver)));
    tabla.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => modalLibro(librosCache.find((l) => l.id == b.dataset.editar))));
    tabla.querySelectorAll('[data-eliminar]').forEach((b) => b.addEventListener('click', () => eliminarLibro(b.dataset.eliminar)));
  } catch (err) { tabla.innerHTML = `<p class="vacio">${esc(err.message)}</p>`; }
}

function badgeFisico(l) {
  if (l.observacion) return `<span class="badge ambar" title="${esc(l.observacion)}">Observación</span>`;
  const cls = { bueno: 'verde', regular: 'ambar', malo: 'rojo' }[l.estado_fisico];
  return `<span class="badge ${cls}">${ESTADO_FISICO[l.estado_fisico]}</span>`;
}

function modalLibro(libro = null) {
  const l = libro || {};
  abrirModal(libro ? 'Editar libro' : 'Registrar libro', `
    <form id="form-libro">
      <div class="form-grid">
        <label class="full">Título<input name="titulo" value="${esc(l.titulo || '')}" required></label>
        <label class="full">Autor<input name="autor" value="${esc(l.autor || '')}" required></label>
        <label>ISBN<input name="isbn" value="${esc(l.isbn || '')}"></label>
        <label>Editorial<input name="editorial" value="${esc(l.editorial || '')}"></label>
        <label>Año<input name="anio" type="number" value="${esc(l.anio || '')}"></label>
        <label>Categoría / clasificación<input name="categoria" value="${esc(l.categoria || '')}" placeholder="Materia, Tema…"></label>
        <label class="full">Palabras clave<input name="palabras_clave" value="${esc(l.palabras_clave || '')}" placeholder="separadas por comas"></label>
        <label>Código de barras<input name="codigo_barras" value="${esc(l.codigo_barras || '')}" placeholder="Automático si se deja vacío"></label>
        <label>Ubicación (estantería)<input name="ubicacion" value="${esc(l.ubicacion || '')}"></label>
        <label>Estado físico
          <select name="estado_fisico">
            ${Object.entries(ESTADO_FISICO).map(([k, v]) => `<option value="${k}" ${l.estado_fisico === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </label>
        <label>Ejemplares (total)<input name="cantidad_total" type="number" min="1" value="${esc(l.cantidad_total || 1)}"></label>
        <label class="full">Observación (opcional)<input name="observacion" value="${esc(l.observacion || '')}" placeholder="Ej. en reparación, extraviado"></label>
        <label class="full">Descripción<textarea name="descripcion" rows="2">${esc(l.descripcion || '')}</textarea></label>
      </div>
      <div class="form-actions">
        <button type="button" class="btn" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn-primary">${libro ? 'Guardar cambios' : 'Registrar'}</button>
      </div>
    </form>`);

  $('#form-libro').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    fd.anio = fd.anio ? Number(fd.anio) : null;
    fd.cantidad_total = Number(fd.cantidad_total) || 1;
    try {
      if (libro) await api(`/libros/${libro.id}`, { method: 'PUT', body: fd });
      else await api('/libros', { method: 'POST', body: fd });
      cerrarModal();
      toast(libro ? 'Libro actualizado' : 'Libro registrado');
      cargarLibros();
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function verLibro(id) {
  try {
    const l = await api(`/libros/${id}`);
    abrirModal('Ficha del libro', `
      <div class="ficha">
        <dl>
          <dt>Título</dt><dd>${esc(l.titulo)}</dd>
          <dt>Autor</dt><dd>${esc(l.autor)}</dd>
          <dt>ISBN</dt><dd>${esc(l.isbn || '—')}</dd>
          <dt>Editorial</dt><dd>${esc(l.editorial || '—')} ${l.anio ? '(' + l.anio + ')' : ''}</dd>
          <dt>Categoría</dt><dd>${esc(l.categoria || '—')}</dd>
          <dt>Palabras clave</dt><dd>${esc(l.palabras_clave || '—')}</dd>
          <dt>Código de barras</dt><dd>${esc(l.codigo_barras)}</dd>
          <dt>Ubicación</dt><dd>${esc(l.ubicacion || '—')}</dd>
          <dt>Estado físico</dt><dd>${ESTADO_FISICO[l.estado_fisico]}</dd>
          <dt>Observación</dt><dd>${esc(l.observacion || '—')}</dd>
          <dt>Disponibilidad</dt><dd>${l.cantidad_disponible} de ${l.cantidad_total} ejemplares</dd>
          <dt>Descripción</dt><dd>${esc(l.descripcion || '—')}</dd>
        </dl>
      </div>
      <div class="panel" style="margin-top:1rem">
        <div class="panel-head">Historial de préstamos</div>
        <table><thead><tr><th>Folio</th><th>Lector</th><th>Préstamo</th><th>Vencimiento</th><th>Devolución</th><th>Estado</th></tr></thead>
        <tbody>${(l.historial || []).length ? l.historial.map((h) => `
          <tr><td>${esc(h.folio)}</td><td>${esc(h.lector_nombre)}</td><td>${fecha(h.fecha_prestamo)}</td><td>${fecha(h.fecha_vencimiento)}</td><td>${fecha(h.fecha_devolucion)}</td>
          <td>${h.estado === 'devuelto' ? '<span class="badge verde">Devuelto</span>' : '<span class="badge azul">Activo</span>'}</td></tr>`).join('')
          : '<tr><td colspan="6" class="vacio">Sin historial.</td></tr>'}
        </tbody></table>
      </div>`);
  } catch (err) { toast(err.message, 'error'); }
}

async function eliminarLibro(id) {
  if (!confirm('¿Eliminar este libro del acervo?')) return;
  try { await api(`/libros/${id}`, { method: 'DELETE' }); toast('Libro eliminado'); cargarLibros(); }
  catch (err) { toast(err.message, 'error'); }
}

/* ---------------------------- Importación CSV ---------------------------- */
const CAMPOS_LIBRO = ['titulo', 'autor', 'isbn', 'editorial', 'anio', 'categoria', 'palabras_clave', 'codigo_barras', 'ubicacion', 'descripcion', 'estado_fisico', 'cantidad_total'];

// Normaliza un encabezado: sin acentos, minúsculas, espacios -> guion bajo.
function normalizarClave(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/\s+/g, '_');
}

// Claves ya normalizadas (minúsculas, sin acentos, espacios -> "_").
const ALIAS_COLUMNAS = {
  titulo: 'titulo', title: 'titulo', nombre: 'titulo',
  autor: 'autor', author: 'autor', autores: 'autor',
  isbn: 'isbn',
  editorial: 'editorial', publisher: 'editorial',
  anio: 'anio', ano: 'anio', year: 'anio',
  categoria: 'categoria', clasificacion: 'categoria', materia: 'categoria', category: 'categoria',
  palabras_clave: 'palabras_clave', keywords: 'palabras_clave', tema: 'palabras_clave', temas: 'palabras_clave', tags: 'palabras_clave', etiquetas: 'palabras_clave',
  codigo_barras: 'codigo_barras', codigo_de_barras: 'codigo_barras', barcode: 'codigo_barras', codigo: 'codigo_barras',
  ubicacion: 'ubicacion', estanteria: 'ubicacion', location: 'ubicacion', estante: 'ubicacion',
  descripcion: 'descripcion', description: 'descripcion', resumen: 'descripcion', sinopsis: 'descripcion',
  estado_fisico: 'estado_fisico', estado: 'estado_fisico', condicion: 'estado_fisico',
  cantidad_total: 'cantidad_total', cantidad: 'cantidad_total', ejemplares: 'cantidad_total', copias: 'cantidad_total', existencias: 'cantidad_total', stock: 'cantidad_total',
};

// Parser de CSV: soporta comillas dobles, saltos de línea dentro de comillas y
// separador coma, punto y coma o tabulación (se detecta por la primera línea).
function parseCSV(texto) {
  texto = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const primera = texto.slice(0, texto.indexOf('\n') === -1 ? texto.length : texto.indexOf('\n'));
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';'
    : primera.includes('\t') && !primera.includes(',') ? '\t' : ',';

  const filas = [];
  let campo = '', fila = [], enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else enComillas = false;
      } else campo += c;
    } else if (c === '"') {
      enComillas = true;
    } else if (c === sep) {
      fila.push(campo); campo = '';
    } else if (c === '\n') {
      fila.push(campo); filas.push(fila); campo = ''; fila = [];
    } else campo += c;
  }
  if (campo.length || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((v) => String(v).trim() !== ''));
}

// Convierte el texto CSV en { libros: [...], columnas: [...], sinReconocer: [...] }
function csvALibros(texto) {
  const filas = parseCSV(texto);
  if (filas.length < 2) throw new Error('El archivo necesita una fila de encabezados y al menos un libro.');
  const encabezados = filas[0].map((h) => ALIAS_COLUMNAS[normalizarClave(h)] || null);
  const sinReconocer = filas[0].filter((h, i) => !encabezados[i] && String(h).trim() !== '');
  if (!encabezados.includes('titulo') || !encabezados.includes('autor')) {
    throw new Error('El CSV debe tener al menos las columnas "titulo" y "autor".');
  }
  const libros = filas.slice(1).map((f) => {
    const obj = {};
    encabezados.forEach((clave, i) => { if (clave) obj[clave] = (f[i] ?? '').trim(); });
    return obj;
  });
  const columnas = [...new Set(encabezados.filter(Boolean))];
  return { libros, columnas, sinReconocer };
}

function descargarPlantillaCSV() {
  const contenido =
    'titulo,autor,isbn,editorial,anio,categoria,palabras_clave,codigo_barras,ubicacion,descripcion,estado_fisico,cantidad_total\n' +
    '"El Quijote","Miguel de Cervantes","9788491050292","RAE",1605,"Literatura","novela, clásico","","Estante A-3","Edición conmemorativa","bueno",2\n' +
    '"Álgebra lineal","Stanley Grossman","9786071509949","McGraw-Hill",2019,"Matemáticas","matrices, vectores","","Estante D-4","","bueno",4\n';
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla_libros.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function modalImportarCSV() {
  abrirModal('Importar libros desde CSV', `
    <p class="ayuda" style="margin-top:0">
      El archivo debe tener una fila de encabezados. Columnas reconocidas:
      <strong>${CAMPOS_LIBRO.join(', ')}</strong>. Sólo <strong>titulo</strong> y
      <strong>autor</strong> son obligatorias; el código de barras se genera solo si se deja vacío.
      Separador: coma, punto y coma o tabulación.
    </p>
    <button type="button" class="btn btn-sm" id="btn-plantilla">Descargar plantilla CSV</button>

    <label style="margin-top:1rem">Archivo CSV
      <input type="file" id="csv-file" accept=".csv,text/csv">
    </label>
    <p class="ayuda">…o pega el contenido del CSV aquí abajo:</p>
    <textarea id="csv-texto" rows="5" style="width:100%" placeholder="titulo,autor,categoria&#10;..."></textarea>

    <div id="csv-preview" style="margin-top:1rem"></div>

    <div class="form-actions">
      <button type="button" class="btn" data-cerrar>Cancelar</button>
      <button type="button" class="btn btn-primary" id="btn-importar-confirmar" disabled>Importar</button>
    </div>`);

  let datos = null;

  const previsualizar = () => {
    const texto = $('#csv-texto').value.trim();
    const cont = $('#csv-preview');
    $('#btn-importar-confirmar').disabled = true;
    datos = null;
    if (!texto) { cont.innerHTML = ''; return; }
    try {
      datos = csvALibros(texto);
      const muestra = datos.libros.slice(0, 5);
      cont.innerHTML = `
        <div class="panel">
          <div class="panel-head">Vista previa — ${datos.libros.length} libro(s) detectado(s)</div>
          <table><thead><tr>${datos.columnas.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>${muestra.map((l) => `<tr>${datos.columnas.map((c) => `<td>${esc(l[c] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table>
        </div>
        ${datos.sinReconocer.length ? `<p class="ayuda">Columnas ignoradas: ${esc(datos.sinReconocer.join(', '))}</p>` : ''}
        ${datos.libros.length > 5 ? `<p class="ayuda">…y ${datos.libros.length - 5} más.</p>` : ''}`;
      $('#btn-importar-confirmar').disabled = datos.libros.length === 0;
    } catch (err) {
      cont.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
    }
  };

  $('#btn-plantilla').addEventListener('click', descargarPlantillaCSV);
  $('#csv-texto').addEventListener('input', previsualizar);
  $('#csv-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { $('#csv-texto').value = reader.result; previsualizar(); };
    reader.readAsText(file, 'utf-8');
  });

  $('#btn-importar-confirmar').addEventListener('click', async () => {
    if (!datos || !datos.libros.length) return;
    const btn = $('#btn-importar-confirmar');
    btn.disabled = true;
    btn.textContent = 'Importando…';
    try {
      const r = await api('/libros/importar', { method: 'POST', body: { libros: datos.libros } });
      const avisos = r.avisos || [];
      $('#csv-preview').innerHTML = `
        <div class="panel">
          <div class="panel-head">Resultado</div>
          <div style="padding:1rem">
            <p><span class="badge verde">${r.creados}</span> libro(s) registrado(s) de ${r.total}.</p>
            ${r.errores.length ? `
              <p><span class="badge rojo">${r.errores.length}</span> fila(s) omitida(s):</p>
              <ul class="ayuda">${r.errores.slice(0, 30).map((e) => `<li>Fila ${e.fila}: ${esc(e.error)}</li>`).join('')}</ul>
              ${r.errores.length > 30 ? `<p class="ayuda">…y ${r.errores.length - 30} más.</p>` : ''}` : ''}
            ${avisos.length ? `
              <p><span class="badge ambar">${avisos.length}</span> corrección(es) aplicada(s) a filas que sí se guardaron:</p>
              <ul class="ayuda">${avisos.slice(0, 30).map((a) => `<li>Fila ${a.fila}: ${esc(a.aviso)}</li>`).join('')}</ul>
              ${avisos.length > 30 ? `<p class="ayuda">…y ${avisos.length - 30} más.</p>` : ''}` : ''}
          </div>
        </div>`;
      $('.form-actions', $('#modal-cuerpo')).innerHTML = '<button type="button" class="btn btn-primary" data-cerrar>Listo</button>';
      if (r.creados) toast(`${r.creados} libro(s) importado(s)`);
      cargarLibros();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Importar';
    }
  });
}

/* ==========================================================================
   VISTA: LECTORES
   ========================================================================== */
let lectoresCache = [];
async function renderLectores() {
  const cont = $('#vista-lectores');
  cont.innerHTML = `
    <div class="vista-head">
      <div><h2>Lectores</h2><p>Personas autorizadas para préstamo: estudiantes (credencial), personal administrativo y académico (INE).</p></div>
      <button class="btn btn-primary" id="btn-nuevo-lector">+ Nuevo lector</button>
    </div>
    <div class="panel">
      <div class="filtros">
        <input type="search" id="f-lector-q" placeholder="Buscar por nombre, matrícula, identificación…">
        <select id="f-lector-tipo">
          <option value="">Todos los tipos</option>
          ${Object.entries(TIPO_LECTOR).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
      </div>
      <div id="tabla-lectores"></div>
    </div>`;
  $('#btn-nuevo-lector').addEventListener('click', () => modalLector());
  ['f-lector-q', 'f-lector-tipo'].forEach((id) => $(`#${id}`).addEventListener('input', cargarLectores));
  cargarLectores();
}

async function cargarLectores() {
  const params = new URLSearchParams();
  if ($('#f-lector-q').value.trim()) params.set('q', $('#f-lector-q').value.trim());
  if ($('#f-lector-tipo').value) params.set('tipo', $('#f-lector-tipo').value);
  const tabla = $('#tabla-lectores');
  tabla.innerHTML = '<p class="vacio">Cargando…</p>';
  try {
    lectoresCache = await api(`/lectores?${params}`);
    if (!lectoresCache.length) { tabla.innerHTML = '<p class="vacio">No hay lectores que coincidan.</p>'; return; }
    tabla.innerHTML = `
      <table>
        <thead><tr><th>Nombre</th><th>Tipo</th><th>Identificación</th><th>Carrera / Área</th><th>Contacto</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${lectoresCache.map((l) => `
            <tr>
              <td><strong>${esc(l.nombre)}</strong>${l.matricula ? '<br><span style="color:var(--texto-suave)">' + esc(l.matricula) + '</span>' : ''}</td>
              <td>${TIPO_LECTOR[l.tipo]}</td>
              <td>${ID_LECTOR[l.identificacion_tipo]}<br><span style="color:var(--texto-suave)">${esc(l.identificacion_num)}</span></td>
              <td>${esc(l.carrera_area || '—')}</td>
              <td>${esc(l.email || '—')}<br><span style="color:var(--texto-suave)">${esc(l.telefono || '')}</span></td>
              <td>${l.activo ? '<span class="badge verde">Activo</span>' : '<span class="badge gris">Inactivo</span>'}</td>
              <td><div class="acciones-fila">
                <button class="btn btn-sm" data-ver="${l.id}">Ver</button>
                <button class="btn btn-sm" data-editar="${l.id}">Editar</button>
                <button class="btn btn-sm btn-peligro" data-eliminar="${l.id}">Eliminar</button>
              </div></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
    tabla.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => verLector(b.dataset.ver)));
    tabla.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => modalLector(lectoresCache.find((l) => l.id == b.dataset.editar))));
    tabla.querySelectorAll('[data-eliminar]').forEach((b) => b.addEventListener('click', () => eliminarLector(b.dataset.eliminar)));
  } catch (err) { tabla.innerHTML = `<p class="vacio">${esc(err.message)}</p>`; }
}

function modalLector(lector = null) {
  const l = lector || {};
  abrirModal(lector ? 'Editar lector' : 'Registrar lector', `
    <form id="form-lector">
      <div class="form-grid">
        <label class="full">Nombre completo<input name="nombre" value="${esc(l.nombre || '')}" required></label>
        <label>Tipo de lector
          <select name="tipo" id="lector-tipo">
            ${Object.entries(TIPO_LECTOR).map(([k, v]) => `<option value="${k}" ${l.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </label>
        <label>Tipo de identificación
          <select name="identificacion_tipo" id="lector-id-tipo">
            ${Object.entries(ID_LECTOR).map(([k, v]) => `<option value="${k}" ${l.identificacion_tipo === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </label>
        <label>Número de identificación<input name="identificacion_num" value="${esc(l.identificacion_num || '')}" required></label>
        <label>Matrícula (si aplica)<input name="matricula" value="${esc(l.matricula || '')}"></label>
        <label class="full">Carrera / Área<input name="carrera_area" value="${esc(l.carrera_area || '')}"></label>
        <label>Correo electrónico<input name="email" type="email" value="${esc(l.email || '')}"></label>
        <label>Teléfono<input name="telefono" value="${esc(l.telefono || '')}"></label>
        ${lector ? `<label class="check-linea full"><input type="checkbox" name="activo" ${l.activo ? 'checked' : ''}> Lector activo</label>` : ''}
      </div>
      <p class="ayuda">Los estudiantes se identifican con credencial de estudiante; el personal administrativo y académico con INE.</p>
      <div class="form-actions">
        <button type="button" class="btn" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn-primary">${lector ? 'Guardar cambios' : 'Registrar'}</button>
      </div>
    </form>`);

  const sincronizarId = () => {
    const tipo = $('#lector-tipo').value;
    $('#lector-id-tipo').value = tipo === 'estudiante' ? 'credencial_estudiante' : 'INE';
  };
  $('#lector-tipo').addEventListener('change', sincronizarId);
  if (!lector) sincronizarId();

  $('#form-lector').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    fd.activo = e.target.activo ? e.target.activo.checked : true;
    try {
      if (lector) await api(`/lectores/${lector.id}`, { method: 'PUT', body: fd });
      else await api('/lectores', { method: 'POST', body: fd });
      cerrarModal();
      toast(lector ? 'Lector actualizado' : 'Lector registrado');
      cargarLectores();
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function verLector(id) {
  try {
    const l = await api(`/lectores/${id}`);
    abrirModal('Ficha del lector', `
      <div class="ficha"><dl>
        <dt>Nombre</dt><dd>${esc(l.nombre)}</dd>
        <dt>Tipo</dt><dd>${TIPO_LECTOR[l.tipo]}</dd>
        <dt>Identificación</dt><dd>${ID_LECTOR[l.identificacion_tipo]} — ${esc(l.identificacion_num)}</dd>
        <dt>Matrícula</dt><dd>${esc(l.matricula || '—')}</dd>
        <dt>Carrera / Área</dt><dd>${esc(l.carrera_area || '—')}</dd>
        <dt>Contacto</dt><dd>${esc(l.email || '—')} ${l.telefono ? '· ' + esc(l.telefono) : ''}</dd>
        <dt>Estado</dt><dd>${l.activo ? 'Activo' : 'Inactivo'}</dd>
      </dl></div>
      <div class="panel" style="margin-top:1rem">
        <div class="panel-head">Préstamos</div>
        <table><thead><tr><th>Folio</th><th>Libro</th><th>Préstamo</th><th>Vencimiento</th><th>Devolución</th><th>Estado</th></tr></thead>
        <tbody>${(l.prestamos || []).length ? l.prestamos.map((p) => `
          <tr><td>${esc(p.folio)}</td><td>${esc(p.libro_titulo)}</td><td>${fecha(p.fecha_prestamo)}</td><td>${fecha(p.fecha_vencimiento)}</td><td>${fecha(p.fecha_devolucion)}</td>
          <td>${p.estado === 'devuelto' ? '<span class="badge verde">Devuelto</span>' : (p.fecha_vencimiento < hoy() ? '<span class="badge rojo">Vencido</span>' : '<span class="badge azul">Activo</span>')}</td></tr>`).join('')
          : '<tr><td colspan="6" class="vacio">Sin préstamos.</td></tr>'}
        </tbody></table>
      </div>`);
  } catch (err) { toast(err.message, 'error'); }
}

async function eliminarLector(id) {
  if (!confirm('¿Eliminar este lector? Si tiene historial, sólo se desactivará.')) return;
  try {
    const r = await api(`/lectores/${id}`, { method: 'DELETE' });
    toast(r.desactivado ? 'Lector desactivado (tiene historial)' : 'Lector eliminado');
    cargarLectores();
  } catch (err) { toast(err.message, 'error'); }
}

/* ==========================================================================
   VISTA: PRÉSTAMOS
   ========================================================================== */
async function renderPrestamos() {
  const cont = $('#vista-prestamos');
  cont.innerHTML = `
    <div class="vista-head">
      <div><h2>Préstamos</h2><p>Operación de préstamo, devolución y renovación de libros (plazo máximo: 6 días hábiles).</p></div>
      <button class="btn btn-primary" id="btn-nuevo-prestamo">+ Registrar préstamo</button>
    </div>
    <div class="panel">
      <div class="filtros">
        <input type="search" id="f-prest-q" placeholder="Buscar por folio, libro, lector…">
        <select id="f-prest-estado">
          <option value="">Todos</option>
          <option value="activo">Activos</option>
          <option value="vencido">Vencidos</option>
          <option value="devuelto">Devueltos</option>
        </select>
      </div>
      <div id="tabla-prestamos"></div>
    </div>`;
  $('#btn-nuevo-prestamo').addEventListener('click', () => modalNuevoPrestamo());
  ['f-prest-q', 'f-prest-estado'].forEach((id) => $(`#${id}`).addEventListener('input', cargarPrestamos));
  cargarPrestamos();
}

async function cargarPrestamos() {
  const params = new URLSearchParams();
  if ($('#f-prest-q').value.trim()) params.set('q', $('#f-prest-q').value.trim());
  if ($('#f-prest-estado').value) params.set('estado', $('#f-prest-estado').value);
  const tabla = $('#tabla-prestamos');
  tabla.innerHTML = '<p class="vacio">Cargando…</p>';
  try {
    const lista = await api(`/prestamos?${params}`);
    if (!lista.length) { tabla.innerHTML = '<p class="vacio">No hay préstamos que coincidan.</p>'; return; }
    tabla.innerHTML = `
      <table>
        <thead><tr><th>Folio</th><th>Libro</th><th>Lector</th><th>Préstamo</th><th>Vencimiento</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${lista.map((p) => `
            <tr>
              <td>${esc(p.folio)}</td>
              <td>${esc(p.libro_titulo)}<br><span style="color:var(--texto-suave)">${esc(p.libro_codigo_barras)}</span></td>
              <td>${esc(p.lector_nombre)}</td>
              <td>${fecha(p.fecha_prestamo)}</td>
              <td>${fecha(p.fecha_vencimiento)}${p.renovaciones ? ' <span class="badge gris">renov.</span>' : ''}</td>
              <td>${badgeEstadoPrestamo(p)}</td>
              <td><div class="acciones-fila">
                <button class="btn btn-sm" data-recibo="${p.id}">Recibo</button>
                ${p.estado === 'activo' ? `
                  <button class="btn btn-sm" data-renovar="${p.id}">Renovar</button>
                  <button class="btn btn-sm btn-primary" data-devolver="${p.id}">Devolver</button>` : ''}
              </div></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
    tabla.querySelectorAll('[data-recibo]').forEach((b) => b.addEventListener('click', () => modalRecibo(b.dataset.recibo)));
    tabla.querySelectorAll('[data-renovar]').forEach((b) => b.addEventListener('click', () => modalRenovar(b.dataset.renovar)));
    tabla.querySelectorAll('[data-devolver]').forEach((b) => b.addEventListener('click', () => modalDevolver(b.dataset.devolver)));
  } catch (err) { tabla.innerHTML = `<p class="vacio">${esc(err.message)}</p>`; }
}

async function modalNuevoPrestamo() {
  abrirModal('Registrar préstamo', `
    <form id="form-prestamo">
      <label>Lector
        <input type="search" id="p-lector-buscar" placeholder="Nombre, matrícula o identificación…" autocomplete="off">
      </label>
      <div id="p-lector-res" class="ayuda"></div>
      <input type="hidden" name="lector_id" id="p-lector-id">
      <div id="p-lector-sel"></div>

      <label style="margin-top:1rem">Libro
        <input type="search" id="p-libro-buscar" placeholder="Título, autor, tema o código de barras…" autocomplete="off">
      </label>
      <div id="p-libro-res" class="ayuda"></div>
      <input type="hidden" name="libro_id" id="p-libro-id">
      <div id="p-libro-sel"></div>

      <div class="form-grid" style="margin-top:1rem">
        <label>Fecha de préstamo<input type="date" name="fecha_prestamo" value="${hoy()}"></label>
        <label>Días hábiles<input type="number" name="dias_habiles" value="6" min="1" max="6"></label>
      </div>
      <label class="full" style="margin-top:.6rem">Observaciones<input name="observaciones" placeholder="Opcional"></label>
      <label class="check-linea" style="margin-top:.8rem">
        <input type="checkbox" id="p-identificacion" required>
        El lector presentó una identificación válida y el libro se entregó en buen estado.
      </label>
      <div class="form-actions">
        <button type="button" class="btn" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn-primary">Registrar préstamo</button>
      </div>
    </form>`);

  configurarBuscador('p-lector-buscar', 'p-lector-res', async (q) => (await api(`/lectores?q=${encodeURIComponent(q)}&activo=1`)).slice(0, 6).map((l) => ({
    id: l.id, texto: `${l.nombre} · ${TIPO_LECTOR[l.tipo]} · ${l.identificacion_num}`,
  })), (item) => {
    $('#p-lector-id').value = item.id;
    $('#p-lector-sel').innerHTML = `<div class="badge azul">${esc(item.texto)}</div>`;
  });

  configurarBuscador('p-libro-buscar', 'p-libro-res', async (q) => (await api(`/libros?q=${encodeURIComponent(q)}&disponibles=1`)).slice(0, 6).map((l) => ({
    id: l.id, texto: `${l.titulo} · ${l.autor} · ${l.codigo_barras} (${l.cantidad_disponible} disp.)`,
  })), (item) => {
    $('#p-libro-id').value = item.id;
    $('#p-libro-sel').innerHTML = `<div class="badge azul">${esc(item.texto)}</div>`;
  });

  $('#form-prestamo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    if (!fd.lector_id || !fd.libro_id) return toast('Selecciona un lector y un libro', 'error');
    fd.dias_habiles = Number(fd.dias_habiles) || 6;
    fd.identificacion_verificada = $('#p-identificacion').checked;
    try {
      const p = await api('/prestamos', { method: 'POST', body: fd });
      cerrarModal();
      toast(`Préstamo ${p.folio} registrado`);
      if (vistaActual === 'prestamos') cargarPrestamos();
      else if (vistaActual === 'panel') renderPanel();
      modalRecibo(p.id);
    } catch (err) { toast(err.message, 'error'); }
  });
}

function configurarBuscador(inputId, resId, buscar, onSelect) {
  let t;
  $(`#${inputId}`).addEventListener('input', (e) => {
    clearTimeout(t);
    const q = e.target.value.trim();
    const res = $(`#${resId}`);
    if (q.length < 2) { res.innerHTML = ''; return; }
    t = setTimeout(async () => {
      try {
        const items = await buscar(q);
        res.innerHTML = items.length
          ? items.map((it, i) => `<div class="res-item" data-i="${i}" style="padding:.4rem .5rem;border:1px solid var(--gris-borde);border-radius:6px;margin-top:.25rem;cursor:pointer">${esc(it.texto)}</div>`).join('')
          : '<span>Sin resultados.</span>';
        res.querySelectorAll('.res-item').forEach((el) => el.addEventListener('click', () => {
          onSelect(items[el.dataset.i]);
          res.innerHTML = '';
          $(`#${inputId}`).value = '';
        }));
      } catch (err) { res.innerHTML = `<span>${esc(err.message)}</span>`; }
    }, 250);
  });
}

async function modalDevolver(id) {
  try {
    const p = await api(`/prestamos/${id}`);
    abrirModal('Registrar devolución', `
      <p>Préstamo <strong>${esc(p.folio)}</strong> — ${esc(p.libro_titulo)}<br>
      Lector: ${esc(p.lector_nombre)} · Vencía: ${fecha(p.fecha_vencimiento)}</p>
      <form id="form-devolver">
        <label>Estado del libro al devolverse
          <select name="estado_libro">
            ${Object.entries(ESTADO_FISICO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </label>
        <p class="ayuda">Sólo deben aceptarse libros en buen estado. Si se recibe en mal estado, se aplican las Disposiciones generales del Formato de Préstamo.</p>
        <label style="margin-top:.6rem">Nota (opcional)<input name="nota"></label>
        <div class="form-actions">
          <button type="button" class="btn" data-cerrar>Cancelar</button>
          <button type="submit" class="btn btn-primary">Confirmar devolución</button>
        </div>
      </form>`);
    $('#form-devolver').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        await api(`/prestamos/${id}/devolucion`, { method: 'PATCH', body: fd });
        cerrarModal();
        toast('Devolución registrada');
        cargarPrestamos();
      } catch (err) { toast(err.message, 'error'); }
    });
  } catch (err) { toast(err.message, 'error'); }
}

async function modalRenovar(id) {
  try {
    const p = await api(`/prestamos/${id}`);
    if (p.renovaciones >= 1) return toast('Este préstamo ya fue renovado una vez', 'error');
    abrirModal('Renovar préstamo', `
      <p>Préstamo <strong>${esc(p.folio)}</strong> — ${esc(p.libro_titulo)}<br>
      Vence: ${fecha(p.fecha_vencimiento)}. La renovación amplía 6 días hábiles.</p>
      <form id="form-renovar">
        <label>Observación (obligatoria)
          <input name="observacion" required placeholder="Ej. renovación autorizada en persona, sin reservas pendientes">
        </label>
        <p class="ayuda">Sólo procede si no hay otras reservas para el mismo libro. Se permite una sola renovación.</p>
        <div class="form-actions">
          <button type="button" class="btn" data-cerrar>Cancelar</button>
          <button type="submit" class="btn btn-primary">Renovar</button>
        </div>
      </form>`);
    $('#form-renovar').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api(`/prestamos/${id}/renovacion`, { method: 'PATCH', body: { observacion: e.target.observacion.value } });
        cerrarModal();
        toast('Préstamo renovado');
        cargarPrestamos();
      } catch (err) { toast(err.message, 'error'); }
    });
  } catch (err) { toast(err.message, 'error'); }
}

async function modalRecibo(id) {
  try {
    const r = await api(`/prestamos/${id}/recibo`);
    const p = r.prestamo;
    abrirModal('Recibo de préstamo', `
      <div class="recibo">
        <h2>${esc(r.institucion)}</h2>
        <p style="color:var(--texto-suave);margin-top:0">${esc(r.procedimiento)}</p>
        <hr class="rec-sep">
        <dl style="display:grid;grid-template-columns:auto 1fr;gap:.3rem .8rem">
          <dt><strong>Folio</strong></dt><dd>${esc(p.folio)}</dd>
          <dt><strong>Fecha de préstamo</strong></dt><dd>${fecha(p.fecha_prestamo)}</dd>
          <dt><strong>Fecha de vencimiento</strong></dt><dd>${fecha(p.fecha_vencimiento)}</dd>
        </dl>
        <hr class="rec-sep">
        <p><strong>Lector:</strong> ${esc(p.lector_nombre)}<br>
        ${TIPO_LECTOR[p.lector_tipo]} · ${ID_LECTOR[p.lector_identificacion_tipo]}: ${esc(p.lector_identificacion_num)}
        ${p.lector_matricula ? '· Matrícula: ' + esc(p.lector_matricula) : ''}</p>
        <p><strong>Libro:</strong> ${esc(p.libro_titulo)} — ${esc(p.libro_autor)}<br>
        ISBN: ${esc(p.libro_isbn || '—')} · Código de barras: ${esc(p.libro_codigo_barras)} · Ubicación: ${esc(p.libro_ubicacion || '—')}</p>
        ${p.observaciones ? `<p><strong>Observaciones:</strong> ${esc(p.observaciones)}</p>` : ''}
        <hr class="rec-sep">
        <p><strong>Lineamientos de la biblioteca</strong></p>
        <ul>${r.lineamientos.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        <div class="rec-firma">
          <div>Firma del lector</div>
          <div>Responsable de Biblioteca</div>
        </div>
      </div>
      <div class="form-actions no-print">
        <button type="button" class="btn" data-cerrar>Cerrar</button>
        <button type="button" class="btn btn-primary" onclick="window.print()">Imprimir</button>
      </div>`);
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------------------------- Arranque ---------------------------- */
if (state.token && state.usuario) iniciarApp();
