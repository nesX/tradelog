import { config } from '../config/env.js';

/**
 * Cliente de la API pública de Binance Futures USDⓈ-M (datos de mercado, sin API key).
 *
 * Todo lo que la app pide a Binance pasa por aquí, que es donde viven las
 * protecciones contra un baneo de la IP (compartida con market-tracker):
 *   - guarda el contador de peso de la IP (`x-mbx-used-weight-1m`);
 *   - circuit breaker ante 429/418: hasta `Retry-After` no se toca la red;
 *   - timeout de 10 s por petición.
 *
 * No toca la BD: persistir el backoff en `reminder_job_state` es cosa de los
 * services, que lo restauran al arrancar con `setBackoffUntil`.
 */

const TIMEOUT_MS = 10_000;
const WEIGHT_WINDOW_MS = 60_000;
// Backoff cuando la respuesta no trae Retry-After
const DEFAULT_BACKOFF_MS = { 429: 60_000, 418: 5 * 60_000 };
const INVALID_SYMBOL_CODE = -1121;

export class BinanceBackoffError extends Error {
  constructor(retryAfter) {
    super(`Binance en backoff hasta ${retryAfter.toISOString()}`);
    this.name = 'BinanceBackoffError';
    this.retryAfter = retryAfter;
  }
}

export class BinanceInvalidSymbolError extends Error {
  constructor(symbol) {
    super(`Símbolo inválido en Binance Futures: ${symbol}`);
    this.name = 'BinanceInvalidSymbolError';
    this.symbol = symbol;
  }
}

let usedWeight = 0;
let usedWeightAt = 0;
let backoffUntil = null;

/**
 * Último `x-mbx-used-weight-1m` leído. Pasado un minuto la ventana de Binance
 * ya se reinició, así que una lectura vieja cuenta como 0.
 */
export const getUsedWeight = () =>
  Date.now() - usedWeightAt < WEIGHT_WINDOW_MS ? usedWeight : 0;

export const setBackoffUntil = (date) => {
  backoffUntil = date ? new Date(date) : null;
};

/** Fecha hasta la que no se llama a Binance, o null si no hay backoff vigente. */
export const getBackoffUntil = () =>
  backoffUntil && backoffUntil.getTime() > Date.now() ? backoffUntil : null;

const request = async (path, params = {}) => {
  const blockedUntil = getBackoffUntil();
  if (blockedUntil) throw new BinanceBackoffError(blockedUntil);

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const qs = search.toString();
  const url = `${config.binance.futuresApiUrl}${path}${qs ? `?${qs}` : ''}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });

  const weight = res.headers.get('x-mbx-used-weight-1m');
  if (weight !== null && Number.isFinite(Number(weight))) {
    usedWeight = Number(weight);
    usedWeightAt = Date.now();
  }

  if (res.status === 429 || res.status === 418) {
    const retryAfterSec = Number(res.headers.get('retry-after'));
    const ms = retryAfterSec > 0 ? retryAfterSec * 1000 : DEFAULT_BACKOFF_MS[res.status];
    backoffUntil = new Date(Date.now() + ms);
    throw new BinanceBackoffError(backoffUntil);
  }

  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch {
      // cuerpo no JSON: el error genérico lleva solo el status
    }
    if (res.status === 400 && body?.code === INVALID_SYMBOL_CODE) {
      throw new BinanceInvalidSymbolError(params.symbol);
    }
    const err = new Error(`Binance respondió ${res.status} en ${path}: ${body?.msg ?? res.statusText}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return res.json();
};

/**
 * Velas de 1h desde `startTimeMs` (incluida la vela en curso, con su high/low parcial).
 * Peso: 1 (limit < 100), 2 (< 500), 5 (≤ 1000).
 * @returns {Promise<Array<{ openTime: number, high: number, low: number, close: number }>>}
 */
export const getHourlyKlines = async (symbol, startTimeMs, limit) => {
  const rows = await request('/fapi/v1/klines', {
    symbol,
    interval: '1h',
    startTime: startTimeMs,
    limit,
  });
  return rows.map((k) => ({
    openTime: Number(k[0]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
  }));
};

/**
 * Catálogo completo de contratos (peso 1). `tickSize` sale del filtro
 * PRICE_FILTER (no de `pricePrecision`, que no es el tick) y se deja como string
 * para no perder precisión al guardarlo en NUMERIC.
 */
export const getExchangeInfo = async () => {
  const body = await request('/fapi/v1/exchangeInfo');
  return (body.symbols || []).map((s) => ({
    symbol: s.symbol,
    contractType: s.contractType,
    status: s.status,
    baseAsset: s.baseAsset,
    quoteAsset: s.quoteAsset,
    tickSize: s.filters?.find((f) => f.filterType === 'PRICE_FILTER')?.tickSize ?? null,
  }));
};

/**
 * Último precio de todos los contratos en una sola llamada (sin `symbol`, peso 2).
 * @returns {Promise<Map<string, { price: number, time: number }>>}
 */
export const getAllPrices = async () => {
  const rows = await request('/fapi/v2/ticker/price');
  return new Map(rows.map((r) => [r.symbol, { price: Number(r.price), time: Number(r.time) }]));
};
