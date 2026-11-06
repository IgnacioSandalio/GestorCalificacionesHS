// Buscador de evidencias del cliente: filtra por colegio (selector superior), nivel, curso, periodo, materia y estudiante.
// Cada fila abre la ficha del reporte (notas + evidencias) y el visor. El superadministrador no tiene esta pantalla.
import { h, limpiar, tabla, campo, avisar, abrirModal, cajaError, vacio, cargando, fmtFechaHora, nombreMes, normalizarTexto, debounce } from '../ui.js';
import { textoError } from '../api.js';
import { listaEvidencias, abrirVisor, fmtTamano } from '../archivos.js';

const POR_PAGINA = 100;

export default async function vista(ctx, raiz) {
  const { sb, colegioId } = ctx;
  const { data, error } = await sb.from('v_evidencias').select('*').eq('colegio_id', colegioId).order('created_at', { ascending: false }).limit(1000);
  if (error) { raiz.append(cajaError(await textoError(error))); return; }
  const filas = data;

  const unicos = (clave, ord) => [...new Map(filas.map((f) => [f[clave], f])).values()].sort(ord);
  const opcion = (v, t) => ({ valor: v, texto: t });
  const nivel = campo({ id: 'f-nivel', etiqueta: 'Nivel', valor: '', opciones: [opcion('', 'Todos'), ...unicos('nivel_id', (a, b) => a.nivel.localeCompare(b.nivel)).map((f) => opcion(f.nivel_id, f.nivel))] });
  const curso = campo({ id: 'f-curso', etiqueta: 'Curso', valor: '', opciones: [opcion('', 'Todos')] });
  const periodo = campo({ id: 'f-per', etiqueta: 'Trimestre / bimestre', valor: '', opciones: [opcion('', 'Todos'), ...unicos('periodo_id', (a, b) => `${a.gestion}${a.periodo}`.localeCompare(`${b.gestion}${b.periodo}`)).map((f) => opcion(f.periodo_id, `${f.periodo} (${f.gestion})`))] });
  const materia = campo({ id: 'f-mat', etiqueta: 'Materia', valor: '', opciones: [opcion('', 'Todas'), opcion('__bloque', 'Bloque general (sin materia)'), ...unicos('materia_id', (a, b) => String(a.materia).localeCompare(String(b.materia))).filter((f) => f.materia_id).map((f) => opcion(f.materia_id, f.materia))] });
  const buscar = campo({ id: 'f-txt', etiqueta: 'Estudiante (nombre o número)', atributos: { type: 'search', placeholder: 'Ej.: 00012 o Mamani', autocomplete: 'off' } });
  const sel = (g) => g.querySelector('select,input');
  const cuerpo = h('div', { class: 'stack', style: '--stack:.75rem' });
  let pagina = 1;

  function recargarCursos() {
    const s = sel(curso); const n = sel(nivel).value;
    const cursos = unicos('curso_id', (a, b) => a.curso.localeCompare(b.curso)).filter((f) => !n || f.nivel_id === n);
    s.replaceChildren(...[opcion('', 'Todos'), ...cursos.map((f) => opcion(f.curso_id, f.curso))].map((o) => h('option', { value: o.valor }, o.texto)));
  }
  function filtradas() {
    const n = sel(nivel).value, c = sel(curso).value, p = sel(periodo).value, m = sel(materia).value, t = normalizarTexto(sel(buscar).value);
    return filas.filter((f) => (!n || f.nivel_id === n) && (!c || f.curso_id === c) && (!p || f.periodo_id === p)
      && (!m || (m === '__bloque' ? !f.materia_id : f.materia_id === m))
      && (!t || normalizarTexto(`${f.estudiante} ${String(f.estudiante_numero).padStart(5, '0')} ${f.estudiante_numero}`).includes(t)));
  }
  function pintar() {
    const lista = filtradas(); const visibles = lista.slice(0, pagina * POR_PAGINA);
    limpiar(cuerpo).append(
      h('p', { class: 'muted', role: 'status' }, `${lista.length} evidencia(s) encontradas.`),
      tabla([
        { t: 'Estudiante', k: (x) => h('span', {}, h('strong', {}, `#${String(x.estudiante_numero).padStart(5, '0')}`), ` ${x.estudiante}`) },
        { t: 'Curso', k: (x) => x.curso },
        { t: 'Periodo', k: (x) => `${x.periodo}${x.mes_referencia ? ` · ${nombreMes(x.mes_referencia)}` : ''}` },
        { t: 'Materia', k: (x) => x.materia ?? 'Bloque general' },
        { t: 'Archivo', k: (x) => h('span', {}, x.nombre_archivo, h('span', { class: 'muted' }, ` · ${fmtTamano(x.tamano_bytes)}`)) },
        { t: 'Subido', k: (x) => fmtFechaHora(x.created_at) },
        { t: 'Acciones', oculto: true, k: (x) => h('div', { class: 'acciones' },
          h('button', { type: 'button', class: 'btn btn--secundario btn--compacto', onclick: () => abrirVisor(sb, x) }, 'Ver'),
          h('button', { type: 'button', class: 'btn btn--secundario btn--compacto', onclick: () => ficha(x) }, 'Ficha')) },
      ], visibles, { vacioTexto: 'No hay evidencias con estos filtros.' }),
      lista.length > visibles.length ? h('button', { type: 'button', class: 'btn btn--secundario', onclick: () => { pagina++; pintar(); } }, `Mostrar más (${lista.length - visibles.length} restantes)`) : '');
  }

  /** Ficha del reporte: datos del estudiante, notas por materia y todas sus evidencias. */
  async function ficha(x) {
    const cont = h('div', { class: 'stack', style: '--stack:1rem' }, cargando());
    abrirModal({ titulo: `#${String(x.estudiante_numero).padStart(5, '0')} · ${x.estudiante}`, ancho: '48rem', contenido: [cont], acciones: [{ texto: 'Cerrar', secundario: true }] });
    const [nt, mt, ev, rp] = await Promise.all([
      sb.from('reporte_notas').select('*').eq('reporte_id', x.reporte_id),
      sb.from('materias').select('id, nombre, abreviatura, orden').eq('nivel_id', x.nivel_id).order('orden'),
      sb.from('v_evidencias').select('*').eq('reporte_id', x.reporte_id).order('created_at'),
      sb.from('reportes').select('*').eq('id', x.reporte_id).single(),
    ]);
    const f = [nt, mt, ev, rp].find((r) => r.error); if (f) { limpiar(cont).append(cajaError(await textoError(f.error))); return; }
    const filaNota = (mat) => {
      const ns = nt.data.filter((n) => n.materia_id === mat.id);
      return { mat, valor: ns.length ? ns.map((n) => (n.nota !== null ? n.nota : `${n.dimension}: ${n.valoracion}`)).join(' · ') : 'Falta', n: ev.data.filter((e) => e.materia_id === mat.id).length };
    };
    limpiar(cont).append(
      h('p', { class: 'muted' }, `${x.curso} · ${x.periodo}${x.mes_referencia ? ` · ${nombreMes(x.mes_referencia)}` : ''} · Reporte ${rp.data.estado}${rp.data.promedio_general != null ? ` · Promedio ${rp.data.promedio_general}` : ''}`),
      h('h3', {}, 'Notas'), tabla([{ t: 'Materia', k: (r) => r.mat.nombre }, { t: 'Nota / valoración', k: (r) => r.valor }, { t: 'Evidencias', k: (r) => r.n }], mt.data.map(filaNota)),
      h('h3', {}, 'Evidencias del reporte'), listaEvidencias(sb, ev.data));
  }

  const alFiltrar = debounce(() => { pagina = 1; pintar(); }, 150);
  sel(nivel).addEventListener('change', () => { recargarCursos(); alFiltrar(); });
  [curso, periodo, materia].forEach((g) => sel(g).addEventListener('change', alFiltrar));
  sel(buscar).addEventListener('input', alFiltrar);

  raiz.append(...[
    h('div', { class: 'cabecera-pagina' }, h('div', {}, h('h1', {}, 'Evidencias'), h('p', { class: 'muted' }, 'Busque y revise las evidencias que las familias subieron a su Google Drive.')), ctx.selectorColegio()),
    filas.length ? h('section', { class: 'tarjeta stack', style: '--stack:1rem', 'aria-label': 'Filtros' }, h('div', { class: 'formulario formulario--2' }, nivel, curso, periodo, materia), buscar) : null,
    filas.length ? cuerpo : vacio('Todavía no hay evidencias en este colegio. Cuando las familias suban archivos aparecerán aquí.')].filter(Boolean));
  if (filas.length) pintar();
}
