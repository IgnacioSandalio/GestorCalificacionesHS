// importador.js · Lectura, validación e inserción masiva de estudiantes y tutores desde Excel.
// Compatible con la nomenclatura de los formatos SIE/RUDE y de los centralizadores de muestra:
//  · Nivel: "INICIAL…", "PRIMARIA COMUNITARIA VOCACIONAL", "SECUNDARIA COMUNITARIA PRODUCTIVA"
//  · Año de escolaridad: "4", "4TO", "4TO. DE PRIMARIA"
//  · Columna "APELLIDOS Y NOMBRES" (centralizador) o columnas separadas; "GÉNERO" M/F.
// Las funciones de lectura/validación son puras (se pueden probar sin navegador).
import { normalizarTexto } from './ui.js';

const clave = (s) => normalizarTexto(s).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** Nombre canónico de cada columna y sus alias aceptados. */
export const COLUMNAS = {
  codigo_rude: ['codigo_rude', 'rude', 'cod_rude', 'codigo'],
  apellido_paterno: ['apellido_paterno', 'paterno', 'ap_paterno'],
  apellido_materno: ['apellido_materno', 'materno', 'ap_materno'],
  nombres: ['nombres', 'nombre', 'nombre_s'],
  apellidos_y_nombres: ['apellidos_y_nombres', 'apellidos_nombres'],
  genero: ['genero', 'sexo'],
  fecha_nacimiento: ['fecha_nacimiento', 'fecha_de_nacimiento', 'nacimiento'],
  nivel: ['nivel'],
  anio_escolaridad: ['anio_escolaridad', 'ano_escolaridad', 'ano_de_escolaridad', 'anio_de_escolaridad', 'ano', 'anio', 'grado'],
  curso: ['curso'],
  paralelo: ['paralelo'],
  condicion: ['condicion', 'nuevo_antiguo', 'estudiante'],
  suscrito_plataforma: ['suscrito_plataforma', 'suscrito_a_plataforma', 'plataforma_suscrita'],
  plataforma: ['plataforma', 'nombre_plataforma'],
  tutor_personal: ['tutor_personal', 'tiene_tutor_personal'],
};
for (const n of [1, 2, 3]) {
  COLUMNAS[`tutor${n}_nombres`] = [`tutor${n}_nombres`, `tutor_${n}_nombres`, `tutor${n}_nombre`];
  COLUMNAS[`tutor${n}_apellidos`] = [`tutor${n}_apellidos`, `tutor_${n}_apellidos`];
  COLUMNAS[`tutor${n}_telefono`] = [`tutor${n}_telefono`, `tutor_${n}_telefono`, `tutor${n}_celular`, `tutor${n}_whatsapp`];
  COLUMNAS[`tutor${n}_parentesco`] = [`tutor${n}_parentesco`, `tutor_${n}_parentesco`];
}
const ALIAS = new Map(Object.entries(COLUMNAS).flatMap(([canon, lista]) => lista.map((a) => [a, canon])));

