// ui.js · Utilidades de interfaz. Todo el contenido dinámico se inserta como TEXTO (sin innerHTML),
// por lo que los datos de la base nunca pueden inyectar código en la página.

/** Crea un elemento: h('div', {class:'x', onclick: fn}, 'texto', otroNodo) */
export function h(tag, props = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'for') el.htmlFor = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'disabled') el.disabled = !!v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  agregar(el, hijos);
  return el;
}
function agregar(el, hijos) {
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
}
export const limpiar = (el) => { el.replaceChildren(); return el; };

/* ---------- Formato ---------- */
export const fmtFecha = (iso) => {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};
export const fmtFechaHora = (iso) => {
  if (!iso) return '—';
  const f = new Date(iso);
  return Number.isNaN(f.getTime()) ? '—' : f.toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' });
};
export const fmtNum = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('es-BO'));
export const fmtPct = (n) => (n === null || n === undefined ? '—' : `${Number(n).toLocaleString('es-BO', { maximumFractionDigits: 1 })} %`);
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombreMes = (iso) => { const [a, m] = String(iso).split('-'); return `${MESES[Number(m) - 1]} ${a}`; };
export const nombreCompleto = (e) => [e.nombres, e.apellido_paterno, e.apellido_materno].filter(Boolean).join(' ');
export const CAUSAS = {
  conectividad: 'Problemas de conectividad', salud: 'Salud', viaje: 'Viaje', olvido: 'Olvido',
  plataforma_educativa: 'Falla de la plataforma educativa', falla_sistema: 'Falla del sistema', otro: 'Otro motivo',
};

/* ---------- Bloques reutilizables ---------- */
export const cargando = (texto = 'Cargando…') => h('p', { class: 'cargando', role: 'status' }, h('span', { class: 'giro', 'aria-hidden': 'true' }), texto);
export const cajaError = (texto) => h('p', { class: 'mensaje', role: 'alert' }, texto);
export const vacio = (texto) => h('p', { class: 'vacio muted' }, texto);

export function tarjetaKpi(valor, etiqueta, extra) {
  return h('article', { class: 'tarjeta' },
    h('p', { class: 'kpi__valor' }, valor),
    h('p', { class: 'kpi__etiqueta' }, etiqueta),
    extra || null);
}

/** Fila de barra horizontal con etiqueta directa y valor en texto (no depende solo del color). */
export function filaBarra({ etiqueta, valor, maximo = 100, texto, detalle }) {
  const pct = maximo > 0 ? Math.max(0, Math.min(100, (Number(valor) / maximo) * 100)) : 0;
  return h('div', { class: 'dato' },
    h('div', { class: 'dato__cab' }, h('span', { class: 'dato__etiqueta' }, etiqueta), h('strong', { class: 'dato__valor' }, texto ?? fmtNum(valor))),
    h('div', { class: 'progreso', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(maximo), 'aria-valuenow': String(Number(valor) || 0), 'aria-label': etiqueta },
      h('span', { style: `width:${pct}%` })),
    detalle ? h('p', { class: 'muted dato__detalle' }, detalle) : null);
}

/** Tabla accesible que en móvil se convierte en tarjetas. columnas: [{t:'Título', k:(fila)=>nodo|texto}] */
export function tabla(columnas, filas, { vacioTexto = 'Sin registros.' } = {}) {
  if (!filas.length) return vacio(vacioTexto);
  return h('div', { class: 'tarjeta tabla-caja' },
    h('table', { class: 'tabla-resp', role: 'table' },
      h('thead', { role: 'rowgroup' }, h('tr', { role: 'row' }, columnas.map((c) => h('th', { role: 'columnheader', scope: 'col' }, c.oculto ? h('span', { class: 'sr-only' }, c.t) : c.t)))),
      h('tbody', { role: 'rowgroup' }, filas.map((f) => h('tr', { role: 'row' },
        columnas.map((c) => h('td', { role: 'cell', 'data-etiqueta': c.oculto ? '' : c.t }, c.k(f))))))));
}

