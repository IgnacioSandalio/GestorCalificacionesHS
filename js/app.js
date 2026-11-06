// app.js · Estructura de la aplicación: sesión, menú por rol, selectores de contexto y navegación por "#/ruta".
//  · Administrador de colegio y Operador: desplegable de colegios en la barra superior (si tienen más de uno).
//  · Tutor: desplegable de hijos (si tiene más de uno); la vista "Mis hijos" es un mini-dashboard del hijo elegido.
//  · Superadministrador: solo infraestructura (colegios y administradores).
// Al cambiar el colegio o el hijo, la vista se vuelve a dibujar y api.js filtra todas las consultas por ese colegio_id.
import { montarApariencia } from './tema.js';
import { obtenerCliente, perfilActual, textoError } from './api.js';
import { DEMO } from './config.js';
import { h, limpiar, cargando, cajaError } from './ui.js';

const PERSONAL = ['admin_colegio', 'operador'];
const RUTAS = {
  '/gestion': { roles: ['superadmin'], vista: 'super-gestion', menu: 'Colegios y administradores' },
  '/admin': { roles: PERSONAL, vista: 'admin-resumen', menu: 'Resumen del colegio' },
  '/admin/estudiantes': { roles: PERSONAL, vista: 'admin-estudiantes', menu: 'Estudiantes y tutores' },
  '/admin/evidencias': { roles: PERSONAL, vista: 'admin-evidencias', menu: 'Evidencias' },
  '/admin/periodos': { roles: ['admin_colegio'], vista: 'admin-periodos', menu: 'Periodos y habilitaciones' },
  '/admin/equipo': { roles: ['admin_colegio'], vista: 'admin-equipo', menu: 'Operadores' },
  '/admin/ajustes': { roles: ['admin_colegio'], vista: 'admin-ajustes', menu: 'Ajustes' },
  '/padres': { roles: ['tutor'], vista: 'padres', menu: 'Mis hijos' },
};
const INICIO = { superadmin: '/gestion', admin_colegio: '/admin', operador: '/admin', tutor: '/padres' };
const ETIQUETA_ROL = { superadmin: 'Superadministrador', admin_colegio: 'Administrador de colegio', operador: 'Operador', tutor: 'Tutor' };

const raiz = document.getElementById('contenido');
const menu = document.getElementById('menu');
let ctx = null;
let turno = 0;

