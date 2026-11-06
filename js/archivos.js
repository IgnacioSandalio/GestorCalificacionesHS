// archivos.js · Preparación de archivos en el navegador (reducción de fotos), subida a Apps Script y visor de evidencias.
// Nada de lo que se maneja aquí contiene claves: los archivos viajan a Apps Script, que los reenvía al Drive del administrador del colegio.
import { h, abrirModal, avisar, fmtFechaHora } from './ui.js';
import { CONFIG } from './config.js';

// Formatos permitidos: PDF, Word e imágenes JPEG/PNG. Todo lo demás (videos, Excel, comprimidos…) se bloquea.
const MIME_POR_EXTENSION = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
export const TIPOS_ARCHIVO = [...new Set(Object.values(MIME_POR_EXTENSION))];
export const ACEPTA = '.pdf,.doc,.docx,.jpg,.jpeg,.png';
export const MAX_BYTES = CONFIG.TAMANO_MAX_RESPALDO;      // 15 MB: límite estricto por archivo
export const OBJETIVO_IMAGEN = 1.5 * 1024 * 1024;         // las fotos se reducen a menos de 1,5 MB antes de enviarse
export const AVISO_WORD = 'Recomendación: Si tu documento contiene imágenes, expórtalo a PDF antes de subirlo para que el proceso sea más rápido';
const LADO_MAX = 1600;      // píxeles del lado mayor al empezar a reducir una foto
const LADO_MIN = 800;       // no se reduce por debajo de esto
const CALIDAD_INICIAL = 0.8, CALIDAD_MIN = 0.5;

