import { config } from '../config/env.js';
import { getClient, withTransaction } from '../config/database.js';
import { logger } from '../utils/logger.js';
import * as binance from '../clients/binanceFutures.js';
import * as symbolRepo from '../repositories/marketSymbol.repository.js';
import * as alertRepo from '../repositories/priceAlert.repository.js';
import * as reminderRepo from '../repositories/dateReminder.repository.js';
import * as notificationRepo from '../repositories/notification.repository.js';
import * as jobStateRepo from '../repositories/reminderJobState.repository.js';
import { evaluateAlert, HOUR_MS } from './priceAlertEvaluator.js';
import { buildPriceAlertPayload, buildDateReminderPayload } from './notificationPayload.js';
import { syncCatalog, delistSymbols } from './marketSymbol.service.js';
import * as pushService from './push.service.js';

/**
 * Job de recordatorios de análisis (§3.2 de la spec). Un solo job para todo:
 * recordatorios por fecha, fechas límite, sync del catálogo y alertas de precio.
 * Corre dentro del proceso del backend; el estado vive en la BD (checkpoints,
 * reminder_job_state), así que un reinicio no pierde nada.
 */

// Advisory lock en la forma de DOS enteros: withUserLock usa
// pg_advisory_xact_lock(userId) (un bigint) y los dos espacios no se solapan.
const LOCK_CLASS = 28028;
const MAX_KLINES = 1000;
const CATALOG_MAX_AGE_MS = 24 * HOUR_MS;
const MIN_FIRST_DELAY_MS = 60_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const floorHour = (ms) => Math.floor(ms / HOUR_MS) * HOUR_MS;

/**
 * Primer tick tras arrancar: max(ahora + 1 min, last_run_at + intervalo). Así un
 * deploy no adelanta peticiones y una racha de deploys no deja al job sin correr.
 */
export const computeFirstDelay = (lastRunAt, intervalMs, nowMs = Date.now()) => {
  if (!lastRunAt) return MIN_FIRST_DELAY_MS;
  return Math.max(MIN_FIRST_DELAY_MS, new Date(lastRunAt).getTime() + intervalMs - nowMs);
};

// ---------- Pasos 3 y 4: sin Binance ----------

const sendDueDateReminders = () =>
  withTransaction(async (client) => {
    const due = await reminderRepo.findDueForUpdate(client);
    for (const reminder of due) {
      await reminderRepo.markSent(reminder.id, client);
      await notificationRepo.insert(
        {
          userId: reminder.user_id,
          type: 'date_reminder_due',
          dateReminderId: reminder.id,
          payload: buildDateReminderPayload(reminder),
        },
        client
      );
    }
    return due.length;
  });

/** Tarjeta de fecha límite + deadline_at = NULL (la fecha se consume al avisar). */
const sendDeadlineCard = async (alert, client) => {
  await notificationRepo.insert(
    {
      userId: alert.user_id,
      type: 'price_alert_deadline',
      priceAlertId: alert.id,
      payload: buildPriceAlertPayload({ alert }),
    },
    client
  );
  await alertRepo.clearDeadline(alert.id, client);
};

/**
 * Fechas límite de símbolos deslistados: sus velas ya no se leen, así que se
 * comparan con NOW(). Las de símbolos válidos se evalúan con las velas en el
 * paso 8 (isDeadlineDue).
 */
const sendDueDeadlines = () =>
  withTransaction(async (client) => {
    const due = await alertRepo.findDueDeadlinesForUpdate(client);
    for (const alert of due) {
      await sendDeadlineCard(alert, client);
    }
    return due.length;
  });

// ---------- Paso 8: velas de un símbolo ----------

/**
 * Lee las velas desde el checkpoint (paginando si el hueco supera 1000 h).
 * `nowMs` se toma ANTES de la primera petición (ver evaluateAlert).
 */
const fetchCandles = async (sym, pauseMs) => {
  const nowMs = Date.now();
  let from = sym.checked_until ? new Date(sym.checked_until).getTime() : floorHour(nowMs);
  const candles = [];
  let overWeight = false;

  for (;;) {
    const n = Math.floor((nowMs - from) / HOUR_MS) + 1;
    if (n <= 0) break;
    const limit = Math.min(n, MAX_KLINES);
    const batch = await binance.getHourlyKlines(sym.symbol, from, limit);
    candles.push(...batch);

    if (binance.getUsedWeight() > config.binance.maxUsedWeight) {
      overWeight = true;
      break;
    }
    if (n <= MAX_KLINES || batch.length < limit) break;
    from = batch[batch.length - 1].openTime + HOUR_MS;
    await sleep(pauseMs);
  }

  return { candles, nowMs, overWeight };
};

