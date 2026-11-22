/**
 * Payload de las tarjetas de la bandeja (§3.6 de la spec de recordatorios de
 * análisis): una foto tomada al crear la tarjeta, para que se entienda aunque
 * luego se borre la nota, la alerta o el recordatorio. Funciones puras.
 */

export const EXCERPT_LENGTH = 280;

/** Texto plano a partir del markdown de un bloque. */
export const stripMarkdown = (text) =>
  String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ') // bloques de código
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // imágenes
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → su texto
    .replace(/^[ \t]*:::[ \t]*[\w-]*(?:\[([^\]\n]*)\])?[^\n]*$/gm, '$1') // directivas :::more[título] … :::
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '') // encabezados
    .replace(/^[ \t]*>[ \t]?/gm, '') // citas
    .replace(/^[ \t]*(?:[-*+]|\d+\.)[ \t]+(?:\[[ xX]\][ \t]+)?/gm, '') // listas y checkboxes
    .replace(/[*_`~]+/g, '') // énfasis y código en línea
    .replace(/\s+/g, ' ')
    .trim();

/** Primeros ~280 caracteres del contenido, sin markdown; null si queda vacío. */
export const buildExcerpt = (content, max = EXCERPT_LENGTH) => {
  const text = stripMarkdown(content);
  if (!text) return null;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

const iso = (value) => (value == null ? null : new Date(value).toISOString());

/**
 * Datos del anclaje que comparten todas las tarjetas. `row` es una alerta o un
 * recordatorio leído con su anclaje (note_id derivado del bloque, note_title y
 * anchor_content: el contenido del bloque o, en anclajes de nota, el del primer
 * bloque de texto).
 */
const anchorFields = (row) => ({
  note_id: row.note_id,
  note_title: row.note_title ?? null,
  block_id: row.block_id ?? null,
  block_excerpt: buildExcerpt(row.anchor_content),
});

/**
 * @param {object} params
 * @param {object} params.alert   Alerta con su anclaje y los datos del símbolo
 *                                (contract_type, last_price).
 * @param {object|null} params.candle       Vela que disparó o dio la cercanía; null en
 *                                          fecha límite y deslistado.
 * @param {number|null} params.candleValue  high/low del toque o close del cierre diario.
 * @param {number|null} params.lastPrice    Último precio conocido del símbolo.
 * @param {Array} [params.siblings]         Solo en invalidaciones: las otras alertas
 *                                          activas del mismo anclaje.
 */
export const buildPriceAlertPayload = ({ alert, candle = null, candleValue = null, lastPrice = null, siblings }) => {
  const payload = {
    symbol: alert.symbol,
    contract_type: alert.contract_type ?? null,
    direction: alert.direction,
    target_price: alert.target_price,
    is_invalidation: alert.is_invalidation,
    near_pct: alert.near_pct ?? null,
    price_at_creation: alert.price_at_creation ?? null,
    armed_at: iso(alert.armed_at),
    deadline_at: iso(alert.deadline_at),
    candle_open_time: candle ? iso(candle.openTime) : null,
    candle_value: candle ? candleValue : null,
    last_price: lastPrice ?? alert.last_price ?? null,
    message: alert.message ?? null,
    ...anchorFields(alert),
  };
  if (siblings) {
    payload.sibling_alerts = siblings.map((s) => ({
      id: s.id,
      symbol: s.symbol,
      direction: s.direction,
      target_price: s.target_price,
      is_invalidation: s.is_invalidation,
    }));
  }
  return payload;
};

export const buildDateReminderPayload = (reminder) => ({
  remind_at: iso(reminder.remind_at),
  message: reminder.message ?? null,
  ...anchorFields(reminder),
});
