// demo.js · MODO DEMOSTRACIÓN. Imita el subconjunto de la API de Supabase que usa la aplicación
// (consultas, RPC, autenticación, Drive del cliente, evidencias y gestión de usuarios) sobre datos ficticios guardados en el navegador.
// No contiene datos reales. Las reglas de negocio replican las del esquema SQL (sql/01 y sql/02).

import { contexto } from './contexto.js';

const CLAVE = 'jeadas.demo.estado.v3';
const almacen = (() => { try { return globalThis.sessionStorage ?? null; } catch { return null; } })();

/* ------------------------------ Utilidades ------------------------------ */
let contador = 0;
const nuevoId = () => globalThis.crypto?.randomUUID?.() ?? `demo-${Date.now()}-${++contador}`;
const pad = (n) => String(n).padStart(2, '0');
export const isoDia = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const diasDesde = (n, base = new Date()) => { const d = new Date(base.getFullYear(), base.getMonth(), base.getDate()); d.setDate(d.getDate() + n); return d; };
const ahora = () => new Date().toISOString();
const clon = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const diffDias = (aIso, bIso) => Math.round((new Date(`${aIso}T00:00:00`) - new Date(`${bIso}T00:00:00`)) / 86400000);
const err = (message, code = 'DEMO') => ({ message, code });

export function mesesEntre(inicioIso, cierreIso) {
  const [a, m] = inicioIso.split('-').map(Number); const [a2, m2] = cierreIso.split('-').map(Number);
  const out = []; let y = a, mo = m;
  while (y < a2 || (y === a2 && mo <= m2)) { out.push(`${y}-${pad(mo)}-01`); mo++; if (mo > 12) { mo = 1; y++; } }
  return out;
}

/* ------------------------------ Catálogo por colegio (igual que sembrar_catalogo_colegio) ------------------------------ */
function sembrarCatalogo(T, colegioId) {
  const nivel = (nombre, tipo, orden) => { const n = { id: nuevoId(), colegio_id: colegioId, nombre, tipo_evaluacion: tipo, orden, activo: true }; T.niveles.push(n); return n.id; };
  const ini = nivel('Inicial', 'cualitativa', 1), pri = nivel('Primaria', 'cuantitativa', 2), sec = nivel('Secundaria', 'cuantitativa', 3);
  const ord = ['1ro.', '2do.', '3ro.', '4to.', '5to.', '6to.'];
  const curso = (nivel_id, nombre, anio) => T.cursos.push({ id: nuevoId(), colegio_id: colegioId, nivel_id, nombre, anio_escolaridad: anio, paralelo: 'A', orden: anio, activo: true });
  for (let i = 1; i <= 2; i++) curso(ini, `Inicial ${i}${i === 1 ? 'er' : 'do'} año`, i);
  for (let i = 1; i <= 6; i++) { curso(pri, `${ord[i - 1]} de Primaria`, i); curso(sec, `${ord[i - 1]} de Secundaria`, i); }
  const mat = (nivel_id, campo_id, nombre, abreviatura, orden) => T.materias.push({ id: nuevoId(), colegio_id: colegioId, nivel_id, campo_id, nombre, abreviatura, orden, activa: true });
  [[3, 'Vida Tierra Territorio', 'VTT'], [1, 'Comunidad y Sociedad', 'CYS'], [2, 'Ciencia, Tecnología y Producción', 'CTP'], [4, 'Cosmos y Pensamiento', 'CYP']]
    .forEach(([c, n, a], i) => mat(ini, c, n, a, i + 1));
  [[1, 'Comunicación, Lenguaje y Lengua Extranjera', 'LCO'], [1, 'Ciencias Sociales', 'CSO'], [1, 'Artes Plásticas y Visuales', 'APV'], [1, 'Educación Física y Deportes', 'EFD'],
    [1, 'Educación Musical', 'EMU'], [2, 'Matemática', 'MAT'], [2, 'Técnica Tecnológica', 'TT'], [3, 'Ciencias Naturales', 'CNA'], [4, 'Valores, Espiritualidad y Religiones', 'VER']]
    .forEach(([c, n, a], i) => mat(pri, c, n, a, i + 1));
  [[1, 'Comunicación, Lenguaje y Lengua Originaria', 'LCO'], [1, 'Lengua Extranjera', 'LEX'], [1, 'Ciencias Sociales', 'CSO'], [1, 'Educación Física y Deportes', 'EFD'],
    [1, 'Educación Musical', 'EMU'], [1, 'Artes Plásticas y Visuales', 'APV'], [2, 'Matemática', 'MAT'], [2, 'Computación', 'COM'], [3, 'Biología - Geografía', 'BGE'],
    [3, 'Física', 'FIS'], [3, 'Química', 'QUI'], [4, 'Cosmovisiones, Filosofía y Psicología', 'CFP'], [4, 'Valores, Espiritualidad y Religiones', 'VER']]
    .forEach(([c, n, a], i) => mat(sec, c, n, a, i + 1));
  T.colegio_integraciones.push({ colegio_id: colegioId, whatsapp_proveedor: null, whatsapp_api_url: null, whatsapp_instance: null, whatsapp_token: null, whatsapp_activo: false });
}

/* ------------------------------ Datos ficticios ------------------------------ */
const NOMBRES = ['Lucía', 'Mateo', 'Valentina', 'Santiago', 'Camila', 'Diego', 'Sofía', 'Joaquín', 'Renata', 'Emiliano', 'Mariana', 'Gael', 'Daniela', 'Thiago', 'Abril', 'Bruno', 'Julieta', 'Ian', 'Ximena', 'Leo'];
const APELL = ['Mamani', 'Quispe', 'Flores', 'Condori', 'Rojas', 'Vega', 'Choque', 'Gutiérrez', 'Torrez', 'Callisaya', 'Limachi', 'Rivera', 'Salazar', 'Fernández', 'Vargas'];