const irALogin = () => location.replace('./login.html');
const rutaActual = () => (location.hash.replace(/^#/, '') || '').split('?')[0];

async function iniciar() {
  const sb = await obtenerCliente();
  const perfil = await perfilActual(sb);
  if (!perfil || perfil.debe_cambiar_password) return irALogin();    // sin sesión o sin cambio de clave: vuelve al ingreso
  const cx = sb.contexto;
  ctx = {
    sb, perfil, navegar, recargar: () => dibujar(), esDemo: DEMO, contexto: cx,
    get colegios() { return cx.colegios; }, get colegioId() { return cx.colegioId; }, get colegio() { return cx.colegio; },
    get hijos() { return cx.hijos; }, get estudianteId() { return cx.estudianteId; }, get hijo() { return cx.hijo; },
    selectorColegio: () => null,   // el selector vive en la barra superior
  };

  montarApariencia(document.getElementById('apariencia'));
  document.getElementById('demo-aviso').hidden = !DEMO;
  document.getElementById('usuario-actual').replaceChildren(
    `${perfil.nombres} ${perfil.apellidos ?? ''}`.trim(), h('small', {}, ETIQUETA_ROL[perfil.rol]));
  document.getElementById('salir').addEventListener('click', async () => { await sb.auth.signOut(); irALogin(); });

  pintarContexto();
  cx.alCambiar(() => { pintarContexto(); dibujar(); });
  window.addEventListener('hashchange', dibujar);
  await dibujar();
}

export function navegar(ruta) { if (rutaActual() === ruta) ctx.recargar(); else location.hash = `#${ruta}`; }

/** Selectores de la barra superior: colegio (personal) o hijo (tutor). Con un solo elemento se muestra como texto. */
function pintarContexto() {
  const caja = document.getElementById('contexto'); if (!caja) return;
  const cx = ctx.contexto; const rol = ctx.perfil.rol; caja.replaceChildren();
  if (rol === 'superadmin') { caja.hidden = true; return; }
  const esTutor = rol === 'tutor';
  const items = esTutor ? cx.hijos.map((x) => ({ id: x.id, texto: [x.nombres, x.apellido_paterno].filter(Boolean).join(' ') })) : cx.colegios.map((x) => ({ id: x.id, texto: x.nombre }));
  const actual = esTutor ? cx.estudianteId : cx.colegioId; const etiqueta = esTutor ? 'Estudiante' : 'Colegio';
  caja.hidden = !items.length;
  if (!items.length) return;
  if (items.length === 1) { caja.append(h('span', { class: 'contexto__fijo' }, h('small', {}, etiqueta), items[0].texto)); return; }
  const sel = h('select', { id: esTutor ? 'sel-hijo' : 'sel-colegio', class: 'campo contexto__select', 'aria-label': esTutor ? 'Hijo o hija a consultar' : 'Colegio activo' },
    items.map((i) => h('option', { value: i.id, selected: i.id === actual }, i.texto)));
  sel.addEventListener('change', () => (esTutor ? cx.setEstudiante(sel.value) : cx.setColegio(sel.value)));
  caja.append(h('label', { class: 'contexto__etiqueta', for: sel.id }, etiqueta), sel);
}

function menuDelRol() {
  return Object.entries(RUTAS).filter(([, r]) => r.roles.includes(ctx.perfil.rol)).map(([ruta, r]) => ({ ruta, ...r }));
}
function pintarMenu(actual) {
  const items = menuDelRol();
  menu.hidden = items.length < 2;
  menu.replaceChildren(...items.map((i) => h('a', { href: `#${i.ruta}`, 'aria-current': i.ruta === actual ? 'page' : null }, i.menu)));
}

async function dibujar() {
  const mio = ++turno;
  let ruta = rutaActual();
  if (!RUTAS[ruta] || !RUTAS[ruta].roles.includes(ctx.perfil.rol)) { ruta = INICIO[ctx.perfil.rol]; history.replaceState(null, '', `#${ruta}`); }
  const def = RUTAS[ruta];
  pintarMenu(ruta);
  document.title = `${def.menu} · JeaDas.Insights`;
  limpiar(raiz).append(cargando());
  try {
    const sinContexto = ctx.perfil.rol !== 'superadmin' && !ctx.colegio;
    if (sinContexto) {
      raiz.replaceChildren(h('p', { class: 'vacio' }, ctx.perfil.rol === 'tutor' ? 'Todavía no tiene estudiantes vinculados. Comuníquese con el colegio.' : 'Todavía no tiene colegios asignados. Pida a su administrador que se los asigne.'));
      return;
    }
    const modulo = await import(`./vistas/${def.vista}.js`);
    const destino = h('div', { class: 'stack', style: '--stack:1.25rem' });
    await modulo.default(ctx, destino);
    if (mio !== turno) return;                                   // llegó una navegación o un cambio de contexto más reciente
    raiz.replaceChildren(destino);
    (destino.querySelector('h1') ?? raiz).setAttribute('tabindex', '-1');
    (destino.querySelector('h1') ?? raiz).focus({ preventScroll: true });
  } catch (e) {
    if (mio !== turno) return;
    console.error(e);
    raiz.replaceChildren(cajaError(`No se pudo mostrar esta sección. ${e?.message ?? await textoError(e)}`));
  }
}

iniciar().catch((e) => { console.error(e); raiz.replaceChildren(cajaError('No se pudo iniciar la aplicación. Revise su conexión e intente de nuevo.')); });
