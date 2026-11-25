import { buildReviewTitle } from './tagReview.js';

// Helpers puros de la página /buscar. Sin window/document: lo prueba `node --test`
// (noteSearch.test.js).

/**
 * ¿Hay algo que buscar en `q`? Mismo criterio que buildSearchQuery del backend:
 * sin letras ni dígitos ("???") no hay texto, y sin tags no se consulta.
 */
export const hasSearchText = (q) => /[\p{L}\p{N}]/u.test(q ?? '');

const plural = (n, singular, pluralForm) => `${n} ${n === 1 ? singular : pluralForm}`;

/** "14 notas · 52 bloques", o "mostrando 30 de 45 notas · 52 bloques" si hay más notas que las devueltas. */
export const formatSearchSummary = ({ notes, total_notes: totalNotes, total_blocks: totalBlocks }) => {
  const notesText =
    totalNotes > notes.length ? `mostrando ${notes.length} de ${totalNotes} notas` : plural(totalNotes, 'nota', 'notas');
  return `${notesText} · ${plural(totalBlocks, 'bloque', 'bloques')}`;
};

/** Título del visor: "Búsqueda · “proyec” · NQ · Swing, Scalping" (tags en el orden de `groups`). */
export const buildSearchTitle = (q, selectedTags = [], groups) =>
  ['Búsqueda', hasSearchText(q) ? `“${q.trim()}”` : null, buildReviewTitle(selectedTags, groups)]
    .filter(Boolean)
    .join(' · ');
