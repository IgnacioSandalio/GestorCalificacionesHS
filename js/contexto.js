// contexto.js · Contexto de trabajo de la persona con sesión: colegio activo (administrador y operador) o hijo activo (tutor).
// Lo comparten el cliente real (Apps Script) y el de demostración. Al cambiar de colegio, TODAS las consultas de tablas
// que pertenecen a un colegio se filtran por ese colegio_id (api.js lo añade solo); además la base ya limita por RLS.
const K_COL = 'jeadas.colegio', K_EST = 'jeadas.estudiante';
const leer = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const guardar = (k, v) => { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch { /* sin almacenamiento */ } };

/** Tablas y vistas que tienen columna colegio_id (se filtran por el colegio activo). */
export const TABLAS_COLEGIO = new Set(['niveles', 'cursos', 'materias', 'gestiones', 'periodos', 'estudiantes', 'tutores', 'estudiante_tutor', 'reportes', 'respaldos',
  'solicitudes_habilitacion', 'notificaciones_whatsapp', 'logs_sistema', 'v_evidencias', 'v_periodo_actual', 'v_progreso_estudiante', 'v_kpi_colegio',
  'v_embudo_progreso', 'v_top_causas_retraso', 'v_estudiantes_alerta', 'v_resumen_colegio']);

const e = { rol: null, colegios: [], hijos: [], colegioId: null, estudianteId: null };
const oyentes = new Set();
const avisar = () => oyentes.forEach((f) => { try { f(); } catch (x) { console.error(x); } });

export const contexto = {
  /** Se llama tras el ingreso (o al recargar la página) con lo que devuelve el servidor. */
  cargar({ rol, colegios = [], hijos = [] }) {
    Object.assign(e, { rol, colegios, hijos });
    if (rol === 'tutor') {
      const g = leer(K_EST);
      e.estudianteId = hijos.find((h) => h.id === g)?.id ?? hijos[0]?.id ?? null;
      e.colegioId = hijos.find((h) => h.id === e.estudianteId)?.colegio_id ?? colegios[0]?.id ?? null;
    } else if (rol === 'superadmin') { e.colegioId = null; e.estudianteId = null; }
    else { const g = leer(K_COL); e.colegioId = colegios.find((c) => c.id === g)?.id ?? colegios[0]?.id ?? null; e.estudianteId = null; }
  },
  limpiar() { Object.assign(e, { rol: null, colegios: [], hijos: [], colegioId: null, estudianteId: null }); guardar(K_COL, null); guardar(K_EST, null); },
  get rol() { return e.rol; },
  get colegios() { return e.colegios; },
  get hijos() { return e.hijos; },
  get colegioId() { return e.colegioId; },
  get estudianteId() { return e.estudianteId; },
  get colegio() { return e.colegios.find((c) => c.id === e.colegioId) ?? null; },
  get hijo() { return e.hijos.find((h) => h.id === e.estudianteId) ?? null; },
  setColegio(id) {
    if (!e.colegios.some((c) => c.id === id) || id === e.colegioId) return;
    e.colegioId = id; guardar(K_COL, id); avisar();
  },
  setEstudiante(id) {
    const h = e.hijos.find((x) => x.id === id); if (!h || id === e.estudianteId) return;
    e.estudianteId = id; e.colegioId = h.colegio_id; guardar(K_EST, id); avisar();
  },
  /** Actualiza la lista de colegios (p. ej., tras crear uno) sin cambiar de contexto. */
  reemplazarColegios(colegios) { e.colegios = colegios; if (!colegios.some((c) => c.id === e.colegioId)) e.colegioId = colegios[0]?.id ?? null; },
  /** Suscripción a cambios de colegio/hijo. Devuelve la función para cancelar. */
  alCambiar(fn) { oyentes.add(fn); return () => oyentes.delete(fn); },
  /** colegio_id que debe añadirse como filtro a una consulta, o null si no corresponde. */
  filtroColegio(tabla, op, columnasFiltradas) {
    if (!e.colegioId || e.rol === 'superadmin' || !TABLAS_COLEGIO.has(tabla)) return null;
    if (op === 'insert' || op === 'upsert' || columnasFiltradas.has('colegio_id')) return null;
    return e.colegioId;
  },
};
