// api.js · Único punto de contacto del navegador con el sistema: Apps Script (API_URL). Sin claves, sin Supabase, sin correos.
// En demostración (sin URL) usa datos locales. El ingreso es usuario + clave: Apps Script los verifica contra las tablas de la base.
// Ofrece la misma superficie que usan las pantallas: sb.from(...).select().eq()…, sb.rpc(), sb.auth.*, sb.functions.invoke(),
// más sb.drive.* y sb.evidencias.* (carpeta de Drive de cada colegio) y sb.contexto (colegio activo / hijo activo).
import { API_URL, DEMO } from './config.js';
import { contexto } from './contexto.js';
export { contexto };

let promesa = null;
export function obtenerCliente() {
  promesa ??= crear();
  return promesa;
}

async function crear() {
  if (DEMO) {
    const { crearClienteDemo } = await import('./demo.js');
    return crearClienteDemo();
  }
  return crearClienteApi();
}

/* ------------------------------ Transporte hacia Apps Script ------------------------------ */
const CLAVE_TOKEN = 'jdi_token';
const leerToken = () => { try { return sessionStorage.getItem(CLAVE_TOKEN); } catch { return null; } };
const guardarToken = (t) => { try { t ? sessionStorage.setItem(CLAVE_TOKEN, t) : sessionStorage.removeItem(CLAVE_TOKEN); } catch { /* sin almacenamiento: la sesión dura la página */ } };
let tokenMemoria = null;

async function enviar(cuerpo) {
  const r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo), redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function sesionVencida() {
  guardarToken(null); tokenMemoria = null;
  if (!/login\.html/.test(location.pathname)) location.assign('./login.html');
}

const aError = (r) => ({ message: r.error ?? 'Ocurrió un error inesperado.', code: r.codigo ?? 'error', status: r.codigo === 'bloqueado' ? 429 : 400 });

/** Llamada simple. Devuelve {data, error}. */
async function llamar(a, cuerpo = {}) {
  try {
    const t = tokenMemoria ?? leerToken();
    const r = await enviar({ a, t, ...cuerpo });
    if (!r.ok) { if (r.codigo === 'sesion' && a !== 'login') sesionVencida(); return { data: null, error: aError(r) }; }
    return { data: r.data, error: null };
  } catch {
    return { data: null, error: { message: 'No se pudo conectar. Revise su internet e intente de nuevo.', code: 'red' } };
  }
}

/* Lotes: las consultas lanzadas en el mismo instante viajan juntas (una sola espera en vez de varias). */
let cola = [];
function encolar(item) {
  return new Promise((resolver) => {
    cola.push({ item, resolver });
    if (cola.length === 1) setTimeout(vaciar, 0);
  });
}
async function vaciar() {
  const lote = cola.splice(0, 20); if (cola.length) setTimeout(vaciar, 0);
  if (lote.length === 1) { const { item, resolver } = lote[0]; return resolver(await llamar(item.a, item)); }
  const { data, error } = await llamar('lote', { items: lote.map((x) => x.item) });
  lote.forEach((x, i) => {
    if (error) return x.resolver({ data: null, error });
    const r = data[i];
    x.resolver(r?.ok ? { data: r.data, error: null } : { data: null, error: aError(r ?? {}) });
  });
}

/* ------------------------------ Constructor de consultas (misma forma que supabase-js) ------------------------------ */
class Consulta {
  constructor(tabla) { this.q = { tabla, op: 'select', filtros: [], orden: [] }; this.modo = null; }
  /** Filtra siempre por el colegio activo (tablas con colegio_id) salvo que la consulta ya lo haga. */
  _contexto() {
    const col = contexto.filtroColegio(this.q.tabla, this.q.op, new Set(this.q.filtros.map((f) => f[0])));
    if (col) this.q.filtros.push(['colegio_id', 'eq', col]);
  }
  select(cols = '*') { if (this.q.op === 'select') this.q.cols = cols; else { this.q.retornar = true; this.q.cols = cols; } return this; }
  insert(d) { this.q.op = 'insert'; this.q.datos = d; return this; }
  upsert(d, o = {}) { this.q.op = 'upsert'; this.q.datos = d; this.q.onConflict = o.onConflict; return this; }
  update(d) { this.q.op = 'update'; this.q.datos = d; return this; }
  delete() { this.q.op = 'delete'; return this; }
  eq(c, v) { this.q.filtros.push([c, 'eq', v]); return this; }
  neq(c, v) { this.q.filtros.push([c, 'neq', v]); return this; }
  in(c, v) { this.q.filtros.push([c, 'in', v]); return this; }
  gt(c, v) { this.q.filtros.push([c, 'gt', v]); return this; }
  gte(c, v) { this.q.filtros.push([c, 'gte', v]); return this; }
  lt(c, v) { this.q.filtros.push([c, 'lt', v]); return this; }
  lte(c, v) { this.q.filtros.push([c, 'lte', v]); return this; }
  is(c, v) { this.q.filtros.push([c, 'is', v]); return this; }
  order(c, o = {}) { this.q.orden.push([c, o.ascending !== false]); return this; }
  limit(n) { this.q.limite = n; return this; }
  single() { this.modo = 'single'; return this; }
  maybeSingle() { this.modo = 'maybe'; return this; }
  then(res, rej) { this._contexto(); return encolar({ a: 'q', q: this.q, modo: this.modo }).then(res, rej); }
}

