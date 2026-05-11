/**
 * Utilidades para generar y parsear URLs públicas de notas y bloques.
 *
 * Formato:
 *   /notes/{noteId}                 → referencia a nota completa
 *   /notes/{noteId}#block-{blockId} → referencia a un bloque específico
 *
 * Los IDs son enteros (no UUIDs).
 */

const getBaseUrl = () =>
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : '';

export const buildNoteUrl = (noteId) => `${getBaseUrl()}/notes/${noteId}`;

export const buildBlockUrl = (noteId, blockId) =>
  `${getBaseUrl()}/notes/${noteId}#block-${blockId}`;

const REFERENCE_REGEX = /\/notes\/(\d+)(?:#block-(\d+))?/i;

export const parseReferenceUrl = (input) => {
  if (!input || typeof input !== 'string') return null;
  const match = input.trim().match(REFERENCE_REGEX);
  if (!match) return null;

  const noteId = parseInt(match[1], 10);
  if (!Number.isFinite(noteId) || noteId <= 0) return null;

  const blockId = match[2] ? parseInt(match[2], 10) : null;
  if (blockId !== null && (!Number.isFinite(blockId) || blockId <= 0)) return null;

  return { noteId, blockId };
};

// ----------------------------------------------------------------
// Referencias a trades
// Formato: /?trade={id} (query param sobre Home)
// ----------------------------------------------------------------

export const buildTradeUrl = (tradeId) => `${getBaseUrl()}/?trade=${tradeId}`;

const TRADE_REGEX = /[?&]trade=(\d+)/;

export const parseTradeUrl = (input) => {
  if (!input || typeof input !== 'string') return null;
  const match = input.trim().match(TRADE_REGEX);
  if (!match) return null;
  const tradeId = parseInt(match[1], 10);
  if (!Number.isFinite(tradeId) || tradeId <= 0) return null;
  return { tradeId };
};