function semilla() {
  const T = {};
  for (const t of ['perfiles', 'colegios', 'usuario_colegios', 'colegio_integraciones', 'niveles', 'cursos', 'materias', 'gestiones', 'periodos', 'estudiantes', 'tutores',
    'estudiante_tutor', 'reportes', 'reporte_notas', 'respaldos', 'solicitudes_habilitacion', 'notificaciones_whatsapp', 'logs_sistema']) T[t] = [];
  T.regiones = ['CH:Chuquisaca', 'LP:La Paz', 'CB:Cochabamba', 'OR:Oruro', 'PT:Potosí', 'TJ:Tarija', 'SC:Santa Cruz', 'BN:Beni', 'PD:Pando']
    .map((s, i) => ({ id: i + 1, codigo: s.split(':')[0], nombre: s.split(':')[1] }));
  T.campos_saberes = [[1, 'Comunidad y Sociedad'], [2, 'Ciencia, Tecnología y Producción'], [3, 'Vida Tierra Territorio'], [4, 'Cosmos y Pensamiento']]
    .map(([id, nombre]) => ({ id, nombre, orden: id }));

  const claves = { 'demo.super': 'Clave12345', 'demo.admin': 'Temporal1', 'demo.admin2': 'Clave12345', 'demo.operador': 'Clave12345', 'demo.tutor': 'Temporal1' };
  const perfil = (id, username, nombres, apellidos, rol, region_id, debe) =>
    T.perfiles.push({ id, username, nombres, apellidos, rol, region_id, telefono: null, activo: true, debe_cambiar_password: debe, created_at: ahora() });
  perfil('u-super', 'demo.super', 'Superadministrador', 'Demo', 'superadmin', null, false);
  perfil('u-admin', 'demo.admin', 'Ana', 'Administradora', 'admin_colegio', null, true);
  perfil('u-admin2', 'demo.admin2', 'Beto', 'Horizonte', 'admin_colegio', null, false);
  perfil('u-op', 'demo.operador', 'Olga', 'Operadora', 'operador', null, false);
  perfil('u-tutor', 'demo.tutor', 'Tutor', 'Demo', 'tutor', null, true);

  const colegios = [
    { id: 'col-a', region_id: 2, nombre: 'Colegio Sombrilla', ciudad: 'La Paz', director: 'Director Demo A', receptor_url: 'https://script.google.com/macros/s/AKfycbxDEMOcolegioSombrilla/exec' },
    { id: 'col-b', region_id: 2, nombre: 'Unidad Educativa Despertad', ciudad: 'El Alto', director: 'Director Demo B' },
    { id: 'col-c', region_id: 7, nombre: 'Colegio Horizonte', ciudad: 'Santa Cruz de la Sierra', director: 'Director Demo C' },
  ];
  colegios.forEach((c) => { T.colegios.push({ receptor_url: null, drive_verificado_at: null, ...c, codigo_sie: null, direccion: null, activo: true, created_at: ahora() }); sembrarCatalogo(T, c.id); });
  T.usuario_colegios.push({ usuario_id: 'u-admin', colegio_id: 'col-a' }, { usuario_id: 'u-admin', colegio_id: 'col-b' }, { usuario_id: 'u-admin2', colegio_id: 'col-c' }, { usuario_id: 'u-op', colegio_id: 'col-a' });

  // Gestión y periodos (relativos a hoy para que la demostración siempre tenga un periodo vigente)
  const hoy = new Date(); const anio = hoy.getFullYear();
  for (const c of colegios) {
    const g = nuevoId(); const bloqueado = c.id === 'col-b';
    T.gestiones.push({ id: g, colegio_id: c.id, anio, tipo_periodo: 'trimestral', fecha_inicio: isoDia(diasDesde(-35)), fecha_fin: isoDia(diasDesde(130)), activa: true });
    const p = (numero, nombre, ini, cie, estado) => T.periodos.push({ id: `${c.id}-p${numero}`, colegio_id: c.id, gestion_id: g, numero, nombre, fecha_inicio: isoDia(diasDesde(ini)), fecha_cierre: isoDia(diasDesde(cie)), estado });
    if (bloqueado) { p(1, 'Primer Trimestre', -35, -1, 'cerrado'); p(2, 'Segundo Trimestre', 1, 60, 'programado'); p(3, 'Tercer Trimestre', 61, 130, 'programado'); }
    else { p(1, 'Primer Trimestre', -35, 9, 'abierto'); p(2, 'Segundo Trimestre', 10, 70, 'programado'); p(3, 'Tercer Trimestre', 71, 130, 'programado'); }
  }
  const curso = (col, nivelNombre, anioEsc) => {
    const n = T.niveles.find((x) => x.colegio_id === col && x.nombre === nivelNombre);
    return T.cursos.find((x) => x.colegio_id === col && x.nivel_id === n.id && x.anio_escolaridad === anioEsc);
  };

  // Familia demostración (la del usuario demo.tutor)
  T.tutores.push({ id: 't-demo', colegio_id: 'col-a', perfil_id: 'u-tutor', nombres: 'Tutor', apellidos: 'Demo', ci: null, telefono_whatsapp: '59170000001', email: null, activo: true });
  const hijos = [['Aurora', 'Inicial', 1, 'antiguo'], ['Bruno', 'Primaria', 4, 'nuevo'], ['Camila', 'Secundaria', 4, 'antiguo']];
  hijos.forEach(([n, nivel, a, cond], i) => {
    const id = `e-demo${i + 1}`;
    T.estudiantes.push({ id, numero: T.estudiantes.length + 1, colegio_id: 'col-a', curso_id: curso('col-a', nivel, a).id, codigo_rude: `RUDE-DEMO${i + 1}`, nombres: n, apellido_paterno: 'Demo', apellido_materno: 'Salas', genero: i === 1 ? 'M' : 'F',
      fecha_nacimiento: null, condicion: cond, estado: 'activo', suscrito_plataforma: true, plataforma_nombre: 'Sekou Academy', tiene_tutor_personal: false, checklist_tutor_personal: {} });
    T.estudiante_tutor.push({ estudiante_id: id, tutor_id: 't-demo', colegio_id: 'col-a', parentesco: 'Padre', es_principal: true, recibe_avisos: true });
  });

  // Población de los colegios (para los paneles)
  const cantidades = { 'col-a': 14, 'col-b': 10, 'col-c': 8 };
  let idx = 0;
  for (const c of colegios) {
    let tutorPrev = null;
    for (let i = 0; i < cantidades[c.id]; i++, idx++) {
      const nivel = ['Inicial', 'Primaria', 'Secundaria'][i % 3];
      const anioEsc = nivel === 'Inicial' ? (i % 2) + 1 : (i % 6) + 1;
      const cu = curso(c.id, nivel, anioEsc);
      const eid = `e-${c.id}-${i}`;
      T.estudiantes.push({ id: eid, numero: T.estudiantes.length + 1, colegio_id: c.id, curso_id: cu.id, codigo_rude: `RUDE-${c.id.slice(-1).toUpperCase()}${pad(i)}${100 + idx}`,
        nombres: NOMBRES[(idx * 3) % NOMBRES.length], apellido_paterno: APELL[(idx * 7) % APELL.length], apellido_materno: APELL[(idx * 5 + 3) % APELL.length],
        genero: idx % 2 ? 'M' : 'F', fecha_nacimiento: null, condicion: i % 3 === 0 ? 'nuevo' : 'antiguo', estado: 'activo',
        suscrito_plataforma: i % 2 === 0, plataforma_nombre: i % 2 === 0 ? 'Sekou Academy' : null, tiene_tutor_personal: false, checklist_tutor_personal: {} });
      let tid;
      if (i % 4 === 3 && tutorPrev) tid = tutorPrev;                  // hermanos comparten tutor
      else { tid = `t-${c.id}-${i}`; T.tutores.push({ id: tid, colegio_id: c.id, perfil_id: null, nombres: NOMBRES[(idx * 2 + 1) % NOMBRES.length], apellidos: APELL[(idx * 7) % APELL.length], ci: null, telefono_whatsapp: `5917${String(1000000 + idx * 137).slice(0, 7)}`, email: null, activo: true }); }
      tutorPrev = tid;
      T.estudiante_tutor.push({ estudiante_id: eid, tutor_id: tid, colegio_id: c.id, parentesco: 'Madre', es_principal: true, recibe_avisos: true });
      // Avance de reportes en el primer periodo
      const per = T[`periodos`].find((p) => p.id === `${c.id}-p1`);
      const estado = i % 5 === 0 ? null : i % 5 === 1 ? 'borrador' : 'enviado';
      if (estado) {
        const esNuevo = i % 3 === 0;
        const meses = esNuevo ? mesesEntre(per.fecha_inicio, per.fecha_cierre) : [null];
        meses.forEach((m) => T.reportes.push({ id: nuevoId(), colegio_id: c.id, estudiante_id: eid, periodo_id: per.id, tipo: esNuevo ? 'mensual' : 'periodo', mes_referencia: m,
          plataforma: 'Sekou Academy', fecha_reporte: isoDia(diasDesde(-3)), estado, observaciones: null, promedio_general: estado === 'enviado' ? 80 + (idx % 15) : null }));
      }
    }
  }
  const est = (i, c) => T.estudiantes.find((e) => e.id === `e-${c}-${i}`).id;
  const hab = (col, i, causa, motivo, horas, hace) => T.solicitudes_habilitacion.push({ id: nuevoId(), colegio_id: col, periodo_id: `${col}-p1`, estudiante_id: est(i, col),
    categoria_causa: causa, motivo, horas, solicitado_at: new Date(Date.now() - hace * 3600e3).toISOString(), habilitado_hasta: new Date(Date.now() + (horas - hace) * 3600e3).toISOString(), autor_id: null, autor_nombre: 'Ana Administradora', anulada: false });
  hab('col-a', 2, 'conectividad', 'Sin internet por bloqueo de caminos en la zona', 48, 60);
  hab('col-a', 5, 'conectividad', 'Corte de energía eléctrica durante tres días', 24, 100);
  hab('col-a', 8, 'olvido', 'La familia olvidó cargar el reporte a tiempo', 24, 30);
  hab('col-b', 4, 'salud', 'Estudiante con internación hospitalaria', 48, 10);
  hab('col-b', 7, 'viaje', 'Viaje familiar sin acceso a internet', 24, 50);
  // Drive por colegio: solo el colegio A tiene su carpeta registrada; B y C todavía no
  // Algunas evidencias de ejemplo (solo metadatos; el visor muestra un archivo de demostración)
  let n = 0;
  for (const rp of T.reportes.filter((r) => r.colegio_id === 'col-a' && r.estado === 'enviado').slice(0, 4)) {
    const e = T.estudiantes.find((x) => x.id === rp.estudiante_id); const per = T.periodos.find((x) => x.id === rp.periodo_id);
    rp.modo_evidencia = 'bloque'; n++;
    T.respaldos.push({ id: nuevoId(), colegio_id: rp.colegio_id, reporte_id: rp.id, materia_id: null, nombre_original: `boleta_${n}.pdf`,
      nombre_archivo: nombreEvidencia({ numero: e.numero, periodo: per.numero, tipoPeriodo: 'trimestral', materia: null, mes: rp.tipo === 'mensual' ? numeroMes(per.fecha_inicio, rp.mes_referencia) : null, secuencia: 1, mime: 'application/pdf' }),
      secuencia: 1, mime_type: 'application/pdf', tamano_bytes: 120000 + n * 1000, drive_file_id: `demo-${n}`, drive_url: 'https://drive.google.com/', subido_por: null, created_at: ahora() });
  }
  return { T, claves, sesion: null };
}