/* ------------------------------ Normalizadores ------------------------------ */
export function normalizarNivel(texto) {
  const t = normalizarTexto(texto);
  if (t.includes('inicial')) return 'Inicial';
  if (t.includes('primaria')) return 'Primaria';
  if (t.includes('secundaria')) return 'Secundaria';
  return null;
}
export function parsearAnio(texto) {
  const m = String(texto ?? '').match(/\d/); if (m) return Number(m[0]);
  const t = normalizarTexto(texto); const palabras = ['primer', 'segundo', 'tercer', 'cuarto', 'quinto', 'sexto'];
  const i = palabras.findIndex((p) => t.includes(p)); return i >= 0 ? i + 1 : null;
}
export function normalizarTelefono(valor) {
  let d = String(valor ?? '').replace(/\D/g, ''); if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) d = `591${d}`;           // celular boliviano sin código de país
  return /^[0-9]{8,15}$/.test(d) ? d : null;
}
export const normalizarSiNo = (v) => { const t = normalizarTexto(v); if (['si', 's', 'x', '1', 'true', 'verdadero'].includes(t)) return true; if (['no', 'n', '0', 'false', 'falso', ''].includes(t)) return false; return null; };
export function normalizarCondicion(v) { const t = normalizarTexto(v); if (t.startsWith('nuev')) return 'nuevo'; if (t.startsWith('antig')) return 'antiguo'; return null; }
export function normalizarGenero(v) { const t = normalizarTexto(v); if (!t) return null; if (['m', 'masculino', 'varon', 'hombre'].includes(t)) return 'M'; if (['f', 'femenino', 'mujer'].includes(t)) return 'F'; return undefined; }
export function normalizarFecha(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return undefined;
}
/** "MAMANI QUISPE JUAN CARLOS" → apellidos = 2 primeras palabras, nombres = resto (se avisa para revisar). */
export function separarApellidosNombres(texto) {
  const p = String(texto ?? '').trim().split(/\s+/).filter(Boolean);
  if (p.length < 3) return { apellido_paterno: p[0] ?? '', apellido_materno: '', nombres: p.slice(1).join(' ') };
  return { apellido_paterno: p[0], apellido_materno: p[1], nombres: p.slice(2).join(' ') };
}
const limpio = (v) => (v === null || v === undefined ? '' : String(v).trim());

/* ------------------------------ Lectura de la hoja ------------------------------ */
/** Busca la fila de encabezados y devuelve objetos con nombres canónicos. `linea` = número de fila en Excel. */
export function leerFilas(matriz) {
  let cab = -1, mapa = null;
  for (let i = 0; i < Math.min(matriz.length, 30); i++) {
    const m = new Map(); (matriz[i] ?? []).forEach((c, j) => { const canon = ALIAS.get(clave(c)); if (canon && !m.has(canon)) m.set(canon, j); });
    const tieneId = m.has('codigo_rude') || m.has('apellidos_y_nombres') || (m.has('nombres') && (m.has('apellido_paterno') || m.has('apellido_materno')));
    if (m.size >= 3 && tieneId) { cab = i; mapa = m; break; }
  }
  if (cab < 0) return { filas: [], faltantes: ['codigo_rude', 'nombres', 'nivel', 'anio_escolaridad'], encabezado: null };
  const filas = [];
  for (let i = cab + 1; i < matriz.length; i++) {
    const fila = matriz[i] ?? []; const obj = { __linea: i + 1 };
    for (const [canon, j] of mapa) obj[canon] = fila[j] ?? '';
    if (Object.entries(obj).every(([k, v]) => k === '__linea' || limpio(v) === '')) continue;     // fila vacía
    if (/^ejemplo/i.test(limpio(obj.codigo_rude))) continue;                                      // filas de ejemplo de la plantilla
    filas.push(obj);
  }
  return { filas, faltantes: [], encabezado: cab + 1, columnas: [...mapa.keys()] };
}