export function crearClienteApi() {
  const sesion = () => (tokenMemoria ?? leerToken());
  let perfilCache = null;
  const cargarAsignaciones = (d) => { perfilCache = d.perfil; contexto.cargar({ rol: d.perfil.rol, colegios: d.colegios ?? [], hijos: d.hijos ?? [] }); };
  return {
    esDemo: false,
    contexto,
    auth: {
      async signInWithPassword({ usuario, password }) {
        const { data, error } = await llamar('login', { usuario: String(usuario).trim().toLowerCase(), clave: password });
        if (error) return { data: null, error };
        tokenMemoria = data.token; guardarToken(data.token); cargarAsignaciones(data);
        return { data: { user: { id: data.perfil.id } }, error: null };
      },
      async getSession() {
        if (!sesion()) return { data: { session: null }, error: null };
        if (!perfilCache) { const { data, error } = await llamar('perfil'); if (error || !data?.perfil) return { data: { session: null }, error: null }; cargarAsignaciones(data); }
        return { data: { session: { user: { id: perfilCache.id } } }, error: null };
      },
      perfil: () => perfilCache,
      /** Cambia la contraseña (exige la actual) y marca el cambio obligatorio como cumplido, todo en un solo paso del servidor. */
      async updateUser({ password, actual }) {
        const { data, error } = await llamar('cambiar_password', { actual, nueva: password });
        if (!error) cargarAsignaciones(data);
        return { data: error ? null : { user: { id: perfilCache?.id } }, error };
      },
      async signOut() { await llamar('logout'); guardarToken(null); tokenMemoria = null; perfilCache = null; contexto.limpiar(); return { error: null }; },
    },
    from: (t) => new Consulta(t),
    rpc: (nombre, args = {}) => encolar({ a: 'rpc', nombre, args }),
    functions: { invoke: (nombre, { body } = {}) => (nombre === 'gestionar-usuario' ? llamar('usuario', body) : Promise.resolve({ data: null, error: { message: 'Función inexistente' } })) },
    // Drive de cada colegio: el administrador instala un «receptor» en SU cuenta de Google y registra aquí su URL.
    // Los archivos pasan por Apps Script y se guardan en el Drive del administrador (su espacio, no el del Superadmin).
    drive: {
      estado: (colegio_id) => llamar('drive_estado', { colegio_id }),
      preparar: (colegio_id) => llamar('drive_preparar', { colegio_id }),          // → {clave}
      registrar: (colegio_id, url) => llamar('drive_registrar', { colegio_id, url }),
      quitar: (colegio_id) => llamar('drive_quitar', { colegio_id }),
    },
    evidencias: {
      subir: (p) => llamar('evidencia_subir', p),         // {reporte_id, materia_id, nombre, mime, peso_original, b64}
      ver: (id) => llamar('evidencia_ver', { id }),       // → {nombre, mime, b64}
      borrar: (id) => llamar('evidencia_borrar', { id }),
    },
  };
}

/** Devuelve el perfil del usuario con sesión (ya validado por Apps Script), o null. Carga también colegios e hijos en el contexto. */
export async function perfilActual(sb) {
  const { data: s } = await sb.auth.getSession();
  if (!s?.session?.user?.id) return null;
  const p = sb.auth.perfil();
  return p && p.activo !== false ? p : null;
}

export const RUTA_POR_ROL = {
  superadmin: './app.html#/gestion',
  operador: './app.html#/admin',
  admin_colegio: './app.html#/admin',
  tutor: './app.html#/padres',
};

/** Extrae un texto legible de un error del servidor. */
export async function textoError(error) {
  if (!error) return '';
  try {
    const cuerpo = await error.context?.json?.();
    if (cuerpo?.error) return String(cuerpo.error);
  } catch { /* se usa el mensaje base */ }
  return error.message || 'Ocurrió un error inesperado.';
}
