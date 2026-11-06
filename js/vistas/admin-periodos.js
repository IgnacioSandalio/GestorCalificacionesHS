// Periodos de la gestión y habilitaciones excepcionales (24 / 48 h) para familias bloqueadas.
import { h, limpiar, tabla, campo, avisar, abrirModal, fmtFecha, fmtFechaHora, nombreCompleto, CAUSAS, vacio, cajaError } from '../ui.js';
import { textoError } from '../api.js';

const ESTADOS = { abierto: ['insignia--ok', 'Abierto'], cerrado: ['insignia--alerta', 'Cerrado'], programado: ['insignia--aviso', 'Programado'] };
const N_PERIODOS = { trimestral: 3, bimestral: 4, semestral: 2 };

export default async function vista(ctx, raiz) {
  const { sb, colegioId } = ctx;
  const [g, hs, es] = await Promise.all([
    sb.from('gestiones').select('*').eq('colegio_id', colegioId).order('anio', { ascending: false }),
    sb.from('solicitudes_habilitacion').select('*').eq('colegio_id', colegioId).order('solicitado_at', { ascending: false }).limit(60),
    sb.from('estudiantes').select('id, nombres, apellido_paterno, apellido_materno, codigo_rude').eq('colegio_id', colegioId).eq('estado', 'activo').order('apellido_paterno'),
  ]);
  const fallo = [g, hs, es].find((r) => r.error); if (fallo) { raiz.append(cajaError(fallo.error.message)); return; }
  const activa = g.data.find((x) => x.activa);
  const per = activa ? (await sb.from('periodos').select('*').eq('gestion_id', activa.id).order('numero')).data ?? [] : [];
  const nombreEst = new Map(es.data.map((e) => [e.id, nombreCompleto(e)]));
  const nombrePer = new Map(per.map((p) => [p.id, p.nombre]));

  /* --- definir gestión --- */
  function definirGestion() {
    const anio = new Date().getFullYear();
    const tipo = campo({ id: 'g-tipo', etiqueta: 'Tipo de periodo', valor: 'trimestral', opciones: Object.keys(N_PERIODOS).map((k) => ({ valor: k, texto: k[0].toUpperCase() + k.slice(1) })) });
    const zonaCierres = h('div', { class: 'formulario formulario--2' });
    const f = { anio: campo({ id: 'g-anio', etiqueta: 'Año de la gestión', tipo: 'number', valor: anio, requerido: true }),
      ini: campo({ id: 'g-ini', etiqueta: 'Inicio de clases', tipo: 'date', valor: `${anio}-02-01`, requerido: true }),
      fin: campo({ id: 'g-fin', etiqueta: 'Fin de la gestión', tipo: 'date', valor: `${anio}-12-15`, requerido: true }) };
    const pintarCierres = () => {
      const n = N_PERIODOS[tipo.querySelector('select').value]; limpiar(zonaCierres);
      for (let i = 1; i <= n; i++) zonaCierres.append(campo({ id: `g-c${i}`, etiqueta: `Fecha de cierre del periodo ${i}`, tipo: 'date', requerido: true, ayuda: i === n ? 'Debe ser igual o anterior al fin de la gestión.' : undefined }));
    };
    tipo.querySelector('select').addEventListener('change', pintarCierres); pintarCierres();
    const error = h('p', { class: 'mensaje', role: 'alert', hidden: true });
    abrirModal({
      titulo: 'Definir gestión y periodos', ancho: '44rem',
      contenido: [activa ? h('p', { class: 'banner banner--alerta' }, h('strong', {}, 'Atención'), 'La gestión activa pasará a inactiva y esta será la vigente.') : null,
        h('div', { class: 'formulario formulario--2' }, f.anio, tipo, f.ini, f.fin), zonaCierres, error],
      acciones: [{ texto: 'Cancelar', secundario: true }, { texto: 'Crear gestión', cierra: false, onclick: async ({ cerrar }) => {
        const n = N_PERIODOS[tipo.querySelector('select').value];
        const cierres = Array.from({ length: n }, (_, i) => document.getElementById(`g-c${i + 1}`).value);
        if (cierres.some((c) => !c) || !f.ini.querySelector('input').value || !f.fin.querySelector('input').value) { error.textContent = 'Complete todas las fechas.'; error.hidden = false; return false; }
        const { error: e } = await sb.rpc('crear_gestion', { p_colegio: colegioId, p_anio: Number(f.anio.querySelector('input').value), p_tipo: tipo.querySelector('select').value,
          p_inicio: f.ini.querySelector('input').value, p_fin: f.fin.querySelector('input').value, p_cierres: cierres });
        if (e) { error.textContent = await textoError(e); error.hidden = false; return false; }
        avisar('Gestión creada'); cerrar(); ctx.recargar();
      } }],
    });
  }

  /* --- nueva habilitación --- */
  function nuevaHabilitacion() {
    const habilitables = per.filter((p) => ['abierto', 'cerrado'].includes(p.estado));
    if (!habilitables.length) return avisar('No hay un periodo abierto o cerrado que habilitar.', 'error');
    const sel = (id, etiqueta, opciones, extra = {}) => campo({ id, etiqueta, opciones, requerido: true, ...extra });
    const fe = sel('h-est', 'Estudiante', es.data.map((e) => ({ valor: e.id, texto: `${nombreCompleto(e)} · ${e.codigo_rude}` })));
    const fp = sel('h-per', 'Periodo', habilitables.map((p) => ({ valor: p.id, texto: p.nombre })), { valor: habilitables.find((p) => p.estado === 'cerrado')?.id ?? habilitables[0].id });
    const fc = sel('h-causa', 'Causa del retraso', Object.entries(CAUSAS).map(([k, v]) => ({ valor: k, texto: v })));
    const fh = sel('h-horas', 'Plazo de habilitación', [{ valor: 24, texto: '24 horas' }, { valor: 48, texto: '48 horas' }]);
    const fm = campo({ id: 'h-motivo', etiqueta: 'Motivo (obligatorio)', tipo: 'textarea', requerido: true, ayuda: 'Describa brevemente la situación (mínimo 10 caracteres). Queda registrado con su nombre y la fecha.' });
    const error = h('p', { class: 'mensaje', role: 'alert', hidden: true });
    abrirModal({
      titulo: 'Habilitar registro excepcional', ancho: '40rem',
      contenido: [h('div', { class: 'formulario' }, fe, fp, fc, fh, fm), error],
      acciones: [{ texto: 'Cancelar', secundario: true }, { texto: 'Habilitar', cierra: false, onclick: async ({ cerrar }) => {
        const v = (g) => g.querySelector('input,select,textarea').value;
        if (v(fm).trim().length < 10) { error.textContent = 'Escriba un motivo de al menos 10 caracteres.'; error.hidden = false; return false; }
        const { error: e } = await sb.from('solicitudes_habilitacion').insert({ colegio_id: colegioId, periodo_id: v(fp), estudiante_id: v(fe), categoria_causa: v(fc), motivo: v(fm).trim(), horas: Number(v(fh)) });
        if (e) { error.textContent = await textoError(e); error.hidden = false; return false; }
        avisar('Habilitación registrada'); cerrar(); ctx.recargar();
      } }],
    });
  }

  raiz.append(
    h('div', { class: 'cabecera-pagina' }, h('div', {}, h('h1', {}, 'Periodos y habilitaciones'), h('p', { class: 'muted' }, activa ? `Gestión ${activa.anio} · ${activa.tipo_periodo}` : 'Sin gestión activa')), ctx.selectorColegio()),
    h('section', { class: 'stack', style: '--stack:.75rem', 'aria-labelledby': 'h-per' },
      h('div', { class: 'cabecera-pagina' }, h('h2', { id: 'h-per' }, 'Periodos'), h('button', { type: 'button', class: 'btn btn--secundario', onclick: definirGestion }, activa ? 'Definir nueva gestión' : 'Definir gestión')),
      per.length ? tabla([
        { t: 'Periodo', k: (p) => h('strong', {}, p.nombre) }, { t: 'Inicio', k: (p) => fmtFecha(p.fecha_inicio) }, { t: 'Cierre', k: (p) => fmtFecha(p.fecha_cierre) },
        { t: 'Estado', k: (p) => h('span', { class: `insignia ${ESTADOS[p.estado][0]}` }, ESTADOS[p.estado][1]) }], per)
        : vacio('Defina la gestión para generar los periodos. El sistema abre y cierra cada periodo automáticamente por fecha.')),
    h('section', { class: 'stack', style: '--stack:.75rem', 'aria-labelledby': 'h-hab' },
      h('div', { class: 'cabecera-pagina' }, h('h2', { id: 'h-hab' }, 'Habilitaciones'), h('button', { type: 'button', class: 'btn', onclick: nuevaHabilitacion }, 'Nueva habilitación')),
      tabla([
        { t: 'Estudiante', k: (x) => h('strong', {}, nombreEst.get(x.estudiante_id) ?? '—') }, { t: 'Periodo', k: (x) => nombrePer.get(x.periodo_id) ?? '—' },
        { t: 'Causa', k: (x) => CAUSAS[x.categoria_causa] ?? x.categoria_causa }, { t: 'Plazo', k: (x) => `${x.horas} h` },
        { t: 'Vigente hasta', k: (x) => fmtFechaHora(x.habilitado_hasta) }, { t: 'Registró', k: (x) => x.autor_nombre ?? '—' },
        { t: 'Motivo', k: (x) => x.motivo }], hs.data, { vacioTexto: 'Todavía no hay habilitaciones.' })));
}