/* ------------------------------ Validación ------------------------------ */
/** @param {{cursos:any[], niveles:any[]}} cat  catálogo del colegio */
export function validarFila(f, cat) {
  const e = []; const avisos = [];
  const rude = limpio(f.codigo_rude);
  if (!/^[0-9A-Za-z-]{5,25}$/.test(rude)) e.push('Código RUDE inválido (5 a 25 letras, números o guion).');
  let { nombres, apellido_paterno, apellido_materno } = Object.fromEntries(['nombres', 'apellido_paterno', 'apellido_materno'].map((k) => [k, limpio(f[k])]));
  if (!nombres && !apellido_paterno && !apellido_materno && limpio(f.apellidos_y_nombres)) {
    ({ nombres, apellido_paterno, apellido_materno } = separarApellidosNombres(f.apellidos_y_nombres));
    avisos.push('Se separó "Apellidos y nombres" automáticamente: revise la fila.');
  }
  if (!nombres) e.push('Falta el nombre.');
  if (!apellido_paterno && !apellido_materno) e.push('Falta al menos un apellido.');

  const genero = normalizarGenero(f.genero); if (genero === undefined) e.push('Género debe ser M o F.');
  const nac = normalizarFecha(f.fecha_nacimiento); if (nac === undefined) e.push('Fecha de nacimiento inválida (use dd/mm/aaaa).');

  const nivelTxt = limpio(f.nivel) || limpio(f.curso);
  const nivel = normalizarNivel(nivelTxt);
  if (!nivel) e.push('Nivel no reconocido (Inicial, Primaria o Secundaria).');
  const anio = parsearAnio(limpio(f.anio_escolaridad) || limpio(f.curso));
  if (!anio || anio < 1 || anio > 6 || (nivel === 'Inicial' && anio > 2)) e.push('Año de escolaridad inválido.');
  const paralelo = (limpio(f.paralelo) || 'A').toUpperCase();
  let curso = null;
  if (nivel && anio) {
    const nv = cat.niveles.find((n) => normalizarTexto(n.nombre) === normalizarTexto(nivel));
    curso = nv && cat.cursos.find((c) => c.nivel_id === nv.id && c.anio_escolaridad === anio && String(c.paralelo).toUpperCase() === paralelo);
    if (!curso) e.push(`No existe el curso ${anio}.º ${nivel} paralelo ${paralelo} en este colegio.`);
  }
  const condicion = normalizarCondicion(f.condicion); if (!condicion) e.push('Indique si el estudiante es Nuevo o Antiguo.');
  const susc = normalizarSiNo(f.suscrito_plataforma); if (susc === null) e.push('"Suscrito a plataforma" debe ser SI o NO.');
  const plataforma = limpio(f.plataforma) || null; if (susc && !plataforma) e.push('Indique el nombre de la plataforma educativa.');
  const tp = normalizarSiNo(f.tutor_personal); if (tp === null) e.push('"Tutor personal" debe ser SI o NO.');

  const tutores = [];
  for (const n of [1, 2, 3]) {
    const nom = limpio(f[`tutor${n}_nombres`]), ape = limpio(f[`tutor${n}_apellidos`]), telRaw = limpio(f[`tutor${n}_telefono`]), par = limpio(f[`tutor${n}_parentesco`]);
    if (!nom && !ape && !telRaw && !par) { if (n === 1) e.push('Falta el tutor 1 (nombre y teléfono).'); continue; }
    const tel = normalizarTelefono(telRaw);
    if (!nom) e.push(`Tutor ${n}: falta el nombre.`);
    if (!tel) e.push(`Tutor ${n}: teléfono inválido (8 dígitos, o con código de país).`);
    if (nom && tel) tutores.push({ nombres: nom, apellidos: ape, telefono: tel, parentesco: par || 'Otro' });
  }
  const ok = e.length === 0;
  return {
    ok, errores: e, avisos,
    est: ok ? { codigo_rude: rude, nombres, apellido_paterno, apellido_materno, genero, fecha_nacimiento: nac, curso_id: curso.id, curso_nombre: curso.nombre, condicion,
      suscrito_plataforma: susc, plataforma_nombre: susc ? plataforma : null, tiene_tutor_personal: tp } : null,
    tutores,
  };
}

/** Valida todas las filas y detecta RUDE repetidos dentro del archivo. */
export function prepararPlan(filas, cat) {
  const validas = [], errores = []; const vistos = new Map();
  for (const f of filas) {
    const r = validarFila(f, cat); const rude = limpio(f.codigo_rude);
    if (r.ok && vistos.has(rude)) { r.ok = false; r.errores.push(`El RUDE ${rude} está repetido (también en la fila ${vistos.get(rude)}).`); }
    if (r.ok) { vistos.set(rude, f.__linea); validas.push({ linea: f.__linea, est: r.est, tutores: r.tutores, avisos: r.avisos }); }
    else errores.push({ linea: f.__linea, rude, mensajes: r.errores });
  }
  return { validas, errores, advertencias: validas.filter((v) => v.avisos.length).length };
}

/* ------------------------------ Inserción masiva ------------------------------ */
const trozos = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/**
 * Inserta tutores (reutiliza los que ya existen por teléfono), estudiantes (omite los RUDE existentes) y los vínculos.
 * @returns resumen con conteos y errores por etapa (si una etapa falla, se informa y se detiene).
 */
