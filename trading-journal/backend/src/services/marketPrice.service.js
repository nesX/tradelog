import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import * as binance from '../clients/binanceFutures.js';
import * as symbolRepo from '../repositories/marketSymbol.repository.js';
import * as jobStateRepo from '../repositories/reminderJobState.repository.js';

// Precio en vivo para el modal (§3.8 de la spec de recordatorios de análisis).
// Caché en memoria del proceso: como mucho UNA llamada por minuto a Binance
// (getAllPrices, sin símbolo, peso 2) con independencia del número de usuarios.
// El navegador nunca llama a Binance.

export const CACHE_TTL_MS = 60_000;

let cache = null; // { prices: Map<symbol, { price, time }>, fetchedAt }
let inflight = null;

const canCallBinance = () =>
  !binance.getBackoffUntil() && binance.getUsedWeight() <= config.binance.maxUsedWeight;

// Single-flight: las peticiones concurrentes esperan la misma promesa.
const refresh = () => {
  if (!inflight) {
    inflight = binance
      .getAllPrices()
      .then((prices) => {
        cache = { prices, fetchedAt: Date.now() };
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
};

/**
 * @returns {Promise<{ price: number, as_of: string } | { price: null }>}
 *   Si no se puede refrescar (breaker abierto, peso alto, error): el último
 *   precio cacheado; si no hay, el last_price del catálogo; si tampoco, null.
 */
export const getPrice = async (symbol) => {
  const stale = !cache || Date.now() - cache.fetchedAt >= CACHE_TTL_MS;
  if (stale && canCallBinance()) {
    try {
      await refresh();
    } catch (err) {
      if (err instanceof binance.BinanceBackoffError) {
        await jobStateRepo.setBackoffUntil(err.retryAfter).catch(() => {});
      }
      logger.warn(`Recordatorios: no se pudo refrescar la caché de precios: ${err.message}`);
    }
  }

  const cached = cache?.prices.get(symbol);
  if (cached) {
    return { price: cached.price, as_of: new Date(cached.time || cache.fetchedAt).toISOString() };
  }

  const row = await symbolRepo.findBySymbol(symbol);
  if (row?.last_price != null) {
    return { price: row.last_price, as_of: new Date(row.last_price_at).toISOString() };
  }
  return { price: null };
};

/** Solo para tests: vacía la caché. */
export const resetPriceCache = () => {
  cache = null;
  inflight = null;
};
