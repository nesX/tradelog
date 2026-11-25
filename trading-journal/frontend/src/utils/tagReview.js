import { groupTags } from '../constants/tagGroups.js';

// Helpers puros de la pestaña "Por tag" de Repaso: el estado en la URL
// (?tab=tags&tags=1,4,7&order=chrono), el orden de los resultados y el título del
// visor. Sin window/document: lo prueba `node --test` (tagReview.test.js).

export const REVIEW_ORDERS = [
  { key: 'chrono', label: 'Cronológico' },
  { key: 'recent', label: 'Recientes primero' },
  { key: 'random', label: 'Aleatorio' },
];
export const DEFAULT_REVIEW_ORDER = 'chrono';

/** Ids del parámetro `tags` ("1,4,7"): enteros positivos, sin repetir. */
export const parseTagIdsParam = (value) => {
  if (!value) return [];
  const ids = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
  return [...new Set(ids)];
};

/** Valor del parámetro `tags`: ids ordenados (la misma selección, la misma URL). */
export const formatTagIdsParam = (ids) => [...new Set(ids)].sort((a, b) => a - b).join(',');

export const parseOrderParam = (value) =>
  REVIEW_ORDERS.some((o) => o.key === value) ? value : DEFAULT_REVIEW_ORDER;

/** Fisher-Yates sobre una copia; `random` inyectable para los tests. */
export const shuffle = (list, random = Math.random) => {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const byCreatedAt = (a, b) => new Date(a.created_at) - new Date(b.created_at) || a.block_id - b.block_id;

/**
 * Items del repaso en el orden elegido. Para 'random' hace falta `randomOrder`, la
 * lista de block_id ya barajada (se baraja una vez por conjunto de resultados, no
 * en cada refetch); los items que no estén ahí van al final.
 */
export const sortReviewItems = (items, order, randomOrder = []) => {
  if (order === 'recent') return [...items].sort((a, b) => byCreatedAt(b, a));
  if (order === 'random') {
    const position = new Map(randomOrder.map((id, i) => [id, i]));
    const at = (item) => position.get(item.block_id) ?? Infinity;
    return [...items].sort((a, b) => at(a) - at(b) || byCreatedAt(a, b));
  }
  return [...items].sort(byCreatedAt);
};

/**
 * Título del visor desde la selección, en orden canónico: grupos separados por
 * " · " y tags del mismo grupo por ", ". Ej.: "NQ · proyección, trade perdido".
 */
export const buildReviewTitle = (selectedTags) =>
  groupTags(selectedTags)
    .map((group) => group.tags.map((t) => t.name).join(', '))
    .join(' · ');
