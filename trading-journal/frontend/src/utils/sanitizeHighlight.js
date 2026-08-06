// Sanitiza el HTML de los snippets de búsqueda (ts_headline de Postgres).
//
// ts_headline NO escapa el HTML del contenido original: solo envuelve los matches
// con <b>...</b> (StartSel/StopSel por defecto). Si una nota contiene, p. ej.,
// `<img src=x onerror=alert(1)>`, ese markup llega crudo y se inyectaba con
// dangerouslySetInnerHTML → XSS almacenado.
//
// Estrategia: escapar TODO el HTML y luego re-insertar únicamente las etiquetas
// de resaltado <b>/</b> que añade ts_headline. El resultado solo puede contener
// esas dos etiquetas; cualquier otro tag queda como texto visible.
export const sanitizeHighlight = (html) => {
  if (html == null) return '';
  const escaped = String(html)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Restaurar solo los delimitadores de resaltado de ts_headline.
  return escaped.replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>');
};
