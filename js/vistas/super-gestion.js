// Panel del Superadministrador: SOLO infraestructura. Crea, edita y suspende colegios (inquilinos) y genera el usuario inicial
// de sus Administradores de Colegio. No ve alumnos, notas ni evidencias: eso lo gestiona cada colegio.
import { h, tabla, campo, avisar, abrirModal, cajaError } from '../ui.js';
import { textoError } from '../api.js';
import { gestionarUsuario, mostrarCredenciales, sugerirUsuario } from '../credenciales.js';

export default async function vista(ctx, raiz) {
  const { sb } = ctx;
  const [reg, inq, adm, uc] = await Promise.all([
    sb.from('regiones').select('*').order('id'),
    sb.rpc('resumen_inquilinos'),
    sb.from('perfiles').select('id, username, nombres, apellidos, activo, debe_cambiar_password').eq('rol', 'admin_colegio').order('nombres'),
    sb.from('usuario_colegios').select('usuario_id, colegio_id'),
  ]);
  const fallo = [reg, inq, adm, uc].find((x) => x.error); if (fallo) { raiz.append(cajaError(await textoError(fallo.error))); return; }
  const colegios = inq.data; const nombreRegion = new Map(reg.data.map((x) => [x.id, x.nombre]));
  const colegiosDe = (id) => uc.data.filter((u) => u.usuario_id === id).map((u) => u.colegio_id);
  const val = (g) => g.querySelector('input,select').value;
  const nombreAdmin = (a) => `${a.nombres} ${a.apellidos ?? ''}`.trim();
  const sugerirEn = (f, a, b) => {
    const u = f.user.querySelector('input'); u.addEventListener('input', () => { u.dataset.tocado = '1'; });
    [f[a], f[b]].forEach((c) => c.addEventListener('input', () => { if (!u.dataset.tocado) u.value = sugerirUsuario(val(f[a]), val(f[b])); }));
  };

  /** Crea el colegio y su administrador (usuario y clave temporal automáticos) en un solo paso. */
  function nuevoColegio() {
    const f = { region: campo({ id: 'n-reg', etiqueta: 'Región', requerido: true, opciones: reg.data.map((x) => ({ valor: x.id, texto: x.nombre })) }),
      nombre: campo({ id: 'n-nom', etiqueta: 'Nombre del colegio', requerido: true }), sie: campo({ id: 'n-sie', etiqueta: 'Código SIE (opcional)' }), ciudad: campo({ id: 'n-ciu', etiqueta: 'Ciudad' }),
      anom: campo({ id: 'n-anom', etiqueta: 'Nombres del administrador', requerido: true }), aape: campo({ id: 'n-aape', etiqueta: 'Apellidos del administrador', requerido: true }),
      user: campo({ id: 'n-user', etiqueta: 'Usuario (se sugiere automáticamente)', requerido: true, atributos: { autocapitalize: 'none', spellcheck: 'false' } }) };
    sugerirEn(f, 'anom', 'aape');
    const error = h('p', { class: 'mensaje', role: 'alert', hidden: true });
    abrirModal({ titulo: 'Nuevo colegio con su administrador', ancho: '42rem',
      contenido: [h('div', { class: 'formulario formulario--2' }, ...Object.values(f)),
        h('p', { class: 'muted' }, 'El sistema genera una clave temporal y se la muestra una sola vez. El administrador deberá cambiarla en su primer ingreso; después podrá crear operadores y tutores, y registrar la carpeta de Drive de su colegio.'), error],
      acciones: [{ texto: 'Cancelar', secundario: true }, { texto: 'Crear colegio y acceso', cierra: false, onclick: async ({ cerrar }) => {
        const { data: colegioId, error: e1 } = await sb.rpc('crear_colegio', { p_region: Number(val(f.region)), p_nombre: val(f.nombre), p_codigo_sie: val(f.sie), p_ciudad: val(f.ciudad), p_direccion: '', p_director: '' });
        if (e1) { error.textContent = await textoError(e1); error.hidden = false; return false; }
        try {
          const r = await gestionarUsuario(sb, { accion: 'crear', rol: 'admin_colegio', username: val(f.user), nombres: val(f.anom), apellidos: val(f.aape), colegios: [colegioId] });
          cerrar(); mostrarCredenciales({ usuario: r.username, clave: r.password_temporal, nombre: val(f.anom) }); ctx.recargar();
        } catch (e) { error.textContent = `El colegio se creó, pero no el acceso: ${e.message}. Cree el administrador con "Nuevo administrador".`; error.hidden = false; return false; }
      } }] });
  }

  /** Administrador adicional para uno o más colegios ya creados. */
  function nuevoAdmin() {
    const f = { nombres: campo({ id: 'u-nom', etiqueta: 'Nombres', requerido: true }), apellidos: campo({ id: 'u-ape', etiqueta: 'Apellidos', requerido: true }),
      user: campo({ id: 'u-user', etiqueta: 'Nombre de usuario', requerido: true, atributos: { autocapitalize: 'none', spellcheck: 'false' } }) };
    sugerirEn(f, 'nombres', 'apellidos');
    const lista = h('fieldset', { style: 'border:0;padding:0;margin:0' }, h('legend', { class: 'etiqueta' }, 'Colegios que administrará (podrá cambiarlos después)'),
      colegios.map((c) => h('label', { class: 'casilla' }, h('input', { type: 'checkbox', value: c.colegio_id }), c.nombre)));
    const error = h('p', { class: 'mensaje', role: 'alert', hidden: true });
    abrirModal({ titulo: 'Nuevo administrador de colegio', ancho: '40rem', contenido: [h('div', { class: 'formulario formulario--2' }, ...Object.values(f)), lista, error],
      acciones: [{ texto: 'Cancelar', secundario: true }, { texto: 'Crear acceso', cierra: false, onclick: async ({ cerrar }) => {
        try {
          const r = await gestionarUsuario(sb, { accion: 'crear', rol: 'admin_colegio', username: val(f.user), nombres: val(f.nombres), apellidos: val(f.apellidos), colegios: [...lista.querySelectorAll('input:checked')].map((i) => i.value) });
          cerrar(); mostrarCredenciales({ usuario: r.username, clave: r.password_temporal, nombre: val(f.nombres) }); ctx.recargar();
        } catch (e) { error.textContent = e.message; error.hidden = false; return false; }
      } }] });
  }

  function asignarColegios(a) {
    const tiene = new Set(colegiosDe(a.id));
    const lista = h('fieldset', { style: 'border:0;padding:0;margin:0' }, h('legend', { class: 'etiqueta' }, `Colegios de ${nombreAdmin(a)}`),
      colegios.map((c) => h('label', { class: 'casilla' }, h('input', { type: 'checkbox', value: c.colegio_id, checked: tiene.has(c.colegio_id) }), c.nombre)));
    const error = h('p', { class: 'mensaje', role: 'alert', hidden: true });
    abrirModal({ titulo: 'Asignar colegios', ancho: '36rem', contenido: [lista, error],
      acciones: [{ texto: 'Cancelar', secundario: true }, { texto: 'Guardar', cierra: false, onclick: async ({ cerrar }) => {
        try { await gestionarUsuario(sb, { accion: 'asignar', perfil_id: a.id, colegios: [...lista.querySelectorAll('input:checked')].map((i) => i.value) }); avisar('Colegios actualizados'); cerrar(); ctx.recargar(); }
        catch (e) { error.textContent = e.message; error.hidden = false; return false; }
      } }] });
  }

  function estadoColegio(c) {
    const susp = c.activo;
    abrirModal({ titulo: susp ? '¿Suspender este colegio?' : '¿Reactivar este colegio?', ancho: '30rem',
      contenido: h('p', {}, susp ? `${c.nombre} quedará suspendido: su administrador, operadores y tutores no podrán ingresar hasta que lo reactive. No se borra ningún dato.` : `${c.nombre} volverá a estar disponible para sus usuarios.`),
      acciones: [{ texto: 'Cancelar', secundario: true }, { texto: susp ? 'Sí, suspender' : 'Sí, reactivar', cierra: false, onclick: async ({ cerrar }) => {
        try { await gestionarUsuario(sb, { accion: 'colegio_estado', colegio_id: c.colegio_id, activo: !c.activo }); avisar(susp ? 'Colegio suspendido' : 'Colegio reactivado'); cerrar(); ctx.recargar(); }
        catch (e) { avisar(e.message, 'error'); return false; }
      } }] });
  }

  async function activar(a) {
    try { await gestionarUsuario(sb, { accion: 'activar', perfil_id: a.id, activo: !a.activo }); avisar(a.activo ? 'Usuario desactivado' : 'Usuario activado'); ctx.recargar(); }
    catch (e) { avisar(e.message, 'error'); }
  }

  function restablecer(a) {
    abrirModal({ titulo: '¿Restablecer la contraseña?', ancho: '28rem', contenido: h('p', {}, `Se generará una contraseña temporal nueva para ${nombreAdmin(a)}.`),
      acciones: [{ texto: 'Cancelar', secundario: true }, { texto: 'Sí, restablecer', cierra: false, onclick: async ({ cerrar }) => {
        try { const r = await gestionarUsuario(sb, { accion: 'restablecer', perfil_id: a.id }); cerrar(); mostrarCredenciales({ usuario: r.username, clave: r.password_temporal, nombre: nombreAdmin(a), restablecido: true }); }
        catch (e) { avisar(e.message, 'error'); return false; }
      } }] });
  }

  const nombresColegios = (a) => colegiosDe(a.id).map((id) => colegios.find((c) => c.colegio_id === id)?.nombre).filter(Boolean);
  raiz.append(
    h('div', { class: 'cabecera-pagina' }, h('div', {}, h('h1', {}, 'Colegios y administradores'), h('p', { class: 'muted' }, 'Infraestructura del sistema: colegios (inquilinos) y sus administradores. Las notas, estudiantes y evidencias las gestiona cada colegio.')),
      h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn btn--secundario', onclick: nuevoAdmin }, 'Nuevo administrador'), h('button', { type: 'button', class: 'btn', onclick: nuevoColegio }, 'Nuevo colegio y administrador'))),
    h('section', { 'aria-labelledby': 'h-cols' }, h('h2', { id: 'h-cols', style: 'margin-bottom:.75rem' }, 'Colegios'),
      tabla([{ t: 'Colegio', k: (x) => h('strong', {}, x.nombre) }, { t: 'Región', k: (x) => nombreRegion.get(x.region_id) ?? '—' }, { t: 'Ciudad', k: (x) => x.ciudad ?? '—' },
        { t: 'Administradores', k: (x) => x.administradores }, { t: 'Operadores', k: (x) => x.operadores },
        { t: 'Drive', k: (x) => (x.drive_configurado ? h('span', { class: 'insignia insignia--ok' }, 'Carpeta registrada') : h('span', { class: 'insignia insignia--alerta' }, 'Sin carpeta')) },
        { t: 'Estado', k: (x) => (x.activo ? h('span', { class: 'insignia insignia--ok' }, 'Activo') : h('span', { class: 'insignia insignia--alerta' }, 'Suspendido')) },
        { t: 'Acciones', oculto: true, k: (x) => h('button', { type: 'button', class: 'btn btn--secundario btn--compacto', onclick: () => estadoColegio(x) }, x.activo ? 'Suspender' : 'Reactivar') }],
      colegios, { vacioTexto: 'Aún no hay colegios. Cree el primero con «Nuevo colegio y administrador».' })),
    h('section', { 'aria-labelledby': 'h-adms' }, h('h2', { id: 'h-adms', style: 'margin-bottom:.75rem' }, 'Administradores de colegio'),
      tabla([{ t: 'Nombre', k: (x) => h('strong', {}, nombreAdmin(x)) }, { t: 'Usuario', k: (x) => x.username }, { t: 'Colegios', k: (x) => nombresColegios(x).join(', ') || '—' },
        { t: 'Estado', k: (x) => (!x.activo ? 'Inactivo' : x.debe_cambiar_password ? 'Pendiente de primer ingreso' : 'Activo') },
        { t: 'Acciones', oculto: true, k: (x) => h('div', { class: 'acciones' },
          h('button', { type: 'button', class: 'btn btn--secundario btn--compacto', onclick: () => asignarColegios(x) }, 'Colegios'),
          h('button', { type: 'button', class: 'btn btn--secundario btn--compacto', onclick: () => restablecer(x) }, 'Restablecer clave'),
          h('button', { type: 'button', class: 'btn btn--secundario btn--compacto', onclick: () => activar(x) }, x.activo ? 'Desactivar' : 'Activar')) }],
      adm.data, { vacioTexto: 'Aún no hay administradores.' })));
}
