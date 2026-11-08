/* ==========================================================================
   Catálogo de la Biblioteca — vista del estudiante (sólo consulta)
   No requiere sesión: consume el catálogo público /api/catalogo.
   ========================================================================== */

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = (v) => (v ? new Date(v + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

let campusActual = null; // clave del campus que se consulta

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
  if (campusActual) params.set('campus', campusActual);

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

// En móvil los filtros se ocultan detrás de un botón tipo "hamburguesa"
// para no ocupar toda la pantalla antes de ver el catálogo.
function iniciarToggleFiltros() {
  const wrap = $('#filtros-wrap');
  const btn = $('#btn-filtros');
  if (!wrap || !btn) return;
  btn.addEventListener('click', () => {
    const abierto = wrap.classList.toggle('abierto');
    btn.setAttribute('aria-expanded', String(abierto));
  });
}

async function cargarCategorias() {
  const sel = $('#f-cat-categoria');
  sel.innerHTML = '<option value="">Todas las categorías</option>';
  const categorias = await api(`/categorias${campusActual ? '?campus=' + encodeURIComponent(campusActual) : ''}`).catch(() => []);
  sel.insertAdjacentHTML('beforeend', categorias.map((c) => `<option>${esc(c)}</option>`).join(''));
}

// Cada campus tiene su propio catálogo. El selector sólo aparece si hay más de
// uno; el elegido se recuerda y puede compartirse con ?campus=<clave>.
async function iniciarCampus() {
  const sel = $('#f-cat-campus');
  const campus = await api('/campus').catch(() => []);
  if (!campus.length) return;
  const guardado = (() => { try { return localStorage.getItem('bib_campus'); } catch { return null; } })();
  const pedido = new URLSearchParams(location.search).get('campus') || guardado;
  campusActual = (campus.find((c) => c.clave === pedido) || campus[0]).clave;
  if (campus.length < 2) return;
  sel.innerHTML = campus.map((c) => `<option value="${esc(c.clave)}">${esc(c.nombre)}</option>`).join('');
  sel.value = campusActual;
  sel.hidden = false;
  sel.addEventListener('input', async () => {
    campusActual = sel.value;
    try { localStorage.setItem('bib_campus', campusActual); } catch { /* sin almacenamiento */ }
    history.replaceState(null, '', `?campus=${encodeURIComponent(campusActual)}`);
    await cargarCategorias();
    cargarCatalogo();
  });
}

async function iniciar() {
  await iniciarCampus();
  await cargarCategorias();
  ['f-cat-q', 'f-cat-categoria', 'f-cat-disponibilidad'].forEach((id) => $(`#${id}`).addEventListener('input', cargarCatalogo));
  iniciarToggleFiltros();
  cargarCatalogo();
}

iniciar();
