import { withTransaction } from '../config/database.js';
import { logger } from '../utils/logger.js';
import * as binance from '../clients/binanceFutures.js';
import * as symbolRepo from '../repositories/marketSymbol.repository.js';
import * as jobStateRepo from '../repositories/reminderJobState.repository.js';
import * as alertRepo from '../repositories/priceAlert.repository.js';
import * as notificationRepo from '../repositories/notification.repository.js';
import { buildPriceAlertPayload } from './notificationPayload.js';

// Catálogo de perpetuos de Binance Futures USDⓈ-M (§3.5 de la spec de
// recordatorios de análisis). Una llamada a exchangeInfo al día (peso 1).

// Los TradFi (metales, energía, acciones, ETFs) tienen su propio tipo: filtrar
// solo PERPETUAL dejaría fuera el oro y todas las acciones. Los trimestrales se ignoran.
export const PERPETUAL_TYPES = ['PERPETUAL', 'TRADIFI_PERPETUAL'];

// Si llega menos de esta fracción de los símbolos vigentes, la respuesta se da
// por parcial (mantenimiento de Binance) y no se marca ningún deslistado.
const MIN_SYNC_RATIO = 0.5;

export const listSymbols = (userId) => symbolRepo.listActive(userId);

/**
 * Deslistado (sync, o BinanceInvalidSymbolError en el job): `invalid_at = NOW()`
 * y una tarjeta `price_alert_delisted` por cada alerta activa del símbolo con la
 * nota no borrada. Sus alertas dejan de evaluarse; si el símbolo vuelve a
 * TRADING, el sync lo reactiva y se retoma desde el checkpoint.
 * @returns {Promise<number>} tarjetas creadas
 */
export const delistSymbols = async (symbols, exec = null) => {
  if (!exec) return withTransaction((client) => delistSymbols(symbols, client));

  const marked = await symbolRepo.markInvalid(symbols, exec);
  if (marked.length === 0) return 0;

  const alerts = await alertRepo.findActiveBySymbolsForUpdate(marked, exec);
  for (const alert of alerts) {
    await notificationRepo.insert(
      {
        userId: alert.user_id,
        type: 'price_alert_delisted',
        priceAlertId: alert.id,
        payload: buildPriceAlertPayload({ alert }),
      },
      exec
    );
  }
  logger.warn(`Recordatorios: ${marked.length} perpetuo(s) deslistado(s): ${marked.join(', ')}`);
  return alerts.length;
};

/**
 * Sync del catálogo. Siempre sincroniza: la comprobación de "más de 24 h" la
 * hace el job.
 * @returns {Promise<{ skipped: boolean, total: number, delisted: number }>}
 */
export const syncCatalog = async () => {
  let contracts;
  try {
    contracts = await binance.getExchangeInfo();
  } catch (err) {
    if (err instanceof binance.BinanceBackoffError) {
      await jobStateRepo.setBackoffUntil(err.retryAfter);
    }
    throw err;
  }

  const tradable = contracts.filter(
    (c) => c.status === 'TRADING' && PERPETUAL_TYPES.includes(c.contractType) && c.tickSize
  );
  const activeSymbols = await symbolRepo.listActiveSymbols();

  if (activeSymbols.length > 0 && tradable.length < activeSymbols.length * MIN_SYNC_RATIO) {
    logger.warn(
      `Recordatorios: sync del catálogo omitido, llegaron ${tradable.length} perpetuos de ${activeSymbols.length} vigentes`
    );
    return { skipped: true, total: tradable.length, delisted: 0 };
  }

  const tradableSet = new Set(tradable.map((c) => c.symbol));
  const gone = activeSymbols.filter((s) => !tradableSet.has(s));

  return withTransaction(async (client) => {
    await symbolRepo.upsertMany(tradable, client);
    if (gone.length > 0) await delistSymbols(gone, client);
    await jobStateRepo.setCatalogSyncedAt(client);
    return { skipped: false, total: tradable.length, delisted: gone.length };
  });
};
