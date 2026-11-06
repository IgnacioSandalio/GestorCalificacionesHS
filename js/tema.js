// tema.js · Motor de temas con tokens semánticos. Sin dependencias.
//  · El usuario elige MODO (identidad/claro/oscuro/translúcido) y COLOR DE ACENTO.
//  · Del acento se derivan, matemáticamente: hover (10 % más oscuro), foco (10 % más claro con
//    opacidad), texto del botón (negro #111215 o blanco, según contraste) y color de enlaces (AA).

export const COLOR_TEXTO_OSCURO = '#111215';
export const COLOR_TEXTO_CLARO  = '#FFFFFF';
export const ACENTO_DEFECTO     = '#214EC2';   // azul real (el de la Suite)

export const MODOS = [
  { id: 'identidad',   nombre: 'Identidad' },
  { id: 'claro',       nombre: 'Claro' },
  { id: 'oscuro',      nombre: 'Oscuro' },
  { id: 'translucido', nombre: 'Translúcido' },
];

// Paleta propia de la app (modo identidad). El borde (#13235A) no se ofrece como acento.
export const PALETA_IDENTIDAD = [
  { nombre: 'Azul real',      hex: '#214EC2' },
  { nombre: 'Celeste',        hex: '#19B9DF' },
  { nombre: 'Azul eléctrico', hex: '#1E5BC6' },
  { nombre: 'Púrpura',        hex: '#8A3DA6' },
  { nombre: 'Azul marino',    hex: '#1C337E' },
];

