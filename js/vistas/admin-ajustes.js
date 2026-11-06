// Ajustes (solo Administrador de colegio): (1) Drive del colegio (receptor en la cuenta del administrador) y (2) WhatsApp del colegio.
// Ningún token vuelve al navegador: el de WhatsApp se escribe una vez y queda en el servidor.
import { h, campo, avisar, cajaError, fmtFechaHora } from '../ui.js';
import { textoError } from '../api.js';
import { RECEPTOR_CODIGO } from '../receptor-codigo.js';

export default async function vista(ctx, raiz) {
  const { sb, colegioId } = ctx;
  const { data: cfg, error } = await sb.rpc('leer_integracion', { p_colegio: colegioId });
  if (error) { raiz.append(cajaError(await textoError(error))); return; }
  const prov = campo({ id: 'a-prov', etiqueta: 'Proveedor de WhatsApp', valor: cfg.whatsapp_proveedor ?? '', opciones: [
    { valor: '', texto: 'Sin configurar' }, { valor: 'evolution', texto: 'Evolution API' }, { valor: 'zenziva', texto: 'Zenziva' }, { valor: 'itzapi', texto: 'ItzAPI' }, { valor: 'otro', texto: 'Otro (webhook genérico)' }] });
  const url = campo({ id: 'a-url', etiqueta: 'URL de la API', valor: cfg.whatsapp_api_url ?? '', tipo: 'url', atributos: { placeholder: 'https://api.midominio.com' } });
  const inst = campo({ id: 'a-inst', etiqueta: 'Instancia / usuario', valor: cfg.whatsapp_instance ?? '' });
  const tok = campo({ id: 'a-tok', etiqueta: 'Token / clave de la API', tipo: 'password', ayuda: cfg.tiene_token ? 'Ya hay un token guardado. Déjelo vacío para conservarlo.' : 'Aún no hay token guardado.', atributos: { autocomplete: 'off' } });
  const act = h('label', { class: 'casilla' }, h('input', { type: 'checkbox', id: 'a-act', checked: cfg.whatsapp_activo }), 'Enviar avisos automáticos por WhatsApp');
  const msg = h('p', { class: 'mensaje', role: 'alert', hidden: true });
  const val = (g) => g.querySelector('input,select').value;

  const form = h('form', { class: 'formulario', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); msg.hidden = true;
    const { error: er } = await sb.rpc('guardar_integracion', { p_colegio: colegioId, p_proveedor: val(prov) || null, p_api_url: val(url) || null, p_instance: val(inst) || null,
      p_token: val(tok), p_activo: document.getElementById('a-act').checked });
    if (er) { msg.textContent = await textoError(er); msg.hidden = false; return; }
    avisar('Ajustes guardados'); ctx.recargar();
  } }, prov, url, inst, tok, act, msg, h('div', {}, h('button', { class: 'btn', type: 'submit' }, 'Guardar ajustes')));

  raiz.append(
    h('div', { class: 'cabecera-pagina' }, h('div', {}, h('h1', {}, 'Ajustes del colegio'), h('p', { class: 'muted' }, `${ctx.colegio?.nombre ?? ''} · cada colegio usa su propio Drive y sus propias credenciales.`))),
    await seccionDrive(ctx),
    h('section', { class: 'tarjeta', style: 'max-width:42rem' }, h('h2', { style: 'margin-bottom:.75rem' }, 'WhatsApp del colegio'), form));
}

/** Drive del colegio: el administrador instala un «receptor» en SU cuenta de Google (sin Google Cloud) y registra aquí su URL.
 *  Así cada archivo lo crea su cuenta y consume SU espacio; el sistema central solo guarda estadísticas. */