/**
 * ¿Vence la fecha límite de la alerta? Se compara con la hora de las velas, no
 * con NOW(): hasta evaluar la vela que contiene la fecha no se sabe si el nivel
 * se tocó antes.
 *   - Toque en una vela que abrió antes de la fecha → a tiempo. Incluye la vela
 *     que la contiene: con velas de 1 h no se sabe si fue antes o después.
 *   - Toque en una vela que abrió en la fecha o después → vence: las velas
 *     anteriores ya se evaluaron sin toque.
 *   - Sin toque → vence cuando el nuevo checkpoint pasó la fecha, es decir, la
 *     vela que la contiene ya cerró y se evaluó.
 */
const isDeadlineDue = (alert, hit, checkedUntil) => {
  if (!alert.deadline_at) return false;
  const deadlineMs = new Date(alert.deadline_at).getTime();
  return hit ? hit.openTime >= deadlineMs : checkedUntil > deadlineMs;
};

/**
 * Evalúa las velas contra las alertas activas del símbolo en UNA transacción,
 * con las alertas bloqueadas (FOR UPDATE OF price_alerts): un re-armado
 * concurrente espera, así que nunca se dispara una alerta con un objetivo viejo.
 * @returns {Promise<{ cards: number, deadlines: number }>} tarjetas de toque o
 *   cercanía y tarjetas de fecha límite creadas
 */
const processSymbol = (sym, candles, nowMs) =>
  withTransaction(async (client) => {
    const last = candles[candles.length - 1];
    // El checkpoint es la vela que estaba abierta en `nowMs`. Si la respuesta ya
    // trae una vela abierta después (la petición cruzó el cambio de hora), no se
    // avanza hasta ella: la de antes se vuelve a pedir y su cierre (p. ej. el
    // diario de las 23:00) se evalúa en el siguiente tick.
    const checkedUntil = Math.min(last.openTime, floorHour(nowMs));
    let cards = 0;
    let deadlines = 0;

    const alerts = await alertRepo.findActiveBySymbolsForUpdate([sym.symbol], client);
    for (const alert of alerts) {
      const { near, hit, nearValue, hitValue } = evaluateAlert(alert, candles, nowMs);

      // Si vencen la fecha límite y el toque, la fecha límite va primero: pasó antes.
      if (isDeadlineDue(alert, hit, checkedUntil)) {
        await sendDeadlineCard(alert, client);
        alert.deadline_at = null; // la foto de la tarjeta de toque o cercanía, sin la fecha consumida
        deadlines += 1;
      }
      if (!hit && !near) continue;

      if (hit) {
        const siblings = alert.is_invalidation
          ? await alertRepo.findActiveByAnchor(
              alert.user_id,
              { blockId: alert.block_id, noteId: alert.block_id ? null : alert.note_id },
              alert.id,
              client
            )
          : undefined;
        await alertRepo.markTriggered(alert.id, new Date(hit.openTime), client);
        await notificationRepo.insert(
          {
            userId: alert.user_id,
            type: alert.is_invalidation ? 'price_alert_invalidation' : 'price_alert_hit',
            priceAlertId: alert.id,
            payload: buildPriceAlertPayload({
              alert,
              candle: hit,
              candleValue: hitValue,
              lastPrice: last.close,
              siblings,
            }),
          },
          client
        );
      } else {
        await alertRepo.markNear(alert.id, client);
        await notificationRepo.insert(
          {
            userId: alert.user_id,
            type: 'price_alert_near',
            priceAlertId: alert.id,
            payload: buildPriceAlertPayload({ alert, candle: near, candleValue: nearValue, lastPrice: last.close }),
          },
          client
        );
      }
      cards += 1;
    }

    await symbolRepo.updateCheckpoint(sym.symbol, { checkedUntil: new Date(checkedUntil), lastPrice: last.close }, client);
    return { cards, deadlines };
  });

// ---------- Tick ----------