/* ------------------------------ Matemática de color ------------------------------ */
export const hexARgb = (hex) => {
  let h = String(hex ?? '').trim().replace(/^#/, '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(h) ? [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) : null;
};
export const rgbAHex = (rgb) =>
  '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();

const lineal = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const luminancia = (hex) => { const [r, g, b] = hexARgb(hex).map(lineal); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contraste = (a, b) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** t=0 → a, t=1 → b */
export const mezclar = (a, b, t) => { const A = hexARgb(a), B = hexARgb(b); return rgbAHex(A.map((v, i) => v + (B[i] - v) * t)); };
export const oscurecer = (hex, p = 0.10) => mezclar(hex, '#000000', p);
export const aclarar   = (hex, p = 0.10) => mezclar(hex, '#FFFFFF', p);

/** Texto (negro #111215 o blanco) que mantiene mejor contraste sobre TODOS los fondos dados. */
export function elegirTextoSobre(fondos) {
  const puntaje = (c) => Math.min(...fondos.map((f) => contraste(c, f)));
  return puntaje(COLOR_TEXTO_OSCURO) >= puntaje(COLOR_TEXTO_CLARO) ? COLOR_TEXTO_OSCURO : COLOR_TEXTO_CLARO;
}

/** Acerca el color a blanco/negro (según el fondo) hasta lograr el contraste mínimo sobre todos los fondos. */
export function ajustarParaFondos(color, fondos, minimo = 4.5) {
  const ok = (c) => fondos.every((f) => contraste(c, f) >= minimo);
  if (ok(color)) return color.toUpperCase();
  const oscuros = fondos.reduce((s, f) => s + luminancia(f), 0) / fondos.length < 0.4;
  const destino = oscuros ? '#FFFFFF' : '#000000';
  for (let t = 0.04; t <= 1.0001; t += 0.04) { const c = mezclar(color, destino, Math.min(t, 1)); if (ok(c)) return c; }
  return destino;
}

/** Familia completa derivada del acento. `fondos` = fondos sólidos sobre los que se usará (bg, surface). */
export function familiaAcento(acento, fondos) {
  const base  = rgbAHex(hexARgb(acento));
  const hover = oscurecer(base, 0.10);
  const [r, g, b] = hexARgb(aclarar(base, 0.10));
  const onAccent = elegirTextoSobre([base, hover]);
  const texto = ajustarParaFondos(base, fondos, 4.5);
  return {
    acento: base, hover,
    foco: `rgb(${r} ${g} ${b} / 0.45)`,
    onAccent,
    contrasteBoton: Math.min(contraste(onAccent, base), contraste(onAccent, hover)),
    texto,
    borde: texto,
  };
}

/* ------------------------------ Estado y persistencia ------------------------------ */
const CLAVE = 'sge.tema';
const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch { return {}; } };
const guardar = (t) => { try { localStorage.setItem(CLAVE, JSON.stringify(t)); } catch { /* modo privado: se ignora */ } };

let estado = { modo: 'identidad', acento: ACENTO_DEFECTO };
{
  const g = leer();
  if (MODOS.some((m) => m.id === g.modo)) estado.modo = g.modo;
  if (hexARgb(g.acento)) estado.acento = rgbAHex(hexARgb(g.acento));
}

export const obtenerTema = () => ({ ...estado });

export function aplicarTema(parcial = {}, { persistir = true } = {}) {
  if (parcial.modo && MODOS.some((m) => m.id === parcial.modo)) estado.modo = parcial.modo;
  if (parcial.acento && hexARgb(parcial.acento)) estado.acento = rgbAHex(hexARgb(parcial.acento));

  const raiz = document.documentElement;
  raiz.dataset.theme = estado.modo;                          // los neutros cambian por CSS
  const css = getComputedStyle(raiz);
  const fondos = ['--color-bg', '--color-surface-solid']
    .map((v) => css.getPropertyValue(v).trim()).filter((h) => hexARgb(h));
  const fam = familiaAcento(estado.acento, fondos.length ? fondos : ['#FFFFFF']);

  const set = (k, v) => raiz.style.setProperty(k, v);
  set('--color-primary-accent', fam.acento);
  set('--color-primary-accent-hover', fam.hover);
  set('--color-primary-accent-focus', fam.foco);
  set('--color-on-accent', fam.onAccent);
  set('--color-accent-text', fam.texto);
  set('--color-accent-edge', fam.borde);
  set('--color-on-secondary', elegirTextoSobre([css.getPropertyValue('--color-secondary-accent').trim() || '#8A3DA6']));

  if (persistir) guardar(estado);
  document.dispatchEvent(new CustomEvent('sge:tema', { detail: { ...estado, familia: fam } }));
  return fam;
}

/* ------------------------------ Selector de apariencia ------------------------------ */
export function montarApariencia(contenedor) {
  const det = document.createElement('details');
  det.className = 'apariencia';
  det.innerHTML = `
    <summary class="btn btn--secundario btn--compacto" aria-label="Apariencia: modo y color">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-.9.8-1.7 1.7-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/></svg>
      <span>Apariencia</span>
    </summary>
    <div class="apariencia__panel tarjeta">
      <fieldset>
        <legend>Modo</legend>
        <div class="fila-chips">
          ${MODOS.map((m) => `<label class="chip"><input class="chip__input" type="radio" name="sge-modo" value="${m.id}"><span class="chip__texto">${m.nombre}</span></label>`).join('')}
        </div>
      </fieldset>
      <fieldset>
        <legend>Color de acento</legend>
        <div class="fila-chips" style="align-items:center">
          ${PALETA_IDENTIDAD.map((c) => `<label class="muestra"><input class="chip__input" type="radio" name="sge-acento" value="${c.hex}"><span class="muestra__color" style="background:${c.hex}"></span><span class="sr-only">${c.nombre} ${c.hex}</span></label>`).join('')}
          <label class="muestra" title="Otro color"><span class="sr-only">Elegir otro color</span><input type="color" data-personalizado aria-label="Elegir otro color de acento"></label>
        </div>
      </fieldset>
      <p class="apariencia__info" aria-live="polite" data-info></p>
      <button type="button" class="btn btn--secundario btn--compacto" data-restablecer>Restablecer</button>
    </div>`;
  contenedor.replaceChildren(det);

  const info = det.querySelector('[data-info]');
  const radiosModo = [...det.querySelectorAll('input[name="sge-modo"]')];
  const radiosAcento = [...det.querySelectorAll('input[name="sge-acento"]')];
  const personalizado = det.querySelector('[data-personalizado]');

  const refrescar = (fam) => {
    radiosModo.forEach((r) => (r.checked = r.value === estado.modo));
    radiosAcento.forEach((r) => (r.checked = r.value.toUpperCase() === estado.acento));
    personalizado.value = estado.acento.toLowerCase();
    const texto = fam.onAccent === COLOR_TEXTO_OSCURO ? 'negro' : 'blanco';
    info.textContent = `Texto sobre el botón: ${texto} (contraste ${fam.contrasteBoton.toFixed(1)}:1)` +
      (fam.texto !== fam.acento ? '. Enlaces e íconos se ajustaron para leerse bien.' : '.');
  };
  document.addEventListener('sge:tema', (e) => refrescar(e.detail.familia));
  refrescar(familiaAcento(estado.acento, ['#FFFFFF']));
  aplicarTema({}, { persistir: false });

  radiosModo.forEach((r) => r.addEventListener('change', () => aplicarTema({ modo: r.value })));
  radiosAcento.forEach((r) => r.addEventListener('change', () => aplicarTema({ acento: r.value })));
  personalizado.addEventListener('input', () => aplicarTema({ acento: personalizado.value }));
  det.querySelector('[data-restablecer]').addEventListener('click', () => aplicarTema({ modo: 'identidad', acento: ACENTO_DEFECTO }));

  // Se cierra al tocar fuera o con Escape
  document.addEventListener('click', (e) => { if (det.open && !det.contains(e.target)) det.open = false; });
  det.addEventListener('keydown', (e) => { if (e.key === 'Escape') { det.open = false; det.querySelector('summary').focus(); } });
  return det;
}

// Aplicar al cargar (el script en <head> ya fijó data-theme para evitar parpadeo)
aplicarTema({}, { persistir: false });
