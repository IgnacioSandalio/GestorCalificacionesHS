// Equipo del colegio (Administrador de colegio): crea Operadores con acceso a uno o más de SUS colegios, restablece claves,
// cambia sus colegios y los activa o desactiva. Los operadores pueden agregar tutores, estudiantes y generar reportes.
import { h, tabla, campo, avisar, abrirModal, cajaError } from '../ui.js';
import { textoError } from '../api.js';
import { gestionarUsuario, mostrarCredenciales, sugerirUsuario } from '../credenciales.js';

export default async function vista(ctx, raiz) {
  const { sb } = ctx; const misColegios = ctx.colegios;
  const [ops, uc] = await Promise.all([
    sb.from('perfiles').select('id, username, nombres, apellidos, activo, debe_cambiar_password, rol').eq('rol', 'operador').order('nombres'),
    sb.from('usuario_colegios').select('usuario_id, colegio_id'),
  ]);
  const fallo = [ops, uc].find((x) => x.error); if (fallo) { raiz.append(cajaError(await textoError(fallo.error))); return; }
  const colegiosDe = (id) => uc.data.filter((u) => u.usuario_id === id).map((u) => u.colegio_id);
  const nombreCol = (id) => misColegios.find((c) => c.id === id)?.nombre;
  const val = (g) => g.querySelector('input,select').value;
  const nombre = (o) => `${o.nombres} ${o.apellidos ?? ''}`.trim();
  const lista = (marcados = new Set(), leyenda = 'Colegios que podrá atender') => h('fieldset', { style: 'border:0;padding:0;margin:0' }, h('legend', { class: 'etiqueta' }, leyenda),
    misColegios.map((c) => h('label', { class: 'casilla' }, h('input', { type: 'checkbox', value: c.id, checked: marcados.has(c.id) }), c.nombre)));

  function nuevo() {
    const f = { nombres: campo({ id: 'o-nom', etiqueta: 'Nombres', requerido: true }), apellidos: campo({ id: 'o-ape', etiqueta: 'Apellidos', requerido: true }),
      user: campo({ id: 'o-user', etiqueta: 'Nombre de usuario', requerido: true, atributos: { autocapitalize: 'none', spellcheck: 'false' } }) };
    const u = f.user.querySelector('input'); u.addEventListener('input', () => { u.dataset.tocado = '1'; });
    [f.nombres, f.apellidos].forEach((c) => c.addEventListener('input', () => { if (!u.dataset.tocado) u.value = sugerirUsuario(val(f.nombres), val(f.apellidos)); }));
    const sel = lista(new Set([ctx.colegioId])); const error = h('p', { class: 'mensaje', role: 'alert', hidden: true });
    abrirModal({ titulo: 'Nuevo operador', ancho: '40rem', contenido: [h('div', { class: 'formulario formulario--2' }, ...Object.values(f)), sel,
      h('p', { class: 'muted' }, 'El operador podrá agregar tutores y estudiantes y generar reportes en los colegios marcados. No cambia ajustes, periodos ni habilitaciones.'), error],
      acciones: [{ texto: 'Cancelar', secundario: true }, { texto: 'Crear acceso', cierra: false, onclick: async ({ cerrar }) => {
        try {
          const r = await gestionarUsuario(sb, { accion: 'crear', rol: 'operador', username: val(f.user), nombres: val(f.nombres), apellidos: val(f.apellidos), colegios: [...sel.querySelectorAll('input:checked')].map((i) => i.value) });
          cerrar(); mostrarCredenciales({ usuario: r.username, clave: r.password_temporal, nombre: val(f.nombres) }); ctx.recargar();
        } catch (e) { error.textContent = e.message; error.hidden = false; return false; }
      } }] });
  }
  function asignar(o) {
    const sel = lista(new Set(colegiosDe(o.id)), `Colegios de ${nombre(o)}`); const error = h('p', { class: 'mensaje', role: 'alert', hidden: true });
    abrirModal({ titulo: 'Colegios del operador', ancho: '36rem', contenido: [sel, error], acciones: [{ texto: 'Cancelar', secundario: true }, { texto: 'Guardar', cierra: false, onclick: async ({ cerrar }) => {
      try { await gestionarUsuario(sb, { accion: 'asignar', perfil_id: o.id, colegios: [...sel.querySelectorAll('input:checked')].map((i) => i.value) }); avisar('Colegios actualizados'); cerrar(); ctx.recargar(); }
      catch (e) { error.textContent = e.message; error.hidden = false; return false; }
    } }] });
  }
  function restablecer(o) {
    abrirModal({ titulo: '¿Restablecer la contraseña?', ancho: '28rem', contenido: h('p', {}, `Se generará una contraseña temporal nueva para ${nombre(o)}.`), acciones: [{ texto: 'Cancelar', secundario: true }, { texto: 'Sí, restablecer', cierra: false, onclick: async ({ cerrar }) => {
      try { const r = await gestionarUsuario(sb, { accion: 'restablecer', perfil_id: o.id }); cerrar(); mostrarCredenciales({ usuario: r.username, clave: r.password_temporal, nombre: nombre(o), restablecido: true }); }
      catch (e) { avisar(e.message, 'error'); return false; }
    } }] });
  }
  async function activar(o) {
    try { await gestionarUsuario(sb, { accion: 'activar', perfil_id: o.id, activo: !o.activo }); avisar(o.activo ? 'Operador desactivado' : 'Operador activado'); ctx.recargar(); } catch (e) { avisar(e.message, 'error'); }
  }

  raiz.append(
    h('div', { class: 'cabecera-pagina' }, h('div', {}, h('h1', {}, 'Operadores'), h('p', { class: 'muted' }, 'Personas que le apoyan: agregan tutores y estudiantes y generan reportes en los colegios que usted les asigne.')),
      h('button', { type: 'button', class: 'btn', onclick: nuevo }, 'Nuevo operador')),
    tabla([{ t: 'Nombre', k: (x) => h('strong', {}, nombre(x)) }, { t: 'Usuario', k: (x) => x.username },
      { t: 'Colegios', k: (x) => colegiosDe(x.id).map(nombreCol).filter(Boolean).join(', ') || '—' },
      { t: 'Estado', k: (x) => (!x.activo ? 'Inactivo' : x.debe_cambiar_password ? 'Pendiente de primer ingreso' : 'Activo') },
      { t: 'Acciones', oculto: true, k: (x) => h('div', { class: 'acciones' },
        h('button', { type: 'button', class: 'btn btn--secundario btn--compacto', onclick: () => asignar(x) }, 'Colegios'),
        h('button', { type: 'button', class: 'btn btn--secundario btn--compacto', onclick: () => restablecer(x) }, 'Restablecer clave'),
        h('button', { type: 'button', class: 'btn btn--secundario btn--compacto', onclick: () => activar(x) }, x.activo ? 'Desactivar' : 'Activar')) }],
    ops.data, { vacioTexto: 'Aún no tiene operadores. Cree el primero con «Nuevo operador».' }));
}
