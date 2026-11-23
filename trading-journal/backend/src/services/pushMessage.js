/**
 * Mensajes push a partir de las tarjetas nuevas de la bandeja (§3.3 de la spec
 * de notificaciones push). Funciones puras.
 *
 * El texto no se arma aquí: lo arma el service worker con el mismo módulo que
 * las tarjetas (frontend/src/utils/notificationText.js), a partir del payload.
 */

const HOUR_MS = 3_600_000;

/** Tipos de tarjeta que generan aviso. La tesis invalidada solo queda en la bandeja. */
export const PUSH_TYPES = [
  'price_alert_hit',
  'price_alert_near',
  'price_alert_deadline',
  'price_alert_delisted',
  'date_reminder_due',
];

// Si un usuario tiene varias tarjetas de la misma alerta en el lote, se avisa solo
// de la más importante. La cercanía va antes que la fecha límite: al vencer, la
// alerta sigue armada y el "cerca de" es lo urgente.
const PRIORITY = {
  price_alert_hit: 4,
  price_alert_delisted: 3,
  price_alert_near: 2,
  price_alert_deadline: 1,
  date_reminder_due: 0,
};

// Recorte del payload para no acercarse a los ~4 KB de Web Push. El test de
// paridad del frontend (utils/notificationText.test.js) replica estas listas:
// si cambian, cambiarlas también allí.
export const OMITTED_PAYLOAD_FIELDS = ['sibling_alerts', 'block_excerpt'];
export const TRIMMED_PAYLOAD_FIELDS = ['message', 'note_title'];
export const TRIM_LENGTH = 200;

export const MAX_AGE_MS = 24 * HOUR_MS; // un aviso de hace días es ruido
export const SUMMARY_THRESHOLD = 3; // más mensajes por usuario → un resumen
const SUMMARY_SYMBOLS = 3;

const NEAR_TTL_SECONDS = 4 * 3600; // un "cerca de" que llega 20 h tarde es ruido
const DEFAULT_TTL_SECONDS = 24 * 3600;

/** Tag de la notificación: una nueva de la misma alerta reemplaza a la anterior. */
export const tagFor = (card) => {
  if (card.price_alert_id) return `pa-${card.price_alert_id}`;
  if (card.date_reminder_id) return `dr-${card.date_reminder_id}`;
  return `card-${card.id}`; // la alerta o el recordatorio se borró entre medias
};

// Por puntos de código, no por unidades UTF-16: así no se parte un emoji
const trimText = (value) => {
  if (typeof value !== 'string') return value;
  const chars = Array.from(value);
  return chars.length > TRIM_LENGTH ? `${chars.slice(0, TRIM_LENGTH).join('')}…` : value;
};

export const trimPayload = (payload) => {
  const trimmed = { ...(payload || {}) };
  for (const field of OMITTED_PAYLOAD_FIELDS) delete trimmed[field];
  for (const field of TRIMMED_PAYLOAD_FIELDS) {
    if (field in trimmed) trimmed[field] = trimText(trimmed[field]);
  }
  return trimmed;
};

const iso = (value) => new Date(value).toISOString();

const cardMessage = (card) => ({
  v: 1,
  kind: 'card',
  id: card.id,
  type: card.type,
  tag: tagFor(card),
  created_at: iso(card.created_at),
  payload: trimPayload(card.payload),
});

// Sin tag: dos resúmenes seguidos se apilan en vez de que el segundo esconda al primero
const summaryMessage = (cards) => {
  const byImportance = [...cards].sort((a, b) => PRIORITY[b.type] - PRIORITY[a.type] || a.id - b.id);
  const symbols = [];
  for (const card of byImportance) {
    const symbol = card.payload?.symbol;
    if (symbol && !symbols.includes(symbol)) symbols.push(symbol);
    if (symbols.length === SUMMARY_SYMBOLS) break;
  }
  const latest = Math.max(...cards.map((card) => new Date(card.created_at).getTime()));
  return { v: 1, kind: 'summary', count: cards.length, symbols, created_at: iso(latest) };
};

/**
 * @param {Array} cards filas de `notificationRepo.findCreatedAfter` (ORDER BY id)
 * @param {number} [nowMs]
 * @returns {Map<number, object[]>} mensajes por usuario
 */
export const buildPushMessages = (cards, nowMs = Date.now()) => {
  const byUser = new Map(); // userId → Map(tag → tarjeta que gana)
  for (const card of cards) {
    if (!PUSH_TYPES.includes(card.type)) continue;
    if (nowMs - new Date(card.created_at).getTime() > MAX_AGE_MS) continue;

    const tag = tagFor(card);
    const userCards = byUser.get(card.user_id) ?? new Map();
    const current = userCards.get(tag);
    // A igual prioridad gana la más nueva (las tarjetas llegan por id)
    if (!current || PRIORITY[card.type] >= PRIORITY[current.type]) userCards.set(tag, card);
    byUser.set(card.user_id, userCards);
  }

  const messages = new Map();
  for (const [userId, userCards] of byUser) {
    const kept = [...userCards.values()];
    messages.set(userId, kept.length > SUMMARY_THRESHOLD ? [summaryMessage(kept)] : kept.map(cardMessage));
  }
  return messages;
};

/** Cuánto guarda el servicio de push el mensaje si el dispositivo está offline (s). */
export const ttlFor = (message) =>
  message.kind === 'card' && message.type === 'price_alert_near' ? NEAR_TTL_SECONDS : DEFAULT_TTL_SECONDS;

/**
 * Topic de Web Push: con el dispositivo offline, el servicio reemplaza el mensaje
 * pendiente por el siguiente de la misma alerta. El resumen va sin topic (null):
 * con uno, un dispositivo offline solo recibiría el último resumen.
 */
export const topicFor = (message) => (message.kind === 'card' ? message.tag : null);
