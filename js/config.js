// config.js · ÚNICO archivo que se edita en GitHub.
// Pegue aquí la URL de la implementación de Apps Script (termina en /exec). Nada más.
// No hay claves, tokens ni conexiones a bases de datos en el navegador: todo vive en Apps Script.
export const API_URL = 'https://script.google.com/macros/s/AKfycbxAvXRGA_IRyjiqoKEuIeIMgmg_P9rpkODd58EQWF92WWkXwGPzzgQL72V9neTQDjho/exec';

// Mientras no pegue la URL, la app funciona en MODO DEMOSTRACIÓN con datos ficticios guardados en el navegador.
export const DEMO = !/^https:\/\/script\.google\.com\/.+\/exec$/.test(API_URL);

// Textos y límites (no son secretos).
export const CONFIG = {
  NOMBRE_APP: 'JeaDas.Insights',
  SUBTITULO: 'Gestor Calificaciones HS',          // Denominación oficial: "JeaDas.Insights - Gestor Calificaciones HS"
  TAMANO_MAX_RESPALDO: 15 * 1024 * 1024,           // 15 MB por archivo (límite estricto)
};