/** Pasos del tick; va anotando lo que hace en `summary`. */
const runSteps = async (summary, pauseMs) => {
  await jobStateRepo.setLastRunAt();

  // 3 va primero porque no depende de Binance: un backoff no lo retrasa. El 4 solo
  // cubre los símbolos deslistados; el resto de fechas límite espera a las velas.
  summary.dateReminders = await sendDueDateReminders();
  summary.deadlines = await sendDueDeadlines();

  const state = await jobStateRepo.get();
  if (state?.backoff_until && new Date(state.backoff_until).getTime() > Date.now()) {
    binance.setBackoffUntil(state.backoff_until);
    return;
  }

  try {
    const syncedAt = state?.catalog_synced_at ? new Date(state.catalog_synced_at).getTime() : 0;
    if (Date.now() - syncedAt > CATALOG_MAX_AGE_MS) {
      try {
        summary.catalog = await syncCatalog();
      } catch (err) {
        if (err instanceof binance.BinanceBackoffError) throw err;
        summary.errors += 1;
        logger.error(`Recordatorios: falló el sync del catálogo: ${err.message}`);
      }
    }

    const symbols = await symbolRepo.findWatched();
    // Secuencial a propósito: cada transacción termina antes de empezar la siguiente,
    // y los avisos push solo leen tarjetas con commit. No paralelizar sin revisar la
    // marca de agua de push.service.js (notifyNew).
    for (let i = 0; i < symbols.length; i += 1) {
      const sym = symbols[i];
      if (i > 0) await sleep(pauseMs);
      try {
        const { candles, nowMs, overWeight } = await fetchCandles(sym, pauseMs);
        if (candles.length > 0) {
          const { cards, deadlines } = await processSymbol(sym, candles, nowMs);
          summary.cards += cards;
          summary.deadlines += deadlines;
        }
        summary.symbols += 1;
        if (overWeight) {
          logger.warn(
            `Recordatorios: peso usado ${binance.getUsedWeight()} > ${config.binance.maxUsedWeight}; se corta el tick tras ${sym.symbol}`
          );
          break;
        }
      } catch (err) {
        if (err instanceof binance.BinanceBackoffError) throw err;
        if (err instanceof binance.BinanceInvalidSymbolError) {
          summary.cards += await delistSymbols([sym.symbol]);
          continue;
        }
        // Red, timeout…: el checkpoint de este símbolo no se movió.
        summary.errors += 1;
        logger.error(`Recordatorios: error al revisar ${sym.symbol}: ${err.message}`);
      }
    }
  } catch (err) {
    if (!(err instanceof binance.BinanceBackoffError)) throw err;
    await jobStateRepo.setBackoffUntil(err.retryAfter);
    logger.error(`Recordatorios: Binance pidió esperar hasta ${err.retryAfter.toISOString()}; se corta el tick`);
  }
};

const tick = async (pauseMs) => {
  const summary = { dateReminders: 0, deadlines: 0, catalog: null, symbols: 0, cards: 0, errors: 0 };
  try {
    await runSteps(summary, pauseMs);
  } finally {
    // Avisos push de las tarjetas nuevas. Aquí corren con el advisory lock tomado
    // (runTick solo llama a tick si lo consiguió) y con todas las transacciones del
    // tick terminadas, también si se cortó por un backoff o un error.
    summary.push = await pushService.notifyNew();
  }
  return summary;
};

/**
 * Un tick del job. Si otro proceso tiene el advisory lock, no hace nada.
 * @param {{ pauseMs?: number }} [options] pausa entre peticiones a Binance (1 s)
 */
export const runTick = async ({ pauseMs = 1000 } = {}) => {
  const lockClient = await getClient();
  let locked = false;
  try {
    const { rows } = await lockClient.query('SELECT pg_try_advisory_lock($1::int, 0) AS locked', [LOCK_CLASS]);
    locked = rows[0].locked;
    if (!locked) return { skipped: true };

    const summary = await tick(pauseMs);
    // Solo se loguea a nivel info cuando hubo algo que contar (no cada 30 min)
    const { dateReminders, deadlines, catalog, cards, errors, push } = summary;
    const pushed = push.sent || push.failed || push.removed;
    const level = dateReminders || deadlines || catalog || cards || errors || pushed ? 'info' : 'debug';
    logger[level]('Recordatorios: tick', { ...summary, usedWeight: binance.getUsedWeight() });
    return summary;
  } finally {
    if (locked) {
      await lockClient.query('SELECT pg_advisory_unlock($1::int, 0)', [LOCK_CLASS]).catch(() => {});
    }
    lockClient.release();
  }
};

export const getJobState = () => jobStateRepo.get();