/* ------------------------------ Nombres de evidencias (igual que apps-script/Utilidades.gs) ------------------------------ */
const MIMES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx' };
const cero = (n, w) => String(Math.max(0, Math.floor(+n || 0))).padStart(w, '0');
const codigoPeriodo = (n, tipo) => n + ({ trimestral: 'T', bimestral: 'B', semestral: 'S' }[tipo] ?? 'P');
const numeroMes = (ini, mes) => { const a = ini.split('-'), b = mes.split('-'); return Math.max(1, (+b[0] - +a[0]) * 12 + (+b[1] - +a[1]) + 1); };
function nombreEvidencia(o) {
  const p = [cero(o.numero, 5), codigoPeriodo(o.periodo, o.tipoPeriodo)];
  if (o.materia) p.push(String(o.materia).toUpperCase()); if (o.mes) p.push(`${o.mes}M`); p.push(cero(o.secuencia, 3));
  return `${p.join('_')}.${MIMES[o.mime] ?? 'bin'}`;
}

/* ------------------------------ Reglas de negocio (iguales al SQL) ------------------------------ */
const requeridos = (T, est, per) => (est.condicion === 'nuevo' && per.numero === 1 ? mesesEntre(per.fecha_inicio, per.fecha_cierre).length : 1);
function puedeRegistrar(T, estId, perId) {
  const per = T.periodos.find((p) => p.id === perId); if (!per) return false; const hoy = isoDia(new Date());
  if (per.estado === 'abierto' && hoy >= per.fecha_inicio && hoy <= per.fecha_cierre) return true;
  return T.solicitudes_habilitacion.some((h) => h.periodo_id === perId && h.estudiante_id === estId && !h.anulada && new Date(h.habilitado_hasta) > new Date() && ['abierto', 'cerrado'].includes(per.estado));
}
function recalcular(T, reporteId) {
  const notas = T.reporte_notas.filter((n) => n.reporte_id === reporteId && n.nota !== null && n.nota !== undefined);
  const r = T.reportes.find((x) => x.id === reporteId);
  if (r) r.promedio_general = notas.length ? Math.round((notas.reduce((s, n) => s + Number(n.nota), 0) / notas.length) * 100) / 100 : null;
}
function nivelDeEstudiante(T, estId) {
  const e = T.estudiantes.find((x) => x.id === estId); const c = T.cursos.find((x) => x.id === e.curso_id); return T.niveles.find((x) => x.id === c.nivel_id);
}

/* ------------------------------ Vistas calculadas (equivalentes a sql/03) ------------------------------ */
function calcularVistas(T, visibles) {
  const hoy = isoDia(new Date());
  const colegios = T.colegios.filter((c) => c.activo !== false && visibles.has(c.id));
  const activos = T.estudiantes.filter((e) => e.estado === 'activo' && visibles.has(e.colegio_id));
  const v_periodo_actual = [];
  for (const c of colegios) {
    const g = T.gestiones.find((x) => x.colegio_id === c.id && x.activa); if (!g) continue;
    const cand = T.periodos.filter((p) => p.gestion_id === g.id && ['abierto', 'cerrado'].includes(p.estado))
      .sort((a, b) => (b.estado === 'abierto') - (a.estado === 'abierto') || b.numero - a.numero)[0];
    if (cand) v_periodo_actual.push({ colegio_id: c.id, periodo_id: cand.id, gestion_id: g.id, numero: cand.numero, nombre: cand.nombre, fecha_inicio: cand.fecha_inicio, fecha_cierre: cand.fecha_cierre, estado: cand.estado, dias_restantes: diffDias(cand.fecha_cierre, hoy) });
  }
  const paPor = Object.fromEntries(v_periodo_actual.map((p) => [p.colegio_id, p]));
  const v_progreso_estudiante = activos.filter((e) => paPor[e.colegio_id]).map((e) => {
    const pa = paPor[e.colegio_id]; const per = T.periodos.find((p) => p.id === pa.periodo_id);
    const rs = T.reportes.filter((r) => r.estudiante_id === e.id && r.periodo_id === pa.periodo_id);
    const req = requeridos(T, e, per); const pres = rs.filter((r) => ['enviado', 'aprobado'].includes(r.estado)).length;
    return { colegio_id: e.colegio_id, estudiante_id: e.id, curso_id: e.curso_id, periodo_id: pa.periodo_id, requeridos: req, presentados: pres, iniciados: rs.length, completo: pres >= req };
  });
  const v_kpi_colegio = colegios.map((c) => ({ colegio_id: c.id, nombre: c.nombre, region_id: c.region_id,
    estudiantes_activos: activos.filter((e) => e.colegio_id === c.id).length,
    tutores_unicos: new Set(T.tutores.filter((t) => t.colegio_id === c.id && t.activo).map((t) => t.telefono_whatsapp)).size }));
  const v_embudo_progreso = colegios.filter((c) => paPor[c.id]).map((c) => {
    const f = v_progreso_estudiante.filter((p) => p.colegio_id === c.id); const comp = f.filter((p) => p.completo).length;
    return { colegio_id: c.id, periodo_id: paPor[c.id].periodo_id, total_familias: f.length, iniciaron: f.filter((p) => p.iniciados > 0).length, completaron: comp, rezagados: f.length - comp,
      pct_completado: f.length ? Math.round((1000 * comp) / f.length) / 10 : null };
  });
  const habs = T.solicitudes_habilitacion.filter((h) => visibles.has(h.colegio_id) && !h.anulada);
  const v_top_causas_retraso = [];
  for (const c of colegios) {
    const por = {};
    habs.filter((h) => h.colegio_id === c.id).forEach((h) => { (por[h.categoria_causa] ??= []).push(h); });
    Object.entries(por).forEach(([causa, hs]) => v_top_causas_retraso.push({ colegio_id: c.id, categoria_causa: causa, veces: hs.length, estudiantes: new Set(hs.map((h) => h.estudiante_id)).size, ultima: hs.map((h) => h.solicitado_at).sort().pop() }));
  }
  const v_estudiantes_alerta = [];
  for (const e of activos) {
    const hs = habs.filter((h) => h.estudiante_id === e.id); const pr = v_progreso_estudiante.find((p) => p.estudiante_id === e.id); const pa = paPor[e.colegio_id];
    const vigente = hs.some((h) => new Date(h.habilitado_hasta) > new Date());
    const bloqueado = !!(pa && pa.estado === 'cerrado' && pr && !pr.completo && !vigente);
    if (!hs.length && !(pa && pa.estado === 'cerrado' && pr && !pr.completo)) continue;
    const cuenta = {}; hs.forEach((h) => { cuenta[h.categoria_causa] = (cuenta[h.categoria_causa] || 0) + 1; });
    v_estudiantes_alerta.push({ colegio_id: e.colegio_id, estudiante_id: e.id, codigo_rude: e.codigo_rude, estudiante: `${e.apellido_paterno} ${e.apellido_materno} ${e.nombres}`.trim(),
      curso: T.cursos.find((c) => c.id === e.curso_id)?.nombre, habilitaciones: hs.length, ultima_habilitacion: hs.map((h) => h.solicitado_at).sort().pop() ?? null,
      causa_frecuente: Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null, habilitado_vigente: vigente, bloqueado_ahora: bloqueado });
  }
  const v_resumen_colegio = v_kpi_colegio.map((k) => { const em = v_embudo_progreso.find((e) => e.colegio_id === k.colegio_id);
    return { ...k, familias_periodo: em?.total_familias ?? 0, completaron: em?.completaron ?? 0, rezagados: em?.rezagados ?? 0, pct_completado: em?.pct_completado ?? null,
      habilitaciones: habs.filter((h) => h.colegio_id === k.colegio_id).length }; });
  return { v_periodo_actual, v_progreso_estudiante, v_kpi_colegio, v_embudo_progreso, v_top_causas_retraso, v_estudiantes_alerta, v_resumen_colegio };
}

