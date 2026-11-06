// Portal del tutor: mini-dashboard del hijo elegido en la barra superior (reportes enviados, promedio, plazo) y sus reportes del periodo vigente (mensuales si es nuevo en el primer periodo),
// lista de materias con check (listo / falta); al tocar una materia se llena su nota y se suben sus evidencias.
// Las evidencias pueden subirse por materia o en un solo bloque por periodo (se elige una vez). Visor incluido.
import { h, limpiar, campo, avisar, abrirModal, cargando, cajaError, vacio, nombreCompleto, fmtFecha, fmtFechaHora, fmtNum, nombreMes, mesesEntre, tarjetaKpi } from '../ui.js';
import { textoError } from '../api.js';
import { listaEvidencias, cajaSubida } from '../archivos.js';

const DIMENSIONES = [['ser', 'Ser'], ['saber', 'Saber'], ['hacer', 'Hacer']];
const VALORACIONES = [['', '—'], ['ED', 'ED · En desarrollo'], ['DA', 'DA · Desarrollo aceptable'], ['DO', 'DO · Desarrollo óptimo'], ['DP', 'DP · Desarrollo pleno']];
const ETIQ_ESTADO = { borrador: ['insignia--aviso', 'Borrador'], enviado: ['insignia--ok', 'Enviado'], aprobado: ['insignia--ok', 'Aprobado'] };

export default async function vista(ctx, raiz) {
  const { sb } = ctx; const hijo = ctx.hijo;
  raiz.append(h('div', { class: 'cabecera-pagina' }, h('div', {}, h('h1', {}, 'Mis hijos'), h('p', { class: 'muted' }, ctx.hijos.length > 1 ? 'Elija a su hijo o hija en la barra superior para ver sus calificaciones y reportes.' : 'Registre las calificaciones de cada periodo y adjunte sus evidencias.'))));
  if (!hijo) { raiz.append(vacio('No hay estudiantes asociados a su cuenta. Comuníquese con el colegio.')); return; }
  // Todo se filtra por el colegio del hijo elegido (api.js añade colegio_id) y por el propio estudiante
  const [e, c, n, pv] = await Promise.all([
    sb.from('estudiantes').select('*').eq('id', hijo.id).single(),
    sb.from('cursos').select('*'), sb.from('niveles').select('*'), sb.from('v_periodo_actual').select('*'),
  ]);
  const fallo = [e, c, n, pv].find((r) => r.error); if (fallo) { raiz.append(cajaError(fallo.error.message)); return; }
  const est = e.data; const curso = c.data.find((x) => x.id === est.curso_id); const nivel = n.data.find((x) => x.id === curso?.nivel_id);
  const per = pv.data.find((x) => x.colegio_id === est.colegio_id);
  const panel = h('section', { class: 'rejilla-kpi', 'aria-label': `Resumen de ${est.nombres}` });
  const tarjeta = h('section', { class: 'tarjeta stack', style: '--stack:1rem', 'aria-label': nombreCompleto(est) }, cargando());
  raiz.append(panel, tarjeta);
  pintarHijo(ctx, tarjeta, { est, curso, nivel, per, panel }).catch((err) => limpiar(tarjeta).append(cajaError(err.message)));
}

