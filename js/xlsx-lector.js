// xlsx-lector.js · Lector mínimo de archivos .xlsx (solo lectura), SIN dependencias externas.
// Un .xlsx es un ZIP con XML. Se usa DecompressionStream (nativo en navegadores modernos y en Node 18+).
// Devuelve cada hoja como una matriz de filas. Las fechas (según el formato de la celda) se devuelven como "AAAA-MM-DD".

const utf8 = (bytes) => new TextDecoder('utf-8').decode(bytes);

async function descomprimir(datos, metodo) {
  if (metodo === 0) return datos;
  if (metodo !== 8) throw new Error('El archivo usa una compresión no soportada.');
  const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

function abrirZip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let i = buf.length - 22;
  const limite = Math.max(0, buf.length - 65557);
  for (; i >= limite; i--) if (dv.getUint32(i, true) === 0x06054b50) break;
  if (i < limite) throw new Error('El archivo no es un libro de Excel (.xlsx) válido.');
  const total = dv.getUint16(i + 10, true);
  let p = dv.getUint32(i + 16, true);
  const entradas = new Map();
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('El archivo .xlsx está dañado.');
    const metodo = dv.getUint16(p + 10, true), tam = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    entradas.set(utf8(buf.subarray(p + 46, p + 46 + nl)), { metodo, tam, off });
    p += 46 + nl + el + cl;
  }
  return {
    tiene: (n) => entradas.has(n),
    async texto(nombre) {
      const e = entradas.get(nombre); if (!e) return null;
      const nl = dv.getUint16(e.off + 26, true), el = dv.getUint16(e.off + 28, true);
      const ini = e.off + 30 + nl + el;
      return utf8(await descomprimir(buf.subarray(ini, ini + e.tam), e.metodo));
    },
  };
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodificar = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTIDADES[e.toLowerCase()]);
const atributos = (tag) => { const o = {}; for (const m of tag.matchAll(/([\w:.-]+)="([^"]*)"/g)) o[m[1]] = decodificar(m[2]); return o; };
const textos = (xml) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodificar(m[1])).join('');

function columnaAIndice(ref) {
  let n = 0; for (const ch of ref.replace(/[^A-Z]/gi, '').toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1;
}
const serialAFecha = (s) => new Date(Date.UTC(1899, 11, 30) + Math.floor(s) * 86400000).toISOString().slice(0, 10);

function estilosDeFecha(xml) {
  const esFechaFmt = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
  for (const m of (xml?.match(/<numFmt\b[^>]*>/g) ?? [])) {
    const a = atributos(m); const f = (a.formatCode ?? '').replace(/\[[^\]]*\]|"[^"]*"/g, '');
    if (/[dmy]/i.test(f) && !/[#0]/.test(f.replace(/[dmyhs.\-/: ]/gi, ''))) esFechaFmt.add(Number(a.numFmtId));
  }
  const bloque = xml?.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/)?.[0] ?? '';
  return [...bloque.matchAll(/<xf\b[^>]*>/g)].map((m) => esFechaFmt.has(Number(atributos(m[0]).numFmtId)));
}

/** @param {ArrayBuffer|Uint8Array} datos  @returns {Promise<{hojas:{nombre:string, filas:any[][]}[]}>} */
export async function leerXlsx(datos) {
  const zip = abrirZip(datos instanceof Uint8Array ? datos : new Uint8Array(datos));
  const libro = await zip.texto('xl/workbook.xml');
  if (!libro) throw new Error('El archivo no contiene un libro de Excel.');
  const rels = Object.fromEntries([...(await zip.texto('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\b[^>]*>/g)].map((m) => { const a = atributos(m[0]); return [a.Id, a.Target]; }));
  const compartidas = [...(await zip.texto('xl/sharedStrings.xml') ?? '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textos(m[1]));
  const esFecha = estilosDeFecha(await zip.texto('xl/styles.xml'));
  const hojas = [];
  for (const m of libro.matchAll(/<sheet\b[^>]*>/g)) {
    const a = atributos(m[0]); let destino = rels[a['r:id']]; if (!destino) continue;
    destino = destino.startsWith('/') ? destino.slice(1) : `xl/${destino}`;
    const xml = await zip.texto(destino); if (!xml) continue;
    const filas = [];
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const at = atributos(c[1]); if (!at.r || c[2] === undefined) continue;
      const fila = Number(at.r.replace(/\D/g, '')) - 1, col = columnaAIndice(at.r);
      if (fila > 50000 || col > 200) continue;
      const cuerpo = c[2]; const v = cuerpo.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let valor = null;
      if (at.t === 's') valor = compartidas[Number(v)] ?? null;
      else if (at.t === 'inlineStr') valor = textos(cuerpo);
      else if (at.t === 'str') valor = v === undefined ? null : decodificar(v);
      else if (at.t === 'b') valor = v === '1';
      else if (at.t === 'e' || v === undefined || v === '') valor = null;
      else { const n = Number(v); valor = esFecha[Number(at.s)] && Number.isFinite(n) ? serialAFecha(n) : n; }
      (filas[fila] ??= [])[col] = valor;
    }
    hojas.push({ nombre: a.name, filas: Array.from(filas, (f) => f ?? []) });
  }
  return { hojas };
}