/* ------------------------------ Motor de consultas ------------------------------ */
class Demo {
  constructor() {
    let cargado = null;
    try { cargado = almacen?.getItem(CLAVE) ? JSON.parse(almacen.getItem(CLAVE)) : null; } catch { /* estado dañado: se reinicia */ }
    Object.assign(this, cargado ?? semilla());
    this.storage = this.storage ?? {};
    this.guardar();
  }
  guardar() { try { almacen?.setItem(CLAVE, JSON.stringify({ T: this.T, claves: this.claves, sesion: this.sesion, storage: this.storage })); } catch { /* sin almacenamiento */ } }
  get perfil() { return this.T.perfiles.find((p) => p.id === this.sesion) ?? null; }
  /** Colegios ACTIVOS del personal (admin_colegio y operador) o del tutor. El superadministrador no tiene colegios "de trabajo". */
  colegiosAdmin() {
    const p = this.perfil; if (!p || p.rol === 'superadmin') return new Set();
    const activos = new Set(this.T.colegios.filter((c) => c.activo !== false).map((c) => c.id));
    const ids = p.rol === 'tutor' ? this.T.tutores.filter((t) => t.perfil_id === p.id && t.activo).map((t) => t.colegio_id)
      : this.T.usuario_colegios.filter((a) => a.usuario_id === p.id).map((a) => a.colegio_id);
    return new Set(ids.filter((c) => activos.has(c)));
  }
  /** Colegios de los que es DUEÑO (solo admin_colegio). */
  colegiosDueno() { return this.perfil?.rol === 'admin_colegio' ? this.colegiosAdmin() : new Set(); }
  misEstudiantes() {
    const p = this.perfil; if (!p || p.rol !== 'tutor') return new Set();
    const mios = new Set(this.T.tutores.filter((t) => t.perfil_id === p.id).map((t) => t.id)); const cols = this.colegiosAdmin();
    return new Set(this.T.estudiante_tutor.filter((l) => mios.has(l.tutor_id) && cols.has(l.colegio_id)).map((l) => l.estudiante_id));
  }
  /** Equivale a las políticas RLS */
  visible(tabla, fila) {
    const p = this.perfil; if (!p) return false;
    if (tabla === 'respaldos') { if (p.rol === 'superadmin') return false; const r = this.T.reportes.find((x) => x.id === fila.reporte_id); return !!r && (p.rol === 'tutor' ? this.misEstudiantes().has(r.estudiante_id) : this.colegiosAdmin().has(r.colegio_id)); }
    if (p.rol === 'superadmin') {   // el superadministrador solo ve infraestructura: colegios, cuentas de administración y asignaciones
      if (['regiones', 'campos_saberes', 'colegios', 'usuario_colegios'].includes(tabla)) return true;
      return tabla === 'perfiles' && fila.rol !== 'tutor';
    }
    const cols = this.colegiosAdmin();
    if (['regiones', 'campos_saberes'].includes(tabla)) return true;
    if (tabla === 'perfiles') return fila.id === p.id || (p.rol !== 'tutor' && (this.T.usuario_colegios.some((u) => u.usuario_id === fila.id && cols.has(u.colegio_id)) || this.T.tutores.some((t) => t.perfil_id === fila.id && cols.has(t.colegio_id))));
    if (tabla === 'usuario_colegios') return fila.usuario_id === p.id || cols.has(fila.colegio_id);
    if (tabla === 'colegios') return cols.has(fila.id);
    if (['colegio_integraciones', 'solicitudes_habilitacion', 'notificaciones_whatsapp'].includes(tabla)) return p.rol !== 'tutor' && cols.has(fila.colegio_id);
    if (tabla === 'logs_sistema') return p.rol === 'admin_colegio' && cols.has(fila.colegio_id);
    if (p.rol === 'tutor') {
      const mios = this.misEstudiantes();
      if (tabla === 'estudiantes') return mios.has(fila.id);
      if (tabla === 'reportes' || tabla === 'estudiante_tutor') return mios.has(fila.estudiante_id);
      if (tabla === 'tutores') return fila.perfil_id === p.id;
      if (tabla === 'reporte_notas' || tabla === 'respaldos') { const r = this.T.reportes.find((x) => x.id === fila.reporte_id); return !!r && mios.has(r.estudiante_id); }
    }
    return fila.colegio_id !== undefined ? cols.has(fila.colegio_id) : true;
  }
  tabla(nombre) {
    if (nombre === 'v_evidencias') {
      const T = this.T; const filas = T.respaldos.filter((r) => this.visible('respaldos', r)).map((r) => {
        const rp = T.reportes.find((x) => x.id === r.reporte_id); const e = T.estudiantes.find((x) => x.id === rp.estudiante_id); const cu = T.cursos.find((x) => x.id === e.curso_id);
        const per = T.periodos.find((x) => x.id === rp.periodo_id); const g = T.gestiones.find((x) => x.id === per.gestion_id); const m = T.materias.find((x) => x.id === r.materia_id);
        return { id: r.id, colegio_id: r.colegio_id, colegio: T.colegios.find((c) => c.id === r.colegio_id)?.nombre, nivel_id: cu.nivel_id, nivel: T.niveles.find((n) => n.id === cu.nivel_id)?.nombre,
          curso_id: cu.id, curso: cu.nombre, estudiante_id: e.id, estudiante_numero: e.numero, estudiante: `${e.nombres} ${e.apellido_paterno} ${e.apellido_materno}`.trim(), reporte_id: rp.id, tipo: rp.tipo,
          mes_referencia: rp.mes_referencia, periodo_id: per.id, periodo: per.nombre, gestion: g.anio, materia_id: r.materia_id, materia: m?.nombre ?? null, nombre_archivo: r.nombre_archivo,
          nombre_original: r.nombre_original, secuencia: r.secuencia, mime_type: r.mime_type, tamano_bytes: r.tamano_bytes, created_at: r.created_at };
      });
      return clon(filas);
    }
    if (nombre.startsWith('v_')) {
      const p = this.perfil; const rol = p?.rol;
      if (rol === 'tutor' && nombre !== 'v_periodo_actual') return [];
      if (rol === 'superadmin') return [];
      return clon(calcularVistas(this.T, this.colegiosAdmin())[nombre] ?? null);
    }
    return this.T[nombre] ?? null;
  }
}