async function pintarHijo(ctx, tarjeta, { est, curso, nivel, per, panel }) {
  const { sb } = ctx;
  const cab = h('div', { class: 'cabecera-pagina' },
    h('div', {}, h('h2', {}, nombreCompleto(est)), h('p', { class: 'muted' }, `${curso?.nombre ?? ''} · RUDE ${est.codigo_rude}`)),
    h('span', { class: `insignia ${est.condicion === 'nuevo' ? 'insignia--aviso' : 'insignia--ok'}` }, est.condicion === 'nuevo' ? 'Estudiante nuevo' : 'Estudiante antiguo'));
  if (!per) { limpiar(tarjeta).append(cab, vacio('El colegio todavía no tiene un periodo abierto.')); return; }

  const [estado, rep] = await Promise.all([
    sb.rpc('estado_registro', { p_estudiante: est.id, p_periodo: per.periodo_id }),
    sb.from('reportes').select('*').eq('estudiante_id', est.id).eq('periodo_id', per.periodo_id),
  ]);
  if (estado.error || rep.error) throw new Error((estado.error ?? rep.error).message);
  const st = estado.data; const reportes = rep.data;
  const mensual = est.condicion === 'nuevo' && per.numero === 1;
  const ranuras = mensual ? mesesEntre(per.fecha_inicio, per.fecha_cierre).map((m) => ({ mes: m, etiqueta: `Reporte de ${nombreMes(m)}` })) : [{ mes: null, etiqueta: `Reporte del ${per.nombre}` }];
  const hechos = ranuras.filter((r) => reportes.some((x) => (x.mes_referencia ?? null) === r.mes && ['enviado', 'aprobado'].includes(x.estado))).length;

  const proms = reportes.map((x) => x.promedio_general).filter((x) => x != null);
  const promedio = proms.length ? proms.reduce((s, x) => s + Number(x), 0) / proms.length : null;
  limpiar(panel).append(
    tarjetaKpi(`${hechos} de ${ranuras.length}`, 'Reportes enviados', per.nombre),
    tarjetaKpi(promedio === null ? '—' : fmtNum(Math.round(promedio * 10) / 10), nivel?.tipo_evaluacion === 'cualitativa' ? 'Promedio (no aplica en Inicial)' : 'Promedio de reportes enviados', curso?.nombre ?? ''),
    tarjetaKpi(st.puede_registrar ? `${st.dias_restantes} día${st.dias_restantes === 1 ? '' : 's'}` : 'Cerrado', st.puede_registrar ? 'Para el cierre del periodo' : 'Registro bloqueado', st.puede_registrar ? `Cierra el ${fmtFecha(st.fecha_cierre)}` : 'Pida una habilitación si la necesita'));
  const banner = st.puede_registrar
    ? h('div', { class: 'banner banner--ok' }, h('strong', {}, st.habilitado_hasta ? `Habilitado hasta el ${fmtFechaHora(st.habilitado_hasta)}` : `${per.nombre}: registro abierto`),
        st.habilitado_hasta ? 'El colegio le dio un plazo excepcional para completar sus reportes.' : `Cierra el ${fmtFecha(st.fecha_cierre)} (faltan ${st.dias_restantes} día${st.dias_restantes === 1 ? '' : 's'}).`)
    : h('div', { class: 'banner banner--alerta' }, h('strong', {}, st.periodo_estado === 'programado' ? 'Este periodo aún no comienza' : 'Registro bloqueado'),
        st.periodo_estado === 'programado' ? 'Podrá registrar desde la fecha de inicio.' : 'El plazo venció. Si tuvo un inconveniente, pida a su administrador una habilitación de 24 o 48 horas.');

  const lista = h('ul', { style: 'list-style:none;margin:0;padding:0', class: 'stack' },
    ranuras.map((r) => {
      const x = reportes.find((y) => (y.mes_referencia ?? null) === r.mes);
      const [clase, texto] = x ? (ETIQ_ESTADO[x.estado] ?? ['', x.estado]) : ['insignia--alerta', 'Pendiente'];
      const editable = st.puede_registrar;
      return h('li', { class: 'flex flex-wrap items-center justify-between gap-3', style: 'padding:.6rem 0;border-top:1px solid var(--color-border)' },
        h('div', {}, h('strong', {}, r.etiqueta), x?.promedio_general != null ? h('div', { class: 'muted', style: 'font-size:var(--fs-sm)' }, `Promedio: ${fmtNum(x.promedio_general)}`) : null),
        h('div', { class: 'acciones' }, h('span', { class: `insignia ${clase}` }, texto),
          h('button', { type: 'button', class: x ? 'btn btn--secundario btn--compacto' : 'btn btn--compacto', disabled: !editable && !x, onclick: () => abrirReporte(ctx, { est, curso, nivel, per, ranura: r, reporte: x, editable, alGuardar: () => pintarHijo(ctx, tarjeta, { est, curso, nivel, per }) }) },
            editable ? (x ? 'Editar' : 'Registrar') : 'Ver')));
    }));
  limpiar(tarjeta).append(cab, banner, h('p', { class: 'muted' }, `${hechos} de ${ranuras.length} reporte(s) enviados · ${mensual ? 'Por ser estudiante nuevo, el primer periodo se reporta mes a mes.' : 'Un reporte por periodo.'}`), lista,
    h('div', {}, h('button', { type: 'button', class: 'btn btn--secundario btn--compacto', onclick: () => abrirMisEvidencias(ctx, est) }, 'Ver todas las evidencias de este estudiante')));
}

