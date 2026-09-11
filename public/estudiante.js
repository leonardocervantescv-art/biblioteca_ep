/* ==========================================================================
   Catálogo de la Biblioteca — vista del estudiante (sólo consulta)
   No requiere sesión: consume el catálogo público /api/catalogo.
   ========================================================================== */

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = (v) => (v ? new Date(v + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

async function api(ruta) {
  const res = await fetch(`/api/catalogo${ruta}`);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
  return data;
}

function badgeDisponibilidad(l) {
  if (l.disponible) {
    return `<span class="badge verde">Disponible · ${l.cantidad_disponible} de ${l.cantidad_total} ejemplar(es)</span>`;
  }
  const hasta = l.disponible_desde
    ? `hasta el ${fecha(l.disponible_desde)}`
    : 'próximamente';
  return `<span class="badge rojo">No disponible · se espera ${hasta}</span>`;
}

async function cargarCatalogo() {
  const q = $('#f-cat-q').value.trim();
  const categoria = $('#f-cat-categoria').value;
  const disponibilidad = $('#f-cat-disponibilidad').value;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (categoria) params.set('categoria', categoria);
  if (disponibilidad) params.set('disponibilidad', disponibilidad);

  const cont = $('#cat-resultados');
  cont.innerHTML = '<p class="vacio">Cargando catálogo…</p>';
  try {
    const libros = await api(`/libros?${params}`);
    if (!libros.length) {
      cont.innerHTML = '<p class="vacio">No hay libros que coincidan con la búsqueda.</p>';
      return;
    }
    cont.innerHTML = `<div class="cat-grid">${libros.map((l) => `
      <article class="cat-card">
        <h3>${esc(l.titulo)}</h3>
        <p class="cat-autor">${esc(l.autor)}</p>
        <p class="cat-meta">
          ${esc(l.categoria || 'Sin categoría')}
          ${l.editorial ? ' · ' + esc(l.editorial) : ''}
          ${l.anio ? ' · ' + esc(l.anio) : ''}
        </p>
        ${l.ubicacion ? `<p class="cat-meta">Ubicación: ${esc(l.ubicacion)}</p>` : ''}
        ${l.descripcion ? `<p class="cat-desc">${esc(l.descripcion)}</p>` : ''}
        <div class="cat-disp">${badgeDisponibilidad(l)}</div>
      </article>`).join('')}</div>`;
  } catch (err) {
    cont.innerHTML = `<p class="vacio">${esc(err.message)}</p>`;
  }
}

async function iniciar() {
  const categorias = await api('/categorias').catch(() => []);
  $('#f-cat-categoria').insertAdjacentHTML('beforeend', categorias.map((c) => `<option>${esc(c)}</option>`).join(''));
  ['f-cat-q', 'f-cat-categoria', 'f-cat-disponibilidad'].forEach((id) => $(`#${id}`).addEventListener('input', cargarCatalogo));
  cargarCatalogo();
}

iniciar();