class Consulta {
  constructor(db, tabla) { Object.assign(this, { db, tabla, cols: new Set(), filtros: [], op: 'select', ret: false, un: null, orden: [], lim: null, payload: null, conflicto: null }); }
  select() { if (this.op !== 'select') this.ret = true; return this; }
  insert(p) { this.op = 'insert'; this.payload = p; return this; }
  upsert(p, o = {}) { this.op = 'upsert'; this.payload = p; this.conflicto = (o.onConflict ?? '').split(',').map((s) => s.trim()).filter(Boolean); return this; }
  update(p) { this.op = 'update'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.cols.add(c); this.filtros.push((r) => r[c] === v); return this; }
  neq(c, v) { this.filtros.push((r) => r[c] !== v); return this; }
  in(c, vs) { this.cols.add(c); this.filtros.push((r) => vs.includes(r[c])); return this; }
  gte(c, v) { this.filtros.push((r) => r[c] >= v); return this; }
  lte(c, v) { this.filtros.push((r) => r[c] <= v); return this; }
  is(c, v) { this.filtros.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)); return this; }
  order(c, o = {}) { this.orden.push([c, o.ascending === false ? -1 : 1]); return this; }
  limit(n) { this.lim = n; return this; }
  single() { this.un = 'single'; return this; }
  maybeSingle() { this.un = 'maybe'; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.ejecutar()).then(res, rej); }

  ejecutar() {
    const { db, tabla } = this; const base = db.tabla(tabla);
    const colCtx = contexto.filtroColegio(tabla, this.op, this.cols);   // igual que api.js: siempre por el colegio activo
    if (colCtx) this.filtros.push((r) => r.colegio_id === colCtx);
    if (!base) return { data: null, error: err(`Relación "${tabla}" inexistente`, '42P01') };
    if (!db.perfil) return { data: null, error: err('JWT requerido', '401') };
    const pf = db.perfil;
    const SOLO_DUENO = ['niveles', 'cursos', 'materias', 'gestiones', 'periodos', 'solicitudes_habilitacion'];
    if (this.op !== 'select' && (['respaldos', 'usuario_colegios', 'perfiles'].includes(tabla) || pf.rol === 'superadmin' || (SOLO_DUENO.includes(tabla) && pf.rol !== 'admin_colegio'))) return { data: null, error: err(`permission denied for table ${tabla}`, '42501') };
    if (tabla === 'colegios' && this.op === 'update' && (pf.rol !== 'admin_colegio' || Object.keys(this.payload ?? {}).some((k) => !['nombre', 'codigo_sie', 'ciudad', 'direccion', 'director'].includes(k)))) return { data: null, error: err('permission denied for table colegios', '42501') };
    if (tabla === 'colegios' && ['insert', 'delete', 'upsert'].includes(this.op)) return { data: null, error: err('permission denied for table colegios', '42501') };
    const esVista = tabla.startsWith('v_'); let filas; let error = null;
    const pasa = (r) => this.filtros.every((f) => f(r));
    if (this.op === 'select') filas = base.filter((r) => (esVista || db.visible(tabla, r)) && pasa(r));
    else if (esVista) return { data: null, error: err('No se puede modificar una vista', '42809') };
    else if (this.op === 'insert' || this.op === 'upsert') {
      filas = [];
      for (const dato of [].concat(this.payload)) {
        let fila = { ...dato };
        if (this.op === 'upsert' && this.conflicto.length) {
          const ex = base.find((r) => this.conflicto.every((c) => (r[c] ?? null) === (fila[c] ?? null)));
          if (ex) { const e = this.hookActualizar(ex, fila); if (e) { error = e; break; } filas.push(ex); continue; }
        }
        const e = this.hookInsertar(fila); if (e) { error = e; break; }
        base.push(fila); filas.push(fila); this.despues(fila);
      }
    } else if (this.op === 'update') {
      filas = base.filter((r) => db.visible(tabla, r) && pasa(r));
      for (const r of filas) { const e = this.hookActualizar(r, this.payload); if (e) { error = e; break; } }
    } else if (this.op === 'delete') {
      filas = base.filter((r) => db.visible(tabla, r) && pasa(r));
      filas.forEach((r) => base.splice(base.indexOf(r), 1));
      if (tabla === 'reporte_notas') filas.forEach((r) => recalcular(db.T, r.reporte_id));
    }
    if (error) return { data: null, error };
    if (this.op !== 'select') db.guardar();
    for (const [c, d] of [...this.orden].reverse()) filas.sort((a, b) => (a[c] > b[c] ? d : a[c] < b[c] ? -d : 0));
    if (this.lim !== null) filas = filas.slice(0, this.lim);
    if (this.op !== 'select' && !this.ret) return { data: null, error: null };
    filas = clon(filas);
    if (this.un === 'single') return filas.length === 1 ? { data: filas[0], error: null } : { data: null, error: err('JSON object requested, multiple (or no) rows returned', 'PGRST116') };
    if (this.un === 'maybe') return { data: filas[0] ?? null, error: null };
    return { data: filas, error: null };
  }

  /* --- Disparadores equivalentes a los del SQL --- */
  hookInsertar(f) {
    const { db, tabla } = this; const T = db.T; const p = db.perfil;
    f.id ??= (tabla === 'estudiante_tutor' ? undefined : nuevoId()); if (f.id === undefined) delete f.id;
    if (tabla === 'estudiantes') {
      if (T.estudiantes.some((e) => e.colegio_id === f.colegio_id && e.codigo_rude === f.codigo_rude)) return err('duplicate key value violates unique constraint "estudiantes_colegio_id_codigo_rude_key"', '23505');
      f.numero = Math.max(0, ...T.estudiantes.map((e) => e.numero ?? 0)) + 1;
      Object.assign(f, { condicion: 'nuevo', estado: 'activo', suscrito_plataforma: false, tiene_tutor_personal: false, checklist_tutor_personal: {}, ...f });
      if (!f.nombres || !(f.apellido_paterno || f.apellido_materno)) return err('Faltan nombres o apellidos', '23514');
    }
    if (tabla === 'tutores') {
      if (T.tutores.some((t) => t.colegio_id === f.colegio_id && t.telefono_whatsapp === f.telefono_whatsapp)) return err('duplicate key value violates unique constraint "tutores_colegio_id_telefono_whatsapp_key"', '23505');
      if (!/^[0-9]{8,15}$/.test(f.telefono_whatsapp ?? '')) return err('new row for relation "tutores" violates check constraint "tutores_telefono_whatsapp_check"', '23514');
      Object.assign(f, { activo: true, perfil_id: null, ...f });
    }
    if (tabla === 'estudiante_tutor') {
      const n = T.estudiante_tutor.filter((l) => l.estudiante_id === f.estudiante_id).length;
      if (n >= 3) return err('Un estudiante admite como máximo 3 tutores', 'P0001');
      if (T.estudiante_tutor.some((l) => l.estudiante_id === f.estudiante_id && l.tutor_id === f.tutor_id)) return err('duplicate key value violates unique constraint "estudiante_tutor_pkey"', '23505');
      f.es_principal = n === 0 ? true : !!f.es_principal; f.recibe_avisos ??= true; f.parentesco ??= 'Otro';
    }
    if (tabla === 'reportes') {
      f.estado ??= 'borrador'; f.mes_referencia ??= null; f.modo_evidencia ??= null; f.promedio_general = null; f.fecha_reporte ??= isoDia(new Date());
      const est = T.estudiantes.find((e) => e.id === f.estudiante_id); const per = T.periodos.find((x) => x.id === f.periodo_id);
      if (p.rol === 'tutor' && !(db.misEstudiantes().has(f.estudiante_id) && puedeRegistrar(T, f.estudiante_id, f.periodo_id))) return err('new row violates row-level security policy for table "reportes"', '42501');
      if (est.condicion === 'nuevo' && per.numero === 1) {
        if (f.tipo !== 'mensual') return err('Estudiante nuevo: durante el primer periodo solo se registran reportes MENSUALES', 'P0001');
        if (f.mes_referencia < `${per.fecha_inicio.slice(0, 7)}-01` || f.mes_referencia > `${per.fecha_cierre.slice(0, 7)}-01`) return err('El mes del reporte está fuera del primer periodo', 'P0001');
      } else if (f.tipo !== 'periodo') return err('Este estudiante registra un reporte por periodo (no mensual)', 'P0001');
      if (T.reportes.some((r) => r.estudiante_id === f.estudiante_id && r.periodo_id === f.periodo_id && (r.mes_referencia ?? null) === f.mes_referencia)) return err('duplicate key value violates unique constraint "reportes_unico"', '23505');
      if (f.estado === 'enviado') { const e = this.validarEnvio(f); if (e) return e; }
    }
    if (tabla === 'reporte_notas') { const e = this.validarNota(f); if (e) return e; }
    if (tabla === 'solicitudes_habilitacion') {
      if (![24, 48].includes(Number(f.horas))) return err('new row for relation "solicitudes_habilitacion" violates check constraint "solicitudes_habilitacion_horas_check"', '23514');
      if (String(f.motivo ?? '').trim().length < 10) return err('new row for relation "solicitudes_habilitacion" violates check constraint "solicitudes_habilitacion_motivo_check"', '23514');
      f.horas = Number(f.horas); f.solicitado_at = ahora(); f.habilitado_hasta = new Date(Date.now() + f.horas * 3600e3).toISOString();
      f.autor_id = p.id; f.autor_nombre = `${p.nombres} ${p.apellidos}`.trim(); f.anulada = false;
    }
    if (tabla === 'gestiones' || tabla === 'periodos' || tabla === 'cursos' || tabla === 'materias' || tabla === 'niveles') f.activo ??= true;
    return null;
  }
  hookActualizar(r, cambios) {
    const { db, tabla } = this; const T = db.T; const p = db.perfil;
    if (tabla === 'reportes') {
      if ('modo_evidencia' in cambios && cambios.modo_evidencia !== r.modo_evidencia) {
        if (cambios.modo_evidencia !== null && !['por_materia', 'bloque'].includes(cambios.modo_evidencia)) return err('new row for relation "reportes" violates check constraint "reportes_modo_evidencia_check"', '23514');
        if (T.respaldos.some((x) => x.reporte_id === r.id)) return err('No se puede cambiar el modo de evidencias: ya hay archivos subidos', '23514');
      }
      if (p.rol === 'tutor' && (r.estado === 'aprobado' || !puedeRegistrar(T, r.estudiante_id, r.periodo_id) || ['aprobado', 'observado'].includes(cambios.estado))) return err('new row violates row-level security policy for table "reportes"', '42501');
      if (cambios.estado === 'enviado' && r.estado !== 'enviado') { const e = this.validarEnvio({ ...r, ...cambios }); if (e) return e; cambios = { ...cambios, enviado_at: ahora(), enviado_por: p.id }; }
    }
    if (tabla === 'reporte_notas') { const e = this.validarNota({ ...r, ...cambios }); if (e) return e; }
    if (tabla === 'solicitudes_habilitacion' && Object.keys(cambios).some((k) => k !== 'anulada')) return err('permission denied for table solicitudes_habilitacion', '42501');
    Object.assign(r, cambios); this.despues(r); return null;
  }
  despues(f) { if (this.tabla === 'reporte_notas') recalcular(this.db.T, f.reporte_id); }
  validarEnvio(rep) {
    const T = this.db.T; const nivel = nivelDeEstudiante(T, rep.estudiante_id);
    const faltan = T.materias.filter((m) => m.nivel_id === nivel.id && m.activa).some((m) => !T.reporte_notas.some((n) => n.reporte_id === rep.id && n.materia_id === m.id));
    return faltan ? err('Faltan materias por completar: no se puede enviar el reporte', 'P0001') : null;
  }
  validarNota(n) {
    const T = this.db.T; const rep = T.reportes.find((r) => r.id === n.reporte_id); if (!rep) return err('Reporte inexistente', '23503');
    if (this.db.perfil.rol === 'tutor' && !(this.db.misEstudiantes().has(rep.estudiante_id) && puedeRegistrar(T, rep.estudiante_id, rep.periodo_id) && rep.estado !== 'aprobado')) return err('new row violates row-level security policy for table "reporte_notas"', '42501');
    const nivel = nivelDeEstudiante(T, rep.estudiante_id); const mat = T.materias.find((m) => m.id === n.materia_id);
    if (!mat || mat.nivel_id !== nivel.id) return err('La materia no pertenece al nivel del estudiante', 'P0001');
    if (n.nota !== null && n.nota !== undefined && !(Number(n.nota) >= 0 && Number(n.nota) <= 100)) return err('new row for relation "reporte_notas" violates check constraint "reporte_notas_nota_check"', '23514');
    if (nivel.tipo_evaluacion === 'cuantitativa') {
      if (n.nota === null || n.nota === undefined) return err('Este nivel exige una calificación numérica', 'P0001');
      if (n.valoracion || n.dimension) return err('Este nivel no admite valoración cualitativa', 'P0001');
    } else {
      if (n.nota !== null && n.nota !== undefined) return err('El nivel Inicial no admite notas numéricas', 'P0001');
      if (!n.valoracion) return err('El nivel Inicial exige una valoración cualitativa', 'P0001');
    }
    n.nota ??= null; n.dimension ??= null; n.valoracion ??= null; return null;
  }
}