async function abrirMisEvidencias(ctx, est) {
  const { sb } = ctx;
  const { data, error } = await sb.from('v_evidencias').select('*').eq('estudiante_id', est.id).order('created_at', { ascending: false });
  if (error) return avisar(await textoError(error), 'error');
  const grupos = new Map();
  data.forEach((e) => { const k = `${e.periodo}${e.mes_referencia ? ` · ${nombreMes(e.mes_referencia)}` : ''}`; (grupos.get(k) ?? grupos.set(k, []).get(k)).push(e); });
  abrirModal({
    titulo: `Evidencias de ${est.nombres}`, ancho: '46rem',
    contenido: grupos.size ? [...grupos].map(([k, evs]) => h('section', {}, h('h3', {}, k),
      h('p', { class: 'muted' }, 'Por materia: ' + ([...new Set(evs.map((x) => x.materia ?? 'Bloque general'))].join(', '))), listaEvidencias(sb, evs)))
      : [vacio('Todavía no hay evidencias subidas para este estudiante.')],
    acciones: [{ texto: 'Cerrar', secundario: true }],
  });
}

const selectorModo = (ambito, alElegir) => h('div', { class: 'stack', style: '--stack:.75rem' },
  h('p', {}, h('strong', {}, `¿Desea subir evidencias por materia en el ${ambito}, o un solo bloque por todo el periodo?`)),
  h('div', { class: 'modos' },
    h('button', { type: 'button', class: 'opcion-modo', onclick: () => alElegir('por_materia') }, h('strong', {}, 'Por materia'), h('span', { class: 'muted' }, 'Subiré las evidencias de cada materia por separado.')),
    h('button', { type: 'button', class: 'opcion-modo', onclick: () => alElegir('bloque') }, h('strong', {}, 'Un solo bloque'), h('span', { class: 'muted' }, 'Subiré un solo grupo de evidencias por todo el periodo.'))),
  h('p', { class: 'muted', style: 'font-size:var(--fs-sm)' }, 'Podrá cambiar esta elección mientras no haya subido ningún archivo.'));