export async function ejecutarImportacion(sb, colegioId, validas, alProgreso = () => {}) {
  const res = { estudiantes_creados: 0, estudiantes_existentes: 0, tutores_creados: 0, tutores_reutilizados: 0, vinculos: 0, errores: [] };
  const falla = (etapa, error) => { res.errores.push(`${etapa}: ${error.message}`); return res; };
  const T = 150;

  // 1) Tutores por teléfono
  const tutoresUnicos = new Map(); validas.forEach((v) => v.tutores.forEach((t) => { if (!tutoresUnicos.has(t.telefono)) tutoresUnicos.set(t.telefono, t); }));
  const idTutor = new Map(); const telefonos = [...tutoresUnicos.keys()];
  alProgreso({ etapa: 'Tutores', hecho: 0, total: telefonos.length });
  for (const lote of trozos(telefonos, T)) {
    const { data, error } = await sb.from('tutores').select('id, telefono_whatsapp').eq('colegio_id', colegioId).in('telefono_whatsapp', lote);
    if (error) return falla('Buscando tutores', error);
    data.forEach((t) => { idTutor.set(t.telefono_whatsapp, t.id); res.tutores_reutilizados++; });
  }
  const nuevos = telefonos.filter((t) => !idTutor.has(t)).map((t) => ({ colegio_id: colegioId, nombres: tutoresUnicos.get(t).nombres, apellidos: tutoresUnicos.get(t).apellidos, telefono_whatsapp: t }));
  for (const lote of trozos(nuevos, T)) {
    const { data, error } = await sb.from('tutores').insert(lote).select('id, telefono_whatsapp');
    if (error) return falla('Creando tutores', error);
    data.forEach((t) => { idTutor.set(t.telefono_whatsapp, t.id); res.tutores_creados++; });
    alProgreso({ etapa: 'Tutores', hecho: res.tutores_creados, total: nuevos.length });
  }

  // 2) Estudiantes por RUDE
  const idEst = new Map(); const existentes = new Set(); const ruds = validas.map((v) => v.est.codigo_rude);
  for (const lote of trozos(ruds, T)) {
    const { data, error } = await sb.from('estudiantes').select('id, codigo_rude').eq('colegio_id', colegioId).in('codigo_rude', lote);
    if (error) return falla('Buscando estudiantes', error);
    data.forEach((e) => { existentes.add(e.codigo_rude); res.estudiantes_existentes++; });
  }
  const aCrear = validas.filter((v) => !existentes.has(v.est.codigo_rude));
  const filas = aCrear.map((v) => { const { curso_nombre, ...e } = v.est; return { colegio_id: colegioId, ...e }; });
  for (const lote of trozos(filas, T)) {
    const { data, error } = await sb.from('estudiantes').insert(lote).select('id, codigo_rude');
    if (error) return falla('Creando estudiantes', error);
    data.forEach((e) => { idEst.set(e.codigo_rude, e.id); res.estudiantes_creados++; });
    alProgreso({ etapa: 'Estudiantes', hecho: res.estudiantes_creados, total: filas.length });
  }

  // 3) Vínculos estudiante–tutor (solo para estudiantes nuevos; máximo 3 por estudiante)
  const vinculos = [];
  for (const v of aCrear) {
    const eid = idEst.get(v.est.codigo_rude); if (!eid) continue; const usados = new Set();
    v.tutores.slice(0, 3).forEach((t, i) => { const tid = idTutor.get(t.telefono); if (tid && !usados.has(tid)) { usados.add(tid); vinculos.push({ estudiante_id: eid, tutor_id: tid, colegio_id: colegioId, parentesco: t.parentesco, es_principal: i === 0 }); } });
  }
  for (const lote of trozos(vinculos, T)) {
    const { error } = await sb.from('estudiante_tutor').insert(lote);
    if (error) return falla('Vinculando tutores', error);
    res.vinculos += lote.length; alProgreso({ etapa: 'Vínculos', hecho: res.vinculos, total: vinculos.length });
  }
  return res;
}