export function campo({ id, etiqueta, tipo = 'text', valor = '', ayuda, requerido = false, opciones, atributos = {} }) {
  let control;
  if (opciones) {
    control = h('select', { id, class: 'campo', required: requerido, ...atributos },
      opciones.map((o) => h('option', { value: o.valor, selected: String(o.valor) === String(valor) }, o.texto)));
  } else if (tipo === 'textarea') {
    control = h('textarea', { id, class: 'campo', rows: 3, required: requerido, ...atributos }, valor);
  } else {
    control = h('input', { id, class: 'campo', type: tipo, value: valor, required: requerido, ...atributos });
  }
  return h('div', { class: 'grupo' },
    h('label', { class: 'etiqueta', for: id }, etiqueta, requerido ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
    control,
    ayuda ? h('p', { class: 'ayuda muted' }, ayuda) : null);
}

/* ---------- Aviso temporal (toast) ---------- */
export function avisar(texto, tipo = 'ok') {
  let zona = document.getElementById('avisos');
  if (!zona) { zona = h('div', { id: 'avisos', class: 'avisos', role: 'status', 'aria-live': 'polite' }); document.body.append(zona); }
  const a = h('p', { class: `aviso aviso--${tipo}` }, tipo === 'error' ? '⚠ ' : '✓ ', texto);
  zona.append(a);
  setTimeout(() => a.remove(), tipo === 'error' ? 8000 : 4500);
}

/* ---------- Ventana modal (<dialog>) ---------- */
export function abrirModal({ titulo, contenido, acciones = [], ancho }) {
  const dlg = h('dialog', { class: 'modal', 'aria-labelledby': 'modal-titulo', style: ancho ? `--modal-ancho:${ancho}` : null });
  const cerrar = () => { dlg.close(); dlg.remove(); };
  const pie = h('div', { class: 'modal__pie' }, acciones.map((a) =>
    h('button', {
      type: 'button', class: `btn ${a.secundario ? 'btn--secundario' : ''}`, id: a.id,
      onclick: async (e) => {
        if (!a.onclick) return cerrar();
        const boton = e.currentTarget; boton.disabled = true;
        try { const r = await a.onclick({ cerrar }); if (r !== false && a.cierra !== false) cerrar(); }
        catch (err) { avisar(err?.message || 'Ocurrió un error inesperado.', 'error'); }
        finally { boton.disabled = false; }
      },
    }, a.texto)));
  dlg.append(
    h('div', { class: 'modal__cab' }, h('h2', { id: 'modal-titulo' }, titulo),
      h('button', { type: 'button', class: 'btn btn--secundario btn--compacto', 'aria-label': 'Cerrar', onclick: cerrar }, '✕')),
    h('div', { class: 'modal__cuerpo' }, contenido), pie);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(); });
  document.body.append(dlg);
  dlg.showModal();
  return { cerrar, dlg };
}

/** Copia texto al portapapeles (con alternativa si el navegador lo impide). */
export async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch {
    const t = h('textarea', { style: 'position:fixed;opacity:0' }, texto); document.body.append(t); t.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* sin permiso */ } t.remove(); return ok;
  }
}

export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const normalizarTexto = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Primer día de cada mes entre dos fechas ISO (ambas inclusive): ['2026-02-01', '2026-03-01', …] */
export function mesesEntre(inicioIso, cierreIso) {
  const [a, m] = inicioIso.split('-').map(Number); const [a2, m2] = cierreIso.split('-').map(Number);
  const out = []; let y = a, mo = m;
  while (y < a2 || (y === a2 && mo <= m2)) { out.push(`${y}-${String(mo).padStart(2, '0')}-01`); mo++; if (mo > 12) { mo = 1; y++; } }
  return out;
}