async function seccionDrive(ctx) {
  const { sb, colegioId } = ctx;
  const caja = h('section', { class: 'tarjeta panel-drive', style: 'max-width:42rem', 'aria-labelledby': 'h-drive' });
  const copiar = async (texto, ok) => { try { await navigator.clipboard.writeText(texto); avisar(ok); } catch { avisar('No se pudo copiar; seleccione el texto y cópielo a mano', 'error'); } };
  async function pintar() {
    const { data, error } = await sb.drive.estado(colegioId);
    if (error) { caja.replaceChildren(cajaError(error.message)); return; }
    const msg = h('p', { class: 'mensaje', role: 'alert', hidden: true });
    const entrada = campo({ id: 'd-url', etiqueta: 'URL de su receptor (termina en /exec)', tipo: 'url', atributos: { placeholder: 'https://script.google.com/macros/s/…/exec', autocomplete: 'off', spellcheck: 'false' } });
    const zonaCodigo = h('div', { class: 'stack', style: '--stack:.5rem' });

    const generar = async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      if (data.configurado && !confirm('Generar un código nuevo desactiva el receptor actual hasta que usted pegue el código nuevo en su script. ¿Continuar?')) { btn.disabled = false; return; }
      const r = await sb.drive.preparar(colegioId); btn.disabled = false;
      if (r.error) { msg.textContent = r.error.message; msg.hidden = false; return; }
      const codigo = RECEPTOR_CODIGO.replace("var CLAVE = '__CLAVE__';", `var CLAVE = '${r.data.clave}';`);
      zonaCodigo.replaceChildren(
        h('textarea', { readonly: true, rows: 6, class: 'codigo-receptor', 'aria-label': 'Código del receptor', onfocus: (ev) => ev.target.select() }, codigo),
        h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn', onclick: () => copiar(codigo, 'Código copiado') }, 'Copiar código')),
        h('p', { class: 'muted' }, 'Este código contiene la clave de su colegio: no lo comparta. Si lo pierde, genere uno nuevo.'));
    };
    const registrar = async (e) => {
      e.preventDefault(); msg.hidden = true; const btn = e.currentTarget.querySelector('button[type=submit]'); btn.disabled = true;
      const r = await sb.drive.registrar(colegioId, entrada.querySelector('input').value);
      btn.disabled = false;
      if (r.error) { msg.textContent = r.error.message; msg.hidden = false; return; }
      avisar(`Drive conectado: ${r.data.nombre_carpeta}`); ctx.recargar();
    };
    const pasos = h('ol', { class: 'pasos-drive' },
      h('li', {}, h('strong', {}, 'Genere su código'), ' y cópielo: ', h('button', { type: 'button', class: 'btn btn--secundario btn--compacto', onclick: generar }, data.configurado ? 'Generar código nuevo' : 'Generar mi código'), zonaCodigo),
      h('li', {}, 'Entre a ', h('a', { href: 'https://script.google.com', target: '_blank', rel: 'noopener' }, 'script.google.com'), ' con la cuenta de Google donde quiere guardar las evidencias → ', h('strong', {}, 'Nuevo proyecto'), ' → borre lo que haya y pegue el código → Guardar.'),
      h('li', {}, h('strong', {}, 'Implementar → Nueva implementación → Aplicación web'), ': «Ejecutar como: ', h('strong', {}, 'Yo'), '» y «Quién tiene acceso: ', h('strong', {}, 'Cualquier persona'), '». Autorice el permiso de Drive y copie la URL que termina en /exec.'),
      h('li', {}, 'Pegue esa URL aquí y pulse «Verificar y guardar».'));
    const formUrl = h('form', { class: 'formulario', novalidate: true, onsubmit: registrar }, entrada, h('div', {}, h('button', { class: 'btn', type: 'submit' }, 'Verificar y guardar')));

    caja.replaceChildren(
      h('h2', { id: 'h-drive' }, 'Google Drive del colegio (evidencias)'),
      h('p', { class: 'muted' }, 'Las evidencias se guardan en SU Drive y usan SU espacio. El sistema central no guarda archivos: solo cifras para sus estadísticas.'),
      data.configurado
        ? h('div', { class: 'stack', style: '--stack:.75rem' },
            h('p', { class: data.accesible ? 'banner banner--ok' : 'banner banner--alerta' },
              data.accesible ? h('strong', {}, 'Drive conectado ✓') : h('strong', {}, 'El receptor no responde'),
              data.accesible ? ` · carpeta «${data.nombre_carpeta}» en la cuenta ${data.cuenta ?? ''}${data.verificado_at ? ` · verificado el ${fmtFechaHora(data.verificado_at)}` : ''}` : ` ${data.motivo ?? 'Revise que siga publicado.'}`),
            h('p', { class: 'ruta-carpetas' }, 'JeaDas.Insights - Evidencias / Gestión_AAAA / Nivel - Curso / 00012_Apellido_Nombre / 00012_1T_MAT_001.pdf'),
            h('details', {}, h('summary', {}, 'Cambiar de cuenta o renovar el receptor'), pasos, formUrl),
            h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn btn--secundario', onclick: async () => {
              if (!confirm('¿Desconectar el Drive? Las familias no podrán subir evidencias hasta conectar otro. Los archivos ya guardados no se borran.')) return;
              const r = await sb.drive.quitar(colegioId); if (r.error) return avisar(r.error.message, 'error'); avisar('Drive desconectado'); ctx.recargar(); } }, 'Desconectar')))
        : h('div', { class: 'stack', style: '--stack:.75rem' },
            h('p', { class: 'banner banner--alerta' }, h('strong', {}, 'Este colegio aún no tiene Drive conectado.'), ' Mientras tanto, las familias no podrán subir evidencias.'),
            pasos, formUrl),
      msg);
  }
  await pintar();
  return caja;
}
