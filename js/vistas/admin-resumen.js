// Panel del Administrador de colegio: KPI, embudo de avance, alertas y causas de retraso.
import { h, tarjetaKpi, filaBarra, tabla, vacio, fmtNum, fmtPct, fmtFecha, fmtFechaHora, CAUSAS, cajaError } from '../ui.js';

export default async function vista(ctx, raiz) {
  const { sb, colegioId } = ctx;
  const [kpi, per, emb, causas, alertas] = await Promise.all([
    sb.from('v_kpi_colegio').select('*').eq('colegio_id', colegioId).maybeSingle(),
    sb.from('v_periodo_actual').select('*').eq('colegio_id', colegioId).maybeSingle(),
    sb.from('v_embudo_progreso').select('*').eq('colegio_id', colegioId).maybeSingle(),
    sb.from('v_top_causas_retraso').select('*').eq('colegio_id', colegioId).order('veces', { ascending: false }).limit(6),
    sb.from('v_estudiantes_alerta').select('*').eq('colegio_id', colegioId).order('habilitaciones', { ascending: false }).limit(50),
  ]);
  const fallo = [kpi, per, emb, causas, alertas].find((r) => r.error);
  if (fallo) { raiz.append(cajaError(fallo.error.message)); return; }
  const k = kpi.data ?? {}, p = per.data, e = emb.data;

  raiz.append(
    h('div', { class: 'cabecera-pagina' },
      h('div', {}, h('h1', {}, ctx.colegio.nombre), h('p', { class: 'muted' }, ctx.colegio.ciudad ?? 'Resumen del periodo vigente')),
      ctx.selectorColegio()),

    p
      ? h('div', { class: `banner ${p.estado === 'abierto' ? 'banner--ok' : 'banner--alerta'}` },
          h('strong', {}, `${p.nombre} · ${p.estado === 'abierto' ? 'abierto' : 'cerrado'}`),
          p.estado === 'abierto'
            ? `Cierra el ${fmtFecha(p.fecha_cierre)} (faltan ${p.dias_restantes} día${p.dias_restantes === 1 ? '' : 's'}).`
            : `Cerró el ${fmtFecha(p.fecha_cierre)}. Las familias sin reportes completos quedan bloqueadas hasta que usted las habilite.`)
      : h('div', { class: 'banner banner--alerta' }, h('strong', {}, 'No hay un periodo vigente'),
          'Defina la gestión y sus periodos en la sección "Periodos y habilitaciones".'),

    h('div', { class: 'rejilla-kpi' },
      tarjetaKpi(fmtNum(k.estudiantes_activos ?? 0), 'Estudiantes activos'),
      tarjetaKpi(fmtNum(k.tutores_unicos ?? 0), 'Tutores (números únicos)'),
      tarjetaKpi(e ? fmtPct(e.pct_completado) : '—', 'Familias con el periodo completo'),
      tarjetaKpi(fmtNum(e?.rezagados ?? 0), 'Familias pendientes')),

    h('div', { class: 'grid gap-4 lg:grid-cols-2' },
      h('section', { class: 'tarjeta', 'aria-labelledby': 'h-embudo' },
        h('h2', { id: 'h-embudo' }, 'Avance de reportes'),
        e ? [
          filaBarra({ etiqueta: 'Familias asignadas', valor: e.total_familias, maximo: e.total_familias, detalle: 'Estudiantes activos con reportes por presentar.' }),
          filaBarra({ etiqueta: 'Iniciaron su reporte', valor: e.iniciaron, maximo: e.total_familias }),
          filaBarra({ etiqueta: 'Completaron el periodo', valor: e.completaron, maximo: e.total_familias, detalle: fmtPct(e.pct_completado) }),
        ] : vacio('Aún no hay datos del periodo.')),
      h('section', { class: 'tarjeta', 'aria-labelledby': 'h-causas' },
        h('h2', { id: 'h-causas' }, 'Causas de retraso más frecuentes'),
        causas.data.length
          ? causas.data.map((c) => filaBarra({ etiqueta: CAUSAS[c.categoria_causa] ?? c.categoria_causa, valor: c.veces, maximo: causas.data[0].veces, texto: `${c.veces} (${c.estudiantes} est.)`, detalle: `Última: ${fmtFechaHora(c.ultima)}` }))
          : vacio('Sin habilitaciones registradas.'))),

    h('section', { 'aria-labelledby': 'h-alertas' },
      h('h2', { id: 'h-alertas', style: 'margin-bottom:.75rem' }, 'Estudiantes en alerta'),
      tabla([
        { t: 'Estudiante', k: (f) => h('strong', {}, f.estudiante) },
        { t: 'Curso', k: (f) => f.curso },
        { t: 'Habilitaciones', k: (f) => fmtNum(f.habilitaciones) },
        { t: 'Causa frecuente', k: (f) => CAUSAS[f.causa_frecuente] ?? '—' },
        { t: 'Estado', k: (f) => f.bloqueado_ahora ? h('span', { class: 'insignia insignia--alerta' }, 'Bloqueado') : f.habilitado_vigente ? h('span', { class: 'insignia insignia--aviso' }, 'Habilitado') : h('span', { class: 'insignia insignia--ok' }, 'Sin bloqueo') },
      ], alertas.data, { vacioTexto: 'No hay estudiantes en alerta. ¡Buen trabajo!' })),
  );
}