/* ------------------------------ RPC y funciones ------------------------------ */
function rpc(db, nombre, a = {}) {
  const T = db.T; const p = db.perfil; const ok = (data = null) => ({ data, error: null }); const ko = (m, c) => ({ data: null, error: err(m, c) });
  if (!p) return ko('JWT requerido', '401');
  switch (nombre) {
    case 'estado_registro': {
      const per = T.periodos.find((x) => x.id === a.p_periodo); if (!per) return ok(null);
      const hs = T.solicitudes_habilitacion.filter((h) => h.periodo_id === a.p_periodo && h.estudiante_id === a.p_estudiante && !h.anulada && new Date(h.habilitado_hasta) > new Date());
      const est = T.estudiantes.find((e) => e.id === a.p_estudiante);
      return ok({ puede_registrar: puedeRegistrar(T, a.p_estudiante, a.p_periodo), periodo_estado: per.estado, fecha_cierre: per.fecha_cierre,
        dias_restantes: diffDias(per.fecha_cierre, isoDia(new Date())), habilitado_hasta: hs.map((h) => h.habilitado_hasta).sort().pop() ?? null, reportes_requeridos: requeridos(T, est, per) });
    }
    case 'crear_gestion': {
      if (!db.colegiosDueno().has(a.p_colegio)) return ko('Sin permiso sobre este colegio', '42501');
      const n = { trimestral: 3, bimestral: 4, semestral: 2 }[a.p_tipo]; const c = a.p_cierres ?? [];
      if (c.length !== n) return ko(`Un periodo ${a.p_tipo} requiere ${n} fechas de cierre`, 'P0001');
      let prev = a.p_inicio;
      for (let i = 0; i < n; i++) { if (!(c[i] > (i === 0 ? a.p_inicio : c[i - 1])) || c[i] > a.p_fin) return ko('Las fechas de cierre deben ser crecientes y estar dentro de la gestión', 'P0001'); }
      if (T.gestiones.some((g) => g.colegio_id === a.p_colegio && g.anio === Number(a.p_anio))) return ko('duplicate key value violates unique constraint "gestiones_colegio_id_anio_key"', '23505');
      T.gestiones.filter((g) => g.colegio_id === a.p_colegio).forEach((g) => { g.activa = false; });
      const gid = nuevoId(); T.gestiones.push({ id: gid, colegio_id: a.p_colegio, anio: Number(a.p_anio), tipo_periodo: a.p_tipo, fecha_inicio: a.p_inicio, fecha_fin: a.p_fin, activa: true });
      const nom = { trimestral: 'Trimestre', bimestral: 'Bimestre', semestral: 'Semestre' }[a.p_tipo]; const ord = ['Primer', 'Segundo', 'Tercer', 'Cuarto']; const hoy = isoDia(new Date());
      for (let i = 0; i < n; i++) {
        const ini = i === 0 ? a.p_inicio : isoDia(new Date(new Date(`${c[i - 1]}T00:00:00`).getTime() + 86400000));
        const estado = hoy >= ini && hoy <= c[i] ? 'abierto' : hoy > c[i] ? 'cerrado' : 'programado';
        T.periodos.push({ id: nuevoId(), colegio_id: a.p_colegio, gestion_id: gid, numero: i + 1, nombre: `${ord[i]} ${nom}`, fecha_inicio: ini, fecha_cierre: c[i], estado });
        prev = c[i];
      }
      db.guardar(); return ok(gid);
    }
    case 'crear_colegio': {
      if (p.rol !== 'superadmin') return ko('Solo el superadministrador puede crear colegios', '42501');
      if (String(a.p_nombre ?? '').trim().length < 3) return ko('new row for relation "colegios" violates check constraint "colegios_nombre_check"', '23514');
      const id = nuevoId(); T.colegios.push({ id, region_id: Number(a.p_region), nombre: a.p_nombre.trim(), codigo_sie: a.p_codigo_sie || null, ciudad: a.p_ciudad || null, direccion: a.p_direccion || null,
        director: a.p_director || null, activo: true, receptor_url: null, drive_verificado_at: null });
      sembrarCatalogo(T, id); db.guardar(); return ok(id);
    }
    case 'resumen_inquilinos': {
      if (p.rol !== 'superadmin') return ko('Acceso denegado', '42501');
      const n = (cid, rol) => T.usuario_colegios.filter((u) => u.colegio_id === cid && T.perfiles.find((x) => x.id === u.usuario_id && x.rol === rol && x.activo)).length;
      return ok(T.colegios.map((c) => ({ colegio_id: c.id, nombre: c.nombre, region_id: c.region_id, ciudad: c.ciudad, activo: c.activo !== false, drive_configurado: !!c.receptor_url,
        administradores: n(c.id, 'admin_colegio'), operadores: n(c.id, 'operador') })).sort((x, y) => x.nombre.localeCompare(y.nombre)));
    }
    case 'guardar_integracion': {
      if (!db.colegiosDueno().has(a.p_colegio)) return ko('Sin permiso sobre este colegio', '42501');
      let r = T.colegio_integraciones.find((x) => x.colegio_id === a.p_colegio); if (!r) { r = { colegio_id: a.p_colegio }; T.colegio_integraciones.push(r); }
      Object.assign(r, { whatsapp_proveedor: a.p_proveedor, whatsapp_api_url: a.p_api_url, whatsapp_instance: a.p_instance, whatsapp_activo: !!a.p_activo });
      if (a.p_token) r.whatsapp_token = a.p_token; db.guardar(); return ok();
    }
    case 'leer_integracion': {
      if (!db.colegiosDueno().has(a.p_colegio)) return ko('Sin permiso sobre este colegio', '42501');
      const r = T.colegio_integraciones.find((x) => x.colegio_id === a.p_colegio) ?? {};
      return ok({ whatsapp_proveedor: r.whatsapp_proveedor ?? null, whatsapp_api_url: r.whatsapp_api_url ?? null, whatsapp_instance: r.whatsapp_instance ?? null,
        whatsapp_activo: !!r.whatsapp_activo, tiene_token: !!r.whatsapp_token, receptor_url: T.colegios.find((c) => c.id === a.p_colegio)?.receptor_url ?? null });
    }
    default: return ko(`Función "${nombre}" inexistente`, '42883');
  }
}