async function abrirReporte(ctx, { est, curso, nivel, per, ranura, reporte: reporteInicial, editable: editableBase, alGuardar }) {
  const { sb } = ctx; const cualitativo = nivel?.tipo_evaluacion === 'cualitativa';
  let reporte = reporteInicial; let materias = []; let notas = []; let evs = [];
  const editable = () => editableBase && reporte?.estado !== 'aprobado';
  const ambito = ranura.mes ? `mes de ${nombreMes(ranura.mes)}` : per.nombre;
  const cuerpo = h('div', { class: 'stack', style: '--stack:1.25rem' }, cargando());
  const m = abrirModal({ titulo: ranura.etiqueta, ancho: '46rem', contenido: [cuerpo], acciones: [{ texto: 'Cerrar', secundario: true }] });
  m.dlg.addEventListener('close', () => alGuardar());
  const fallo = async (e) => avisar(e?.message ?? await textoError(e), 'error');

  async function asegurar() {
    if (reporte) return reporte;
    const { data, error } = await sb.from('reportes').insert({ colegio_id: est.colegio_id, estudiante_id: est.id, periodo_id: per.periodo_id, tipo: ranura.mes ? 'mensual' : 'periodo',
      mes_referencia: ranura.mes, estado: 'borrador', plataforma: est.plataforma_nombre ?? null }).select('*').single();
    if (error) throw new Error(await textoError(error));
    reporte = data; return reporte;
  }
  async function elegirModo(valor) {
    try {
      await asegurar();
      const { error } = await sb.from('reportes').update({ modo_evidencia: valor }).eq('id', reporte.id);
      if (error) throw new Error(await textoError(error));
      reporte.modo_evidencia = valor; await cargar();
    } catch (e) { fallo(e); }
  }
  const listaMateria = (mat) => (cualitativo ? DIMENSIONES.every(([d]) => notas.some((n) => n.materia_id === mat.id && n.dimension === d)) : notas.some((n) => n.materia_id === mat.id));

  async function cargar() {
    const [mt, nt, ev] = await Promise.all([
      sb.from('materias').select('*').eq('nivel_id', nivel.id).eq('activa', true).order('orden'),
      reporte ? sb.from('reporte_notas').select('*').eq('reporte_id', reporte.id) : Promise.resolve({ data: [], error: null }),
      reporte ? sb.from('v_evidencias').select('*').eq('reporte_id', reporte.id).order('created_at') : Promise.resolve({ data: [], error: null }),
    ]);
    const f = [mt, nt, ev].find((r) => r.error); if (f) { limpiar(cuerpo).append(cajaError(await textoError(f.error))); return; }
    materias = mt.data; notas = nt.data; evs = ev.data; pintar();
  }

  function pintar() {
    const modo = reporte?.modo_evidencia ?? null; const puede = editable();
    const listas = materias.filter(listaMateria).length; const todas = materias.length > 0 && listas === materias.length;
    const bloqueBan = puede ? null : h('p', { class: 'banner banner--alerta' }, 'El registro está bloqueado: solo puede consultar.');

    // 1) modo de evidencias
    let modoUI;
    if (!modo && puede) modoUI = h('div', { class: 'tarjeta' }, selectorModo(ambito, elegirModo));
    else modoUI = h('p', { class: 'muted' }, 'Evidencias: ', h('strong', {}, modo === 'bloque' ? 'un solo bloque' : modo === 'por_materia' ? 'por materia' : 'sin elegir'),
      puede && modo && !evs.length ? h('button', { type: 'button', class: 'btn btn--secundario btn--compacto', style: 'margin-left:.5rem', onclick: () => elegirModo(modo === 'bloque' ? 'por_materia' : 'bloque') }, 'Cambiar') : null);

    // 2) checklist (solo materias y su estado)
    const lista = h('ul', { class: 'lista-check', 'aria-label': 'Materias' }, materias.map((mat) => {
      const ok = listaMateria(mat); const n = evs.filter((e) => e.materia_id === mat.id).length;
      return h('li', {}, h('button', { type: 'button', class: 'fila-check', onclick: () => abrirMateria(mat) },
        h('span', { class: 'fila-check__nombre' }, mat.nombre),
        h('span', { class: 'fila-check__meta' }, n ? h('span', { class: 'muted', title: 'Evidencias subidas' }, `📎 ${n}`) : null,
          h('span', { class: `insignia ${ok ? 'insignia--ok' : 'insignia--alerta'}` }, ok ? 'Listo ✓' : 'Falta'))));
    }));

    // 3) bloque general
    const bloque = modo === 'bloque' ? h('section', { class: 'stack', style: '--stack:.5rem' }, h('h3', {}, `Evidencias del ${ambito}`),
      listaEvidencias(sb, evs, { editable: puede, alCambiar: cargar }),
      puede ? cajaSubida(sb, { reporte_id: reporte.id, materia_id: null }, { alTerminar: cargar, etiqueta: 'Agregar evidencias del periodo' }) : null) : null;

    // 4) datos del reporte y envío
    const fecha = campo({ id: 'r-fecha', etiqueta: 'Fecha del reporte', tipo: 'date', valor: reporte?.fecha_reporte ?? new Date().toISOString().slice(0, 10), atributos: { disabled: !puede } });
    const plat = campo({ id: 'r-plat', etiqueta: 'Plataforma educativa', valor: reporte?.plataforma ?? est.plataforma_nombre ?? '', atributos: { disabled: !puede } });
    const obs = campo({ id: 'r-obs', etiqueta: 'Observaciones', tipo: 'textarea', valor: reporte?.observaciones ?? '', atributos: { disabled: !puede } });
    const val = (g) => g.querySelector('input,select,textarea').value;
    const guardarDatos = async () => {
      await asegurar();
      const { error } = await sb.from('reportes').update({ fecha_reporte: val(fecha), plataforma: val(plat) || null, observaciones: val(obs) || null }).eq('id', reporte.id);
      if (error) throw new Error(await textoError(error));
    };
    const enviado = reporte?.estado === 'enviado' || reporte?.estado === 'aprobado';
    const acciones = puede ? h('div', { class: 'acciones' },
      h('button', { type: 'button', class: 'btn btn--secundario', onclick: async (e) => { e.currentTarget.disabled = true; try { await guardarDatos(); avisar('Datos guardados'); await cargar(); } catch (er) { fallo(er); } finally { e.currentTarget.disabled = false; } } }, 'Guardar datos'),
      h('button', { type: 'button', class: 'btn', disabled: !todas && !enviado, title: todas || enviado ? '' : 'Complete todas las materias', onclick: async (e) => {
        e.currentTarget.disabled = true;
        try {
          await guardarDatos();
          if (reporte.estado !== 'enviado') {
            const { error } = await sb.from('reportes').update({ estado: 'enviado' }).eq('id', reporte.id);
            if (error) throw new Error(await textoError(error));
          }
          avisar(enviado ? 'Cambios guardados' : 'Reporte enviado'); m.cerrar();
        } catch (er) { fallo(er); e.currentTarget.disabled = false; }
      } }, enviado ? 'Guardar cambios' : 'Enviar reporte')) : null;

    limpiar(cuerpo).append(...[
      h('p', { class: 'muted' }, `${nombreCompleto(est)} · ${curso?.nombre ?? ''} · ${cualitativo ? 'Valoración cualitativa (ED, DA, DO, DP)' : 'Nota de 0 a 100'}`),
      bloqueBan, modoUI,
      h('section', { class: 'stack', style: '--stack:.5rem' }, h('h3', {}, 'Materias'),
        h('p', { class: 'muted' }, `${listas} de ${materias.length} listas. Toque una materia para ${puede ? 'registrar su nota y subir sus evidencias' : 'consultarla'}.`), lista),
      bloque,
      h('details', {}, h('summary', {}, 'Datos del reporte'), h('div', { class: 'formulario formulario--2', style: 'margin-top:.75rem' }, fecha, plat), obs),
      !todas && puede ? h('p', { class: 'muted' }, 'Para enviar el reporte, todas las materias deben estar en "Listo".') : null,
      acciones].filter(Boolean));
  }

  function abrirMateria(mat) {
    const puede = editable();
    const dlgCuerpo = h('div', { class: 'stack', style: '--stack:1.25rem' }, cargando());
    const mm = abrirModal({ titulo: mat.nombre, ancho: '42rem', contenido: [dlgCuerpo], acciones: [{ texto: 'Listo', secundario: true }] });
    mm.dlg.addEventListener('close', () => cargar());

    async function pintarMat() {
      const [nt, ev] = await Promise.all([
        reporte ? sb.from('reporte_notas').select('*').eq('reporte_id', reporte.id).eq('materia_id', mat.id) : Promise.resolve({ data: [], error: null }),
        reporte ? sb.from('v_evidencias').select('*').eq('reporte_id', reporte.id).eq('materia_id', mat.id).order('created_at') : Promise.resolve({ data: [], error: null }),
      ]);
      const f = [nt, ev].find((r) => r.error); if (f) { limpiar(dlgCuerpo).append(cajaError(await textoError(f.error))); return; }
      const previas = nt.data; const error = h('p', { class: 'mensaje', role: 'alert', hidden: true });
      let controles;
      if (!cualitativo) {
        const inp = h('input', { class: 'campo nota-celda', id: 'nota-materia', type: 'number', min: 0, max: 100, step: '0.01', inputmode: 'decimal', value: previas[0]?.nota ?? '', disabled: !puede });
        controles = { leer: () => { const v = inp.value.trim(); if (!v) return []; return [{ materia_id: mat.id, dimension: null, nota: Number(v.replace(',', '.')), valoracion: null }]; },
          ui: h('div', {}, h('label', { class: 'etiqueta', for: 'nota-materia' }, 'Nota (0 a 100)'), inp) };
      } else {
        const sels = DIMENSIONES.map(([d, et]) => ({ d, sel: h('select', { class: 'campo', disabled: !puede, 'aria-label': et },
          VALORACIONES.map(([v, t]) => h('option', { value: v, selected: previas.find((x) => x.dimension === d)?.valoracion === v }, t))), et }));
        controles = { leer: () => sels.filter((x) => x.sel.value).map((x) => ({ materia_id: mat.id, dimension: x.d, nota: null, valoracion: x.sel.value })),
          ui: h('div', { class: 'grid gap-3 md:grid-cols-3' }, sels.map((x) => h('div', {}, h('span', { class: 'etiqueta' }, x.et), x.sel))) };
      }
      const guardar = puede ? h('button', { type: 'button', class: 'btn', onclick: async (e) => {
        error.hidden = true; const filas = controles.leer();
        if (!filas.length) { error.textContent = cualitativo ? 'Elija al menos una valoración.' : 'Escriba la nota de la materia.'; error.hidden = false; return; }
        if (filas.some((x) => x.nota !== null && (!Number.isFinite(x.nota) || x.nota < 0 || x.nota > 100))) { error.textContent = 'La nota debe estar entre 0 y 100.'; error.hidden = false; return; }
        e.currentTarget.disabled = true;
        try {
          await asegurar();
          const { error: er } = await sb.from('reporte_notas').upsert(filas.map((x) => ({ ...x, colegio_id: est.colegio_id, reporte_id: reporte.id })), { onConflict: 'reporte_id,materia_id,dimension' });
          if (er) throw new Error(await textoError(er));
          avisar('Nota guardada'); await pintarMat();
        } catch (er) { error.textContent = er.message; error.hidden = false; } finally { e.currentTarget.disabled = false; }
      } }, 'Guardar nota') : null;

      const modo = reporte?.modo_evidencia ?? null; let bloqueEv;
      if (!modo) bloqueEv = puede ? h('div', { class: 'tarjeta' }, selectorModo(ambito, async (v) => { await elegirModo(v); await pintarMat(); })) : h('p', { class: 'muted' }, 'Sin evidencias.');
      else if (modo === 'bloque') bloqueEv = h('p', { class: 'muted' }, 'Usted eligió subir un solo bloque de evidencias para todo el periodo. Súbalas desde la pantalla anterior.');
      else bloqueEv = h('section', { class: 'stack', style: '--stack:.5rem' }, h('h3', {}, 'Evidencias de esta materia'),
        listaEvidencias(sb, ev.data, { editable: puede, alCambiar: pintarMat }),
        puede ? cajaSubida(sb, { reporte_id: reporte.id, materia_id: mat.id }, { alTerminar: pintarMat }) : null);
      limpiar(dlgCuerpo).append(...[!puede ? h('p', { class: 'banner banner--alerta' }, 'El registro está bloqueado: solo puede consultar.') : null, controles.ui, error, guardar, bloqueEv].filter(Boolean));
    }
    pintarMat().catch((e) => limpiar(dlgCuerpo).append(cajaError(e.message)));
  }

  cargar().catch((e) => limpiar(cuerpo).append(cajaError(e.message)));
}
