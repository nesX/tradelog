/**
 * Evaluación de velas de 1h contra una alerta de precio. Función pura: sin BD,
 * sin red y sin reloj (el instante actual llega como parámetro), para testearla
 * aislada. Spec: §3.3 de docs/features/specs/alertas-de-precio-en-notas.md.
 *
 * Reglas:
 *   - Se ignoran las velas que cerraron antes del armado (openTime + 1h <= armed_at).
 *   - En la vela que contiene armed_at solo cuenta el close: su high/low puede
 *     venir de antes de crear la alerta.
 *   - Cercanía (si near_pct y near_at IS NULL), siempre por toque.
 *   - Recordatorio normal: dispara por toque (high/low).
 *   - Invalidación: solo por el close de una vela de 23:00 UTC ya cerrada
 *     (el cierre diario de Binance).
 */

export const HOUR_MS = 60 * 60 * 1000;

const toMs = (value) => (value instanceof Date ? value.getTime() : new Date(value).getTime());

const isDailyCloseCandle = (candle) => new Date(candle.openTime).getUTCHours() === 23;

const nearLevel = (alert) =>
  alert.direction === 'above'
    ? alert.target_price * (1 - alert.near_pct / 100)
    : alert.target_price * (1 + alert.near_pct / 100);

const reaches = (alert, value, level) => (alert.direction === 'above' ? value >= level : value <= level);

/**
 * ¿El precio ya está dentro de la banda de aviso previo? (create y re-armado:
 * en ese caso el aviso de este armado se da por omitido). Incluye el precio que
 * ya cruzó el nivel.
 */
export const isWithinNearBand = (alert, price) => {
  if (alert.near_pct == null || price == null) return false;
  return reaches(alert, price, nearLevel(alert));
};

/**
 * @param {{ direction: 'above'|'below', target_price: number, is_invalidation: boolean,
 *           near_pct: number|null, near_at: any, armed_at: Date|string }} alert
 *   NUMERIC ya convertidos a Number.
 * @param {Array<{ openTime: number, high: number, low: number, close: number }>} candles
 *   Ordenadas por openTime (ms, UTC).
 * @param {number} nowMs Instante PREVIO a la petición de velas: una vela de 23:00
 *   que cierra mientras la petición viaja no se da por cerrada con un close parcial.
 * @returns {{ near: object|null, hit: object|null, nearValue: number|null, hitValue: number|null }}
 *   near/hit: la primera vela que cumple. nearValue/hitValue: el precio que cumplió
 *   (high/low del toque o el close). Si hay disparo y cercanía en la misma pasada,
 *   el job emite solo la tarjeta del disparo.
 */
export const evaluateAlert = (alert, candles, nowMs) => {
  const armedMs = toMs(alert.armed_at);
  const checkNear = alert.near_pct != null && alert.near_at == null;
  const nearAt = checkNear ? nearLevel(alert) : null;
  const above = alert.direction === 'above';

  const result = { near: null, hit: null, nearValue: null, hitValue: null };

  for (const candle of candles) {
    const closeMs = candle.openTime + HOUR_MS;
    if (closeMs <= armedMs) continue;

    // Vela del armado: solo el close. Resto: el extremo en la dirección de la alerta.
    const isArmCandle = candle.openTime <= armedMs;
    const touch = isArmCandle ? candle.close : above ? candle.high : candle.low;

    if (checkNear && !result.near && reaches(alert, touch, nearAt)) {
      result.near = candle;
      result.nearValue = touch;
    }

    if (alert.is_invalidation) {
      if (isDailyCloseCandle(candle) && closeMs <= nowMs && reaches(alert, candle.close, alert.target_price)) {
        result.hit = candle;
        result.hitValue = candle.close;
      }
    } else if (reaches(alert, touch, alert.target_price)) {
      result.hit = candle;
      result.hitValue = touch;
    }

    if (result.hit) break;
  }

  return result;
};