const claveTemporal = () => `Tmp${Math.random().toString(36).slice(2, 7)}${Math.floor(10 + Math.random() * 89)}`;
const ROLES_CREABLES = { superadmin: ['admin_colegio'], admin_colegio: ['operador', 'tutor'], operador: ['tutor'], tutor: [] };
function gestionarUsuario(db, body = {}) {
  const T = db.T; const p = db.perfil; const fallo = (m) => ({ data: null, error: { message: m, context: { json: async () => ({ error: m }) } } });
  if (!p || !ROLES_CREABLES[p.rol]?.length) return fallo('No autorizado');
  const mios = p.rol === 'superadmin' ? null : db.colegiosAdmin();
  const colegiosDe = (id) => T.usuario_colegios.filter((u) => u.usuario_id === id).map((u) => u.colegio_id);
  const puedeAdministrar = (ob) => {
    if (p.rol === 'superadmin') return ob.rol === 'admin_colegio';
    if (ob.rol === 'tutor') { const t = T.tutores.find((x) => x.perfil_id === ob.id); return !!t && mios.has(t.colegio_id); }
    return p.rol === 'admin_colegio' && ob.rol === 'operador' && colegiosDe(ob.id).some((c) => mios.has(c));
  };
  if (body.accion === 'crear') {
    const usuario = String(body.username ?? '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{4,32}$/.test(usuario)) return fallo('El usuario debe tener de 4 a 32 caracteres: letras minúsculas, números, punto, guion o guion bajo.');
    if (!ROLES_CREABLES[p.rol].includes(body.rol)) return fallo(`Su rol no permite crear cuentas de tipo "${body.rol}".`);
    if (T.perfiles.some((x) => x.username === usuario)) return fallo('Ese usuario ya existe. Elija otro.');
    const id = `u-${nuevoId()}`; const clave = claveTemporal();
    if (body.rol === 'tutor') {
      const t = T.tutores.find((x) => x.id === body.tutor_id); if (!t || !mios.has(t.colegio_id)) return fallo('El tutor no pertenece a sus colegios.');
      if (t.perfil_id) return fallo('Ese tutor ya tiene un acceso. Use "Restablecer contraseña".'); t.perfil_id = id;
    } else {
      const cs = body.colegios ?? []; if (!cs.length) return fallo('Asigne al menos un colegio.');
      if (mios && cs.some((c) => !mios.has(c))) return fallo('Solo puede asignar colegios a su cargo.');
      cs.forEach((c) => T.usuario_colegios.push({ usuario_id: id, colegio_id: c }));
    }
    T.perfiles.push({ id, username: usuario, nombres: body.nombres, apellidos: body.apellidos ?? '', rol: body.rol, region_id: null, telefono: body.telefono ?? null, activo: true, debe_cambiar_password: true, created_at: ahora() });
    db.claves[usuario] = clave; db.guardar(); return { data: { ok: true, perfil_id: id, username: usuario, password_temporal: clave }, error: null };
  }
  if (body.accion === 'colegio_estado') {
    if (p.rol !== 'superadmin') return fallo('Solo el superadministrador suspende o reactiva colegios.');
    const c = T.colegios.find((x) => x.id === body.colegio_id); if (!c) return fallo('Colegio no encontrado.'); c.activo = !!body.activo; db.guardar(); return { data: { ok: true }, error: null };
  }
  const ob = T.perfiles.find((x) => x.id === body.perfil_id); if (!ob) return fallo('Usuario inexistente.');
  if (!puedeAdministrar(ob)) return fallo('No autorizado para este usuario.');
  if (body.accion === 'restablecer') { const clave = claveTemporal(); db.claves[ob.username] = clave; ob.debe_cambiar_password = true; db.guardar(); return { data: { ok: true, perfil_id: ob.id, username: ob.username, password_temporal: clave }, error: null }; }
  if (body.accion === 'activar') { if (ob.id === p.id) return fallo('No puede desactivarse a sí mismo.'); ob.activo = !!body.activo; db.guardar(); return { data: { ok: true }, error: null }; }
  if (body.accion === 'asignar') {
    if (!['admin_colegio', 'operador'].includes(ob.rol)) return fallo('Solo se asignan colegios a administradores y operadores.');
    const nuevos = body.colegios ?? []; if (!nuevos.length) return fallo('Asigne al menos un colegio.');
    if (mios && nuevos.some((c) => !mios.has(c))) return fallo('Solo puede asignar colegios a su cargo.');
    const actuales = colegiosDe(ob.id);
    T.usuario_colegios = T.usuario_colegios.filter((u) => !(u.usuario_id === ob.id && !nuevos.includes(u.colegio_id) && (!mios || mios.has(u.colegio_id))));
    nuevos.filter((c) => !actuales.includes(c)).forEach((c) => T.usuario_colegios.push({ usuario_id: ob.id, colegio_id: c }));
    db.guardar(); return { data: { ok: true }, error: null };
  }
  return fallo('Acción desconocida.');
}

/* ------------------------------ Evidencias (equivale a apps-script/Evidencias.gs) ------------------------------ */
function subirEvidencia(db, b) {
  const T = db.T; const p = db.perfil; const ko = (m, c = 'solicitud') => ({ data: null, error: err(m, c) });
  if (!p) return ko('Ingrese para continuar.', 'sesion');
  if (!MIMES[b.mime]) return ko('Tipo de archivo no permitido. Use PDF, Word o imagen (JPG/PNG).');
  const tam = Math.floor(String(b.b64 ?? '').length * 0.75); if (!tam) return ko('El archivo está vacío.'); if (tam > 15728640) return ko('El archivo supera los 15 MB. Redúzcalo o divídalo.');
  const rp = T.reportes.find((x) => x.id === b.reporte_id); if (!rp || !db.visible('reportes', rp)) return ko('Reporte no encontrado.', 'no_encontrado');
  if (p.rol === 'superadmin') return ko('No puede subir evidencias a este reporte (periodo cerrado o reporte aprobado).', 'prohibido');
  if (rp.estado === 'aprobado' || (p.rol === 'tutor' && !puedeRegistrar(T, rp.estudiante_id, rp.periodo_id))) return ko('No puede subir evidencias a este reporte (periodo cerrado o reporte aprobado).', 'prohibido');
  if (!rp.modo_evidencia) return ko('Primero elija si subirá evidencias por materia o en un solo bloque.');
  let mat = null;
  if (rp.modo_evidencia === 'por_materia') { mat = T.materias.find((m) => m.id === b.materia_id && m.colegio_id === rp.colegio_id); if (!mat) return ko(b.materia_id ? 'Materia inválida.' : 'Indique la materia de esta evidencia.'); }
  else if (b.materia_id) return ko('Este reporte usa un solo bloque de evidencias.');
  const col = T.colegios.find((c) => c.id === rp.colegio_id);
  if (!col || col.activo === false) return ko('El colegio está suspendido.', 'prohibido');
  if (!col.receptor_url) return ko('El administrador de su colegio aún no conectó su Google Drive. Avísele para poder subir evidencias.', 'drive_no_autorizado');
  const e = T.estudiantes.find((x) => x.id === rp.estudiante_id); const per = T.periodos.find((x) => x.id === rp.periodo_id); const ges = T.gestiones.find((x) => x.id === per.gestion_id);
  const previas = T.respaldos.filter((r) => r.reporte_id === rp.id && (r.materia_id ?? null) === (mat?.id ?? null));
  const seq = Math.max(0, ...previas.map((r) => r.secuencia)) + 1; if (seq > 999) return ko('Se alcanzó el máximo de 999 archivos para este reporte.');
  const nombre = nombreEvidencia({ numero: e.numero, periodo: per.numero, tipoPeriodo: ges.tipo_periodo, materia: mat?.abreviatura, mes: rp.tipo === 'mensual' ? numeroMes(per.fecha_inicio, rp.mes_referencia) : null, secuencia: seq, mime: b.mime });
  const id = nuevoId();
  T.respaldos.push({ id, colegio_id: rp.colegio_id, reporte_id: rp.id, materia_id: mat?.id ?? null, nombre_original: String(b.nombre ?? nombre).slice(0, 80), nombre_archivo: nombre, secuencia: seq,
    mime_type: b.mime, tamano_bytes: tam, drive_file_id: `demo-${id}`, drive_url: 'https://drive.google.com/', subido_por: p.id, created_at: ahora() });
  if (tam < 500000) db.storage[id] = { b64: b.b64 };
  db.guardar(); return { data: { id, nombre_archivo: nombre, secuencia: seq }, error: null };
}

/* ------------------------------ Cliente ------------------------------ */
export function crearClienteDemo() {
  const db = new Demo();
  const fallo = (m, c = 'solicitud') => ({ data: null, error: err(m, c) });
  /** Equivale a asignaciones_() de Apps Script: colegios activos (y hijos del tutor) del perfil. */
  const asignaciones = (p) => {
    const T = db.T; let colegios = []; let hijos = [];
    if (p.rol === 'superadmin') colegios = T.colegios;
    else { const ids = db.colegiosAdmin(); colegios = T.colegios.filter((c) => ids.has(c.id)); }
    if (p.rol === 'tutor') hijos = T.estudiantes.filter((e) => db.misEstudiantes().has(e.id) && e.estado === 'activo')
      .map((e) => ({ id: e.id, colegio_id: e.colegio_id, numero: e.numero, nombres: e.nombres, apellido_paterno: e.apellido_paterno, apellido_materno: e.apellido_materno, estado: e.estado }));
    const pub = colegios.map((c) => ({ id: c.id, nombre: c.nombre, ciudad: c.ciudad, region_id: c.region_id, activo: c.activo !== false, drive_ok: !!c.receptor_url }));
    return { perfil: clon(p), colegios: pub, hijos };
  };
  const cargar = (p) => { const a = asignaciones(p); if (p.rol !== 'superadmin' && !a.colegios.length) return { error: { status: 400, code: 'suspendido', message: 'Su colegio está suspendido o aún no tiene colegios asignados. Consulte con su administrador.' } };
    contexto.cargar({ rol: p.rol, colegios: a.colegios, hijos: a.hijos }); return { a }; };
  return {
    esDemo: true,
    contexto,
    auth: {
      async signInWithPassword({ usuario, password }) {
        const perfil = db.T.perfiles.find((p) => p.username === usuario);
        if (!perfil || db.claves[usuario] !== password || !perfil.activo) return { data: null, error: { status: 400, message: 'Usuario o contraseña incorrectos.', code: 'credenciales' } };
        db.sesion = perfil.id; const r = cargar(perfil); if (r.error) { db.sesion = null; return { data: null, error: r.error }; }
        db.guardar(); return { data: { user: { id: perfil.id } }, error: null };
      },
      async getSession() {
        if (!db.sesion) return { data: { session: null }, error: null };
        const r = cargar(db.perfil); if (r.error) return { data: { session: null }, error: null };
        return { data: { session: { user: { id: db.sesion } } }, error: null };
      },
      perfil: () => (db.perfil ? clon(db.perfil) : null),
      async updateUser({ password, actual }) {
        if (!db.perfil) return { data: null, error: { message: 'No autenticado' } };
        if (db.claves[db.perfil.username] !== actual) return { data: null, error: { message: 'La clave actual no es correcta' } };
        if (password === actual) return { data: null, error: { message: 'La nueva clave debe ser distinta de la actual' } };
        db.claves[db.perfil.username] = password; db.perfil.debe_cambiar_password = false; db.guardar(); return { data: { user: { id: db.sesion } }, error: null };
      },
      async signOut() { db.sesion = null; db.guardar(); contexto.limpiar(); return { error: null }; },
    },
    from: (t) => new Consulta(db, t),
    async rpc(nombre, args) { return rpc(db, nombre, args); },
    functions: { async invoke(nombre, { body } = {}) { return nombre === 'gestionar-usuario' ? gestionarUsuario(db, body) : { data: null, error: { message: 'Función inexistente' } }; } },
    // Drive por colegio (equivale a apps-script/Drive.gs). En demostración no se consulta Google.
    drive: {
      async estado(colegioId) {
        const c = db.T.colegios.find((x) => x.id === colegioId); if (!c || !db.colegiosAdmin().has(c.id)) return fallo('Colegio no encontrado.', 'no_encontrado');
        return { data: { colegio_id: c.id, configurado: !!c.receptor_url, accesible: !!c.receptor_url, nombre_carpeta: c.receptor_url ? 'JeaDas.Insights - Evidencias' : null,
          cuenta: c.receptor_url ? 'administrador.demo@gmail.com' : null, motivo: null, verificado_at: c.drive_verificado_at ?? null }, error: null };
      },
      async preparar(colegioId) {
        if (!db.colegiosDueno().has(colegioId)) return fallo('Solo el administrador de este colegio puede configurar su Drive.', 'prohibido');
        const c = db.T.colegios.find((x) => x.id === colegioId); c.receptor_clave_demo = true; db.guardar();
        return { data: { clave: 'demo' + Array.from({ length: 28 }, () => 'abcdef0123456789'[Math.floor(Math.random() * 16)]).join('') }, error: null };
      },
      async registrar(colegioId, texto) {
        if (!db.colegiosDueno().has(colegioId)) return fallo('Solo el administrador de este colegio puede configurar su Drive.', 'prohibido');
        const url = String(texto ?? '').trim();
        if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) return fallo('Pegue la URL de su receptor: debe empezar con https://script.google.com/macros/s/ y terminar en /exec.');
        if (db.T.colegios.some((x) => x.id !== colegioId && x.receptor_url === url)) return fallo('Ese receptor ya está registrado por otro colegio. Cada colegio necesita el suyo.');
        const c = db.T.colegios.find((x) => x.id === colegioId); if (!c.receptor_clave_demo) return fallo('Primero genere su código en el paso 1.');
        c.receptor_url = url; c.drive_verificado_at = ahora(); db.guardar();
        const col = contexto.colegios.find((x) => x.id === colegioId); if (col) col.drive_ok = true;
        return { data: { ok: true, nombre_carpeta: 'JeaDas.Insights - Evidencias', cuenta: 'administrador.demo@gmail.com' }, error: null };
      },
      async quitar(colegioId) {
        if (!db.colegiosDueno().has(colegioId)) return fallo('Solo el administrador de este colegio puede configurar su Drive.', 'prohibido');
        const c = db.T.colegios.find((x) => x.id === colegioId); c.receptor_url = null; c.drive_verificado_at = null; db.guardar();
        const col = contexto.colegios.find((x) => x.id === colegioId); if (col) col.drive_ok = false;
        return { data: { ok: true }, error: null };
      },
    },
    evidencias: {
      async subir(b) { return subirEvidencia(db, b); },
      async ver(id) {
        const r = db.T.respaldos.find((x) => x.id === id);
        if (!r || !db.visible('respaldos', r)) return { data: null, error: err('No tiene acceso a esta evidencia.', 'prohibido') };
        const g = db.storage[id];
        return { data: { nombre: r.nombre_archivo, mime: g?.b64 ? r.mime_type : 'text/plain', b64: g?.b64 ?? btoa('Vista de demostración: en el sistema real aquí se muestra el archivo guardado en el Drive del administrador.') }, error: null };
      },
      async borrar(id) {
        const r = db.T.respaldos.find((x) => x.id === id); if (!r || !db.visible('respaldos', r)) return { data: null, error: err('No tiene acceso a esta evidencia.', 'prohibido') };
        db.T.respaldos.splice(db.T.respaldos.indexOf(r), 1); delete db.storage[id]; db.guardar(); return { data: { ok: true }, error: null };
      },
    },
    _db: db,
  };
}