export const fmtTamano = (b) => (b >= 1048576 ? `${(b / 1048576).toLocaleString('es-BO', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Tipo MIME real del archivo: el del navegador o, si viene vacío (pasa con .doc), el deducido de la extensión. */
export function mimeDe(archivo) {
  const ext = String(archivo.name ?? '').toLowerCase().split('.').pop();
  const porExt = MIME_POR_EXTENSION[ext];
  return TIPOS_ARCHIVO.includes(archivo.type) ? archivo.type : (!archivo.type || archivo.type === 'application/octet-stream' ? porExt : undefined) ?? null;
}

/** Valida formato y peso ANTES de procesar nada. Lanza Error con un texto amable. Devuelve {mime, esImagen, esWord}. */
export function validarArchivo(archivo) {
  const mime = mimeDe(archivo);
  if (!mime) throw new Error(`"${archivo.name}" no se puede subir: solo se aceptan PDF, Word (.doc, .docx) e imágenes JPG o PNG. No se admiten videos ni otros formatos.`);
  const esImagen = mime.startsWith('image/');
  if (!esImagen && archivo.size > MAX_BYTES) throw new Error(`"${archivo.name}" pesa ${fmtTamano(archivo.size)} y el máximo es ${fmtTamano(MAX_BYTES)}. Reduzca el archivo (por ejemplo, exportando el PDF con menor calidad) e inténtelo otra vez.`);
  if (esImagen && archivo.size > MAX_BYTES) throw new Error(`"${archivo.name}" pesa ${fmtTamano(archivo.size)} y el máximo es ${fmtTamano(MAX_BYTES)}. Elija otra foto o tómela con menor resolución.`);
  return { mime, esImagen, esWord: /word/.test(mime) };
}

function aBase64(blob) {
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] ?? '');
    r.onerror = () => mal(new Error('No se pudo leer el archivo.'));
    r.readAsDataURL(blob);
  });
}

/** Reduce una foto (JPG/PNG) con la API Canvas hasta quedar por debajo de 1,5 MB.
 *  Primero baja el lado mayor a 1600 px con calidad 0,8; si aún pesa más, baja la calidad (hasta 0,5) y luego el tamaño (×0,85, hasta 800 px). */
export async function reducirImagen(archivo) {
  const mime = mimeDe(archivo);
  try {
    const bmp = await createImageBitmap(archivo);
    let lado = Math.min(LADO_MAX, Math.max(bmp.width, bmp.height)), calidad = CALIDAD_INICIAL, blob = null;
    for (let i = 0; i < 12; i++) {
      const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.max(1, Math.round(bmp.width * escala)); lienzo.height = Math.max(1, Math.round(bmp.height * escala));
      const g = lienzo.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, lienzo.width, lienzo.height);   // fondo blanco: los PNG con transparencia pasan a JPEG
      g.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
      blob = await new Promise((ok) => lienzo.toBlob(ok, 'image/jpeg', calidad));
      if (!blob || blob.size < OBJETIVO_IMAGEN) break;
      if (calidad > CALIDAD_MIN + 0.001) calidad = Math.max(CALIDAD_MIN, calidad - 0.1);
      else if (lado > LADO_MIN) lado = Math.max(LADO_MIN, Math.round(lado * 0.85));
      else break;
    }
    bmp.close?.();
    if (blob && blob.size < archivo.size) return { blob, mime: 'image/jpeg', nombre: archivo.name.replace(/\.[^.]+$/, '') + '.jpg' };
  } catch { /* formato no decodificable: se envía tal cual */ }
  return { blob: archivo, mime, nombre: archivo.name };
}

/** Valida y prepara un archivo → {nombre, mime, b64, tamano, peso_original}. Lanza Error con un texto claro. */
export async function prepararArchivo(archivo) {
  const v = validarArchivo(archivo);
  const { blob, mime, nombre } = v.esImagen ? await reducirImagen(archivo) : { blob: archivo, mime: v.mime, nombre: archivo.name };
  if (blob.size > MAX_BYTES) throw new Error(`"${archivo.name}" supera los ${fmtTamano(MAX_BYTES)}.`);
  return { nombre, mime, b64: await aBase64(blob), tamano: blob.size, peso_original: archivo.size };
}

/** Sube varios archivos de uno en uno (el servidor numera 001, 002… sin repetir). Devuelve {subidos, errores:[texto]}.
 *  Carga útil por archivo: {reporte_id, materia_id, nombre, mime, peso_original, b64}. El colegio (tenant) y la persona los fija el servidor
 *  a partir de la sesión y del reporte: así nadie puede suplantarlos desde el navegador. */
export async function subirArchivos(sb, { reporte_id, materia_id = null }, archivos, progreso = () => {}) {
  const res = { subidos: 0, errores: [] };
  let i = 0;
  for (const a of archivos) {
    progreso(++i, archivos.length, a.name);
    try {
      const p = await prepararArchivo(a);
      const { error } = await sb.evidencias.subir({ reporte_id, materia_id, nombre: p.nombre, mime: p.mime, peso_original: p.peso_original, b64: p.b64 });
      if (error) res.errores.push(`${a.name}: ${error.message}`); else res.subidos++;
    } catch (e) { res.errores.push(e.message); }
  }
  return res;
}

/* ------------------------------ Visor ------------------------------ */
export async function abrirVisor(sb, ev) {
  const { data, error } = await sb.evidencias.ver(ev.id);
  if (error) return avisar(error.message, 'error');
  const bytes = Uint8Array.from(atob(data.b64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: data.mime }));
  let cuerpo;
  if (data.mime.startsWith('image/')) cuerpo = h('img', { src: url, alt: data.nombre, class: 'visor__img' });
  else if (data.mime === 'application/pdf') cuerpo = h('iframe', { src: url, title: data.nombre, class: 'visor__pdf' });
  else if (data.mime === 'text/plain') cuerpo = h('pre', { class: 'visor__txt' }, new TextDecoder().decode(bytes));
  else cuerpo = h('p', {}, 'Este tipo de archivo (Word o Excel) no se puede mostrar aquí. Descárguelo para abrirlo.');
  const m = abrirModal({
    titulo: ev.nombre_archivo, ancho: '56rem',
    contenido: [h('div', { class: 'visor' }, cuerpo)],
    acciones: [
      { texto: 'Cerrar', secundario: true, onclick: ({ cerrar }) => { URL.revokeObjectURL(url); cerrar(); return false; } },
      { texto: 'Descargar', cierra: false, onclick: () => { const a = h('a', { href: url, download: ev.nombre_archivo }); document.body.append(a); a.click(); a.remove(); return false; } },
    ],
  });
  m.dlg.addEventListener('close', () => URL.revokeObjectURL(url), { once: true });
}

/** Lista de evidencias con "Ver" y (si se puede) "Quitar". */
export function listaEvidencias(sb, evidencias, { editable = false, alCambiar = () => {} } = {}) {
  if (!evidencias.length) return h('p', { class: 'muted' }, 'Aún no hay evidencias.');
  return h('ul', { class: 'lista-evidencias' }, evidencias.map((ev) => h('li', {},
    h('div', { class: 'lista-evidencias__info' }, h('strong', {}, ev.nombre_archivo), h('span', { class: 'muted' }, ` · ${fmtTamano(ev.tamano_bytes)} · ${fmtFechaHora(ev.created_at)}`)),
    h('div', { class: 'acciones' },
      h('button', { type: 'button', class: 'btn btn--secundario btn--compacto', onclick: () => abrirVisor(sb, ev) }, 'Ver'),
      editable ? h('button', { type: 'button', class: 'btn btn--secundario btn--compacto', onclick: async (e) => {
        if (!confirm(`¿Quitar "${ev.nombre_archivo}"?`)) return;
        e.currentTarget.disabled = true;
        const { error } = await sb.evidencias.borrar(ev.id);
        if (error) { avisar(error.message, 'error'); e.currentTarget.disabled = false; } else { avisar('Evidencia quitada'); alCambiar(); }
      } }, 'Quitar') : null))));
}

/** Selector de archivos + botón "Subir". Valida al elegir (formato y peso), avisa si es Word, y llama a alTerminar() cuando acaba. */
export function cajaSubida(sb, destino, { alTerminar = () => {}, etiqueta = 'Agregar evidencias' } = {}) {
  const entrada = h('input', { type: 'file', multiple: true, accept: ACEPTA, id: `subida-${Math.random().toString(36).slice(2, 8)}` });
  const estado = h('p', { class: 'muted', role: 'status' });
  const error = h('p', { class: 'mensaje', role: 'alert', hidden: true });
  const aviso = h('p', { class: 'mensaje mensaje--info', role: 'status', hidden: true }, AVISO_WORD);
  const problemas = (archivos) => archivos.flatMap((a) => { try { validarArchivo(a); return []; } catch (e) { return [e.message]; } });
  const revisar = () => {
    const archivos = [...entrada.files], malos = problemas(archivos);
    aviso.hidden = !archivos.some((a) => { try { return validarArchivo(a).esWord; } catch { return false; } });
    error.textContent = malos.join(' · '); error.hidden = !malos.length;
    return malos.length === 0;
  };
  entrada.addEventListener('change', revisar);
  const boton = h('button', { type: 'button', class: 'btn btn--compacto', onclick: async () => {
    const archivos = [...entrada.files]; error.hidden = true;
    if (!archivos.length) { error.textContent = 'Elija uno o más archivos primero.'; error.hidden = false; return; }
    if (!revisar()) return;   // formato o peso inválido: se cancela la subida y se explica por qué
    boton.disabled = true;
    const r = await subirArchivos(sb, destino, archivos, (i, n, nombre) => { estado.textContent = `Subiendo ${i} de ${n}: ${nombre}…`; });
    boton.disabled = false; estado.textContent = '';
    if (r.errores.length) { error.textContent = r.errores.join(' · '); error.hidden = false; }
    if (r.subidos) { entrada.value = ''; aviso.hidden = true; avisar(`${r.subidos} archivo(s) guardado(s) en el Drive del administrador`); alTerminar(); }
  } }, 'Subir');
  return h('div', { class: 'caja-subida' }, h('label', { class: 'etiqueta', for: entrada.id }, `${etiqueta} (PDF, Word o fotos JPG/PNG · máx. 15 MB cada uno)`),
    h('div', { class: 'caja-subida__fila' }, entrada, boton), aviso, estado, error);
}
