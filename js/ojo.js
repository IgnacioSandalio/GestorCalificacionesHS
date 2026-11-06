// ojo.js · Botón "ojo" de contraseña: muestra el texto 5 s y lo vuelve a ocultar solo.
export const OJO_MS = 5000;

const SVG = (inner) =>
  `<svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const ICONO_VER    = SVG('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>');
const ICONO_OCULTAR = SVG('<path d="M3 3l18 18"/><path d="M10.6 6.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.7C3.8 8.5 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>');

/**
 * @param {HTMLInputElement} input   campo de contraseña
 * @param {HTMLButtonElement} boton  botón con el ojo
 * @param {HTMLElement} barra        contenedor de la barra de cuenta regresiva
 * @param {(texto:string)=>void} anunciar  callback para lectores de pantalla
 */
export function activarOjo(input, boton, barra, anunciar = () => {}) {
  let temporizador = null;
  boton.innerHTML = ICONO_VER;
  boton.setAttribute('aria-pressed', 'false');
  boton.setAttribute('aria-label', 'Mostrar contraseña durante 5 segundos');

  function ocultar(avisar = false) {
    clearTimeout(temporizador); temporizador = null;
    input.type = 'password';
    boton.innerHTML = ICONO_VER;
    boton.setAttribute('aria-pressed', 'false');
    boton.setAttribute('aria-label', 'Mostrar contraseña durante 5 segundos');
    barra.replaceChildren();
    if (avisar) anunciar('Contraseña oculta.');
  }
  function mostrar() {
    clearTimeout(temporizador);
    input.type = 'text';
    boton.innerHTML = ICONO_OCULTAR;
    boton.setAttribute('aria-pressed', 'true');
    boton.setAttribute('aria-label', 'Ocultar contraseña ahora');
    const relleno = document.createElement('span');
    relleno.style.setProperty('--ojo-ms', `${OJO_MS}ms`);
    barra.replaceChildren(relleno);                       // reinicia la animación
    anunciar('La contraseña es visible y se ocultará en 5 segundos.');
    temporizador = setTimeout(() => ocultar(true), OJO_MS);
  }
  boton.addEventListener('click', () => (input.type === 'text' ? ocultar(true) : mostrar()));
  document.addEventListener('visibilitychange', () => { if (document.hidden) ocultar(); });
  input.form?.addEventListener('submit', () => ocultar());
  return { ocultar, mostrar };
}
