// credenciales.js · Alta/restablecimiento de accesos mediante Apps Script (acción "usuario")
// y ventana que muestra la contraseña temporal UNA sola vez (el sistema no la guarda en claro).
import { h, abrirModal, copiar, avisar } from './ui.js';
import { textoError } from './api.js';
import { CONFIG } from './config.js';

export async function gestionarUsuario(sb, cuerpo) {
  const { data, error } = await sb.functions.invoke('gestionar-usuario', { body: cuerpo });
  if (error) throw new Error(await textoError(error));
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Sugiere un usuario libre a partir del nombre: "ana.perez", "ana.perez2"… */
export const sugerirUsuario = (nombres, apellidos) => {
  const limpio = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const n = limpio(nombres)[0] ?? 'usuario'; const a = limpio(apellidos)[0] ?? '';
  return (a ? `${n}.${a}` : n).slice(0, 28);
};

export function mostrarCredenciales({ usuario, clave, nombre, restablecido = false }) {
  const url = new URL('./login.html', location.href).href.replace(/\?.*$/, '');
  const mensaje = `Hola ${nombre}, estos son sus datos para ingresar a ${CONFIG.NOMBRE_APP} - ${CONFIG.SUBTITULO}:\nEnlace: ${url}\nUsuario: ${usuario}\nContraseña temporal: ${clave}\nAl ingresar por primera vez el sistema le pedirá crear su propia contraseña.`;
  const fila = (etiqueta, valor) => h('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
    h('span', { class: 'muted' }, etiqueta), h('code', {}, valor),
    h('button', { type: 'button', class: 'btn btn--secundario btn--compacto', 'aria-label': `Copiar ${etiqueta}`, onclick: async () => avisar((await copiar(valor)) ? `${etiqueta} copiado` : 'No se pudo copiar', 'ok') }, 'Copiar'));
  abrirModal({
    titulo: restablecido ? 'Contraseña restablecida' : 'Acceso creado',
    contenido: [
      h('p', {}, 'Entregue estos datos a la persona. ', h('strong', {}, 'La contraseña temporal solo se muestra ahora'), ' y deberá cambiarla en su primer ingreso.'),
      h('div', { class: 'credencial' }, fila('Usuario', usuario), fila('Contraseña temporal', clave)),
      h('button', { type: 'button', class: 'btn btn--secundario', onclick: async () => avisar((await copiar(mensaje)) ? 'Mensaje copiado: péguelo en WhatsApp' : 'No se pudo copiar', 'ok') }, 'Copiar mensaje listo para WhatsApp'),
    ],
    acciones: [{ texto: 'Listo, ya lo anoté' }],
  });
}
