// Estudiantes y tutores: lista, alta individual, importación desde Excel y accesos de tutores.
import { h, limpiar, tabla, vacio, campo, avisar, abrirModal, cargando, cajaError, nombreCompleto, debounce, normalizarTexto, fmtNum } from '../ui.js';
import { leerXlsx } from '../xlsx-lector.js';
import { leerFilas, prepararPlan, validarFila, ejecutarImportacion } from '../importador.js';
import { gestionarUsuario, mostrarCredenciales, sugerirUsuario } from '../credenciales.js';

export default async function vista(ctx, raiz) {
  const { sb, colegioId } = ctx;
  let datos = await cargar(sb, colegioId);
  let filtro = '';
  const zonaTabla = h('div', { 'aria-live': 'polite' });

  const dibujarTabla = () => {
    const q = normalizarTexto(filtro);
    const filas = datos.estudiantes.filter((e) => !q || normalizarTexto(`${nombreCompleto(e)} ${e.apellido_paterno} ${e.codigo_rude}`).includes(q)
      || datos.tutoresDe(e.id).some((t) => normalizarTexto(`${t.nombres} ${t.apellidos} ${t.telefono_whatsapp}`).includes(q)));
    limpiar(zonaTabla).append(tabla([
      { t: 'Estudiante', k: (e) => h('div', {}, h('strong', {}, `${e.apellido_paterno ?? ''} ${e.apellido_materno ?? ''} ${e.nombres}`.trim()), h('div', { class: 'muted', style: 'font-size:var(--fs-sm)' }, `RUDE ${e.codigo_rude}`)) },
      { t: 'Curso', k: (e) => datos.cursoDe(e.curso_id)?.nombre ?? '—' },
      { t: 'Condición', k: (e) => h('span', { class: `insignia ${e.condicion === 'nuevo' ? 'insignia--aviso' : 'insignia--ok'}` }, e.condicion === 'nuevo' ? 'Nuevo' : 'Antiguo') },
      { t: 'Tutores', k: (e) => h('div', { class: 'stack', style: '--stack:.5rem;text-align:inherit' }, datos.tutoresDe(e.id).map((t) => filaTutor(t))) },
    ], filas, { vacioTexto: filtro ? 'Ningún resultado para su búsqueda.' : 'Todavía no hay estudiantes. Impórtelos desde Excel o agréguelos uno por uno.' }));
  };

  const filaTutor = (t) => h('div', { class: 'flex flex-wrap items-center gap-2' },
    h('span', {}, `${t.nombres} ${t.apellidos ?? ''}`.trim(), h('span', { class: 'muted' }, ` · ${t.telefono_whatsapp}`)),
    t.perfil_id
      ? h('button', { type: 'button', class: 'btn btn--secundario btn--compacto', onclick: () => restablecer(t) }, 'Restablecer clave')
      : h('button', { type: 'button', class: 'btn btn--compacto', onclick: () => crearAcceso(t) }, 'Crear acceso'));

  async function recargar() { datos = await cargar(sb, colegioId); dibujarTabla(); resumen.textContent = textoResumen(); }
  const textoResumen = () => `${fmtNum(datos.estudiantes.length)} estudiantes · ${fmtNum(datos.tutores.length)} tutores · ${fmtNum(datos.tutores.filter((t) => t.perfil_id).length)} con acceso`;

  /* --- accesos de tutores --- */
  function crearAcceso(t) {
    const usuario = h('input', { id: 'ac-usuario', class: 'campo', value: sugerirUsuario(t.nombres, t.apellidos), autocapitalize: 'none', spellcheck: 'false' });
    abrirModal({
      titulo: 'Crear acceso para el tutor', ancho: '30rem',
      contenido: [h('p', {}, `${t.nombres} ${t.apellidos ?? ''}`.trim(), h('span', { class: 'muted' }, ` · ${t.telefono_whatsapp}`)),
        h('div', { class: 'grupo' }, h('label', { class: 'etiqueta', for: 'ac-usuario' }, 'Nombre de usuario'), usuario,
          h('p', { class: 'ayuda muted' }, '4 a 32 caracteres: letras minúsculas, números, punto, guion o guion bajo.')),
        h('p', { class: 'muted' }, 'El sistema generará una contraseña temporal; el tutor deberá cambiarla en su primer ingreso.')],
      acciones: [{ texto: 'Cancelar', secundario: true }, { texto: 'Crear acceso', cierra: false, onclick: async ({ cerrar }) => {
        try {
          const r = await gestionarUsuario(sb, { accion: 'crear', rol: 'tutor', tutor_id: t.id, username: usuario.value, nombres: t.nombres, apellidos: t.apellidos ?? '', telefono: t.telefono_whatsapp });
          cerrar(); mostrarCredenciales({ usuario: r.username, clave: r.password_temporal, nombre: t.nombres }); await recargar();
        } catch (e) { avisar(e.message, 'error'); return false; }
      } }],
    });
  }
  async function restablecer(t) {
    abrirModal({
      titulo: '¿Restablecer la contraseña?', ancho: '28rem',
      contenido: h('p', {}, `Se generará una nueva contraseña temporal para ${t.nombres} ${t.apellidos ?? ''}. La contraseña anterior dejará de funcionar.`),
      acciones: [{ texto: 'Cancelar', secundario: true }, { texto: 'Sí, restablecer', cierra: false, onclick: async ({ cerrar }) => {
        try {
          const r = await gestionarUsuario(sb, { accion: 'restablecer', perfil_id: t.perfil_id });
          cerrar(); mostrarCredenciales({ usuario: r.username, clave: r.password_temporal, nombre: t.nombres, restablecido: true });
        } catch (e) { avisar(e.message, 'error'); return false; }
      } }],
    });
  }

  /* --- alta individual --- */
  function nuevoEstudiante() {
    const niveles = ['Inicial', 'Primaria', 'Secundaria'];
    const F = {};
    const c = (id, etiqueta, o = {}) => { const g = campo({ id: `ne-${id}`, etiqueta, ...o }); F[id] = g.querySelector('input,select,textarea'); return g; };
    const cursosOpc = datos.cursos.map((x) => ({ valor: x.id, texto: x.nombre }));
    const cuerpo = h('form', { class: 'formulario formulario--2', novalidate: true, onsubmit: (e) => e.preventDefault() },
      h('h3', { class: 'ancho' }, 'Estudiante'),
      c('rude', 'Código RUDE', { requerido: true }), c('nombres', 'Nombres', { requerido: true }),
      c('ap', 'Apellido paterno'), c('am', 'Apellido materno'),
      c('genero', 'Género', { opciones: [{ valor: '', texto: '—' }, { valor: 'F', texto: 'Femenino' }, { valor: 'M', texto: 'Masculino' }] }),
      c('nac', 'Fecha de nacimiento', { tipo: 'date' }),
      c('curso', 'Curso', { requerido: true, opciones: cursosOpc }),
      c('condicion', 'Condición', { requerido: true, opciones: [{ valor: 'nuevo', texto: 'Nuevo (reportes mensuales el primer periodo)' }, { valor: 'antiguo', texto: 'Antiguo (un reporte por periodo)' }] }),
      c('plat', 'Plataforma educativa (si está suscrito)', { ayuda: 'Déjelo vacío si no usa plataforma.' }),
      h('h3', { class: 'ancho' }, 'Tutor principal'),
      c('t1n', 'Nombres', { requerido: true }), c('t1a', 'Apellidos'), c('t1t', 'WhatsApp (8 dígitos)', { requerido: true, tipo: 'tel', atributos: { inputmode: 'numeric' } }),
      c('t1p', 'Parentesco', { opciones: ['Madre', 'Padre', 'Tutor legal', 'Otro'].map((x) => ({ valor: x, texto: x })) }),
      h('h3', { class: 'ancho' }, 'Segundo tutor (opcional)'),
      c('t2n', 'Nombres'), c('t2a', 'Apellidos'), c('t2t', 'WhatsApp', { tipo: 'tel', atributos: { inputmode: 'numeric' } }),
      c('t2p', 'Parentesco', { opciones: ['Madre', 'Padre', 'Tutor legal', 'Otro'].map((x) => ({ valor: x, texto: x })) }),
      h('p', { id: 'ne-error', class: 'mensaje ancho', role: 'alert', hidden: true }));
    abrirModal({
      titulo: 'Nuevo estudiante', ancho: '46rem', contenido: cuerpo,
      acciones: [{ texto: 'Cancelar', secundario: true }, { texto: 'Guardar', cierra: false, onclick: async ({ cerrar }) => {
        const error = cuerpo.querySelector('#ne-error'); error.hidden = true;
        const curso = datos.cursoDe(F.curso.value); const nivel = datos.niveles.find((n) => n.id === curso?.nivel_id);
        const fila = { codigo_rude: F.rude.value, nombres: F.nombres.value, apellido_paterno: F.ap.value, apellido_materno: F.am.value, genero: F.genero.value, fecha_nacimiento: F.nac.value,
          nivel: nivel?.nombre, anio_escolaridad: curso?.anio_escolaridad, paralelo: curso?.paralelo, condicion: F.condicion.value,
          suscrito_plataforma: F.plat.value.trim() ? 'SI' : 'NO', plataforma: F.plat.value, tutor_personal: 'NO',
          tutor1_nombres: F.t1n.value, tutor1_apellidos: F.t1a.value, tutor1_telefono: F.t1t.value, tutor1_parentesco: F.t1p.value,
          tutor2_nombres: F.t2n.value, tutor2_apellidos: F.t2a.value, tutor2_telefono: F.t2t.value, tutor2_parentesco: F.t2p.value };
        if (!F.t2n.value.trim() && !F.t2a.value.trim() && !F.t2t.value.trim()) fila.tutor2_parentesco = '';   // segundo tutor omitido
        const v = validarFila(fila, { cursos: datos.cursos, niveles: datos.niveles });
        if (!v.ok) { error.textContent = v.errores.join(' '); error.hidden = false; return false; }
        const r = await ejecutarImportacion(sb, colegioId, [{ est: v.est, tutores: v.tutores, avisos: [] }]);
        if (r.errores.length) { error.textContent = r.errores.join(' '); error.hidden = false; return false; }
        if (r.estudiantes_existentes) { error.textContent = 'Ya existe un estudiante con ese código RUDE en este colegio.'; error.hidden = false; return false; }
        avisar('Estudiante registrado'); cerrar(); await recargar();
      } }],
    });
  }

  /* --- importación desde Excel --- */
  function importar() {
    const salida = h('div', { class: 'stack', 'aria-live': 'polite' });
    let plan = null; let btnImp = null;
    const estadoBoton = (dis, txt) => { if (btnImp) { btnImp.disabled = dis; if (txt) btnImp.textContent = txt; } };
    const entrada = h('input', { type: 'file', accept: '.xlsx', id: 'imp-archivo', onchange: async () => {
      const archivo = entrada.files[0]; if (!archivo) return;
      limpiar(salida).append(cargando('Leyendo el archivo…')); estadoBoton(true); plan = null;
      try {
        if (archivo.size > 5 * 1024 * 1024) throw new Error('El archivo es demasiado grande (máximo 5 MB).');
        const { hojas } = await leerXlsx(new Uint8Array(await archivo.arrayBuffer()));
        const hoja = hojas.find((x) => /estudiante/i.test(x.nombre)) ?? hojas[0];
        const { filas } = leerFilas(hoja.filas);
        if (!filas.length) throw new Error('No se encontraron filas de estudiantes. Use la plantilla oficial y no borre la fila de encabezados.');
        if (filas.length > 2000) throw new Error('El archivo tiene más de 2000 filas. Divídalo en varios archivos.');
        plan = prepararPlan(filas, { cursos: datos.cursos, niveles: datos.niveles });
        limpiar(salida).append(
          h('div', { class: `banner ${plan.errores.length ? 'banner--alerta' : 'banner--ok'}` },
            h('strong', {}, `${plan.validas.length} fila(s) listas para importar · ${plan.errores.length} con errores`),
            plan.errores.length ? 'Corrija el Excel y vuelva a cargarlo, o importe solo las filas correctas.' : (plan.advertencias ? `${plan.advertencias} fila(s) con avisos: revíselas.` : 'Todo en orden.')),
          plan.errores.length ? tabla([{ t: 'Fila', k: (x) => x.linea }, { t: 'RUDE', k: (x) => x.rude || '—' }, { t: 'Problemas', k: (x) => h('ul', { style: 'margin:0;padding-left:1.1rem;text-align:left' }, x.mensajes.map((m) => h('li', {}, m))) }], plan.errores) : null);
        estadoBoton(plan.validas.length === 0, `Importar ${plan.validas.length} estudiante(s)`);
      } catch (e) { limpiar(salida).append(cajaError(e.message)); }
    } });
    abrirModal({
      titulo: 'Importar estudiantes y tutores desde Excel', ancho: '52rem',
      contenido: [
        h('p', {}, 'Descargue la plantilla, complétela (una fila por estudiante, hasta 3 tutores) y súbala aquí. Los estudiantes con RUDE ya registrado se omiten; los tutores se reconocen por su número de WhatsApp.'),
        h('a', { class: 'btn btn--secundario', href: './plantillas/Plantilla_Estudiantes_Tutores.xlsx', download: '' }, 'Descargar plantilla'),
        h('label', { class: 'zona-archivo', for: 'imp-archivo' }, h('strong', {}, 'Elegir archivo Excel (.xlsx)'), h('div', { class: 'muted' }, 'o arrástrelo aquí'), entrada),
        salida],
      acciones: [{ texto: 'Cerrar', secundario: true }, { id: 'btn-importar', texto: 'Importar', cierra: false, onclick: async ({ cerrar }) => {
        if (!plan?.validas.length) return false;
        limpiar(salida).append(cargando('Importando…'));
        const r = await ejecutarImportacion(sb, colegioId, plan.validas, (p) => { salida.firstChild.lastChild.textContent = `Importando ${p.etapa.toLowerCase()}… ${p.hecho}/${p.total}`; });
        if (r.errores.length) { limpiar(salida).append(cajaError(`Se detuvo: ${r.errores.join(' ')}`)); await recargar(); return false; }
        cerrar(); await recargar();
        avisar(`Importación terminada: ${r.estudiantes_creados} estudiantes nuevos, ${r.estudiantes_existentes} ya existían, ${r.tutores_creados} tutores nuevos.`);
      } }],
    });
    btnImp = document.getElementById('btn-importar'); btnImp.disabled = true;
  }

  const resumen = h('p', { class: 'muted' }, textoResumen());
  const buscador = h('input', { class: 'campo', type: 'search', placeholder: 'Buscar por nombre, RUDE o teléfono', 'aria-label': 'Buscar estudiante', oninput: debounce((e) => { filtro = e.target.value; dibujarTabla(); }, 150) });
  raiz.append(
    h('div', { class: 'cabecera-pagina' }, h('div', {}, h('h1', {}, 'Estudiantes y tutores'), resumen), ctx.selectorColegio()),
    h('div', { class: 'acciones' },
      h('button', { type: 'button', class: 'btn', onclick: importar }, 'Importar desde Excel'),
      h('button', { type: 'button', class: 'btn btn--secundario', onclick: nuevoEstudiante }, 'Nuevo estudiante')),
    buscador, zonaTabla);
  dibujarTabla();
}

async function cargar(sb, colegioId) {
  const [e, c, n, l, t] = await Promise.all([
    sb.from('estudiantes').select('*').eq('colegio_id', colegioId).eq('estado', 'activo').order('apellido_paterno'),
    sb.from('cursos').select('*').eq('colegio_id', colegioId).order('orden'),
    sb.from('niveles').select('*').eq('colegio_id', colegioId).order('orden'),
    sb.from('estudiante_tutor').select('*').eq('colegio_id', colegioId),
    sb.from('tutores').select('*').eq('colegio_id', colegioId).order('nombres'),
  ]);
  const fallo = [e, c, n, l, t].find((r) => r.error); if (fallo) throw new Error(fallo.error.message);
  const porId = new Map(t.data.map((x) => [x.id, x]));
  return {
    estudiantes: e.data, cursos: c.data, niveles: n.data, tutores: t.data,
    cursoDe: (id) => c.data.find((x) => x.id === id),
    tutoresDe: (eid) => l.data.filter((v) => v.estudiante_id === eid).sort((a, b) => Number(b.es_principal) - Number(a.es_principal)).map((v) => porId.get(v.tutor_id)).filter(Boolean),
  };
}
