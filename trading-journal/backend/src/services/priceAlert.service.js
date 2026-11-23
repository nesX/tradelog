import { withTransaction } from '../config/database.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import * as alertRepo from '../repositories/priceAlert.repository.js';
import * as symbolRepo from '../repositories/marketSymbol.repository.js';
import * as notificationRepo from '../repositories/notification.repository.js';
import { getPrice } from './marketPrice.service.js';
import { isWithinNearBand, HOUR_MS } from './priceAlertEvaluator.js';
import { buildExcerpt } from './notificationPayload.js';
import { resolveAnchor } from './reminderAnchor.service.js';

// Alertas de precio (§3.7 de la spec de recordatorios de análisis). Estos
// endpoints nunca piden velas ni catálogo a Binance: la única vía es el precio
// de la caché (como mucho una llamada por minuto para toda la app).

const REARM_FIELDS = ['target_price', 'direction', 'is_invalidation'];

const toMs = (value) => (value == null ? null : new Date(value).getTime());
const normalizeMessage = (message) => (message === undefined ? undefined : message?.trim() || null);
const startOfCurrentHour = () => new Date(Math.floor(Date.now() / HOUR_MS) * HOUR_MS);

// Distancia al nivel desde el último precio leído por el job; recién creada la
// alerta (el job aún no leyó velas del símbolo), desde el precio de creación.
const present = (alert) => {
  const { anchor_content, note_deleted_at: _deleted, user_id: _userId, ...rest } = alert;
  const reference = alert.last_price ?? alert.price_at_creation;
  return {
    ...rest,
    block_excerpt: buildExcerpt(anchor_content),
    distance_pct: reference ? ((alert.target_price - reference) / reference) * 100 : null,
  };
};

/**
 * Pasos 3–4 de create: price_at_creation desde la caché y, si el precio ya está
 * dentro de la banda de aviso previo, el aviso de este armado se da por omitido.
 */
const armingFields = async (alert) => {
  const { price } = await getPrice(alert.symbol);
  return {
    price_at_creation: price,
    near_at: price != null && isWithinNearBand(alert, price) ? new Date() : null,
  };
};

/**
 * Paso 5 de create: si el símbolo no tiene alertas activas, su checkpoint puede
 * ser viejo; no tiene sentido pedir historial anterior a la alerta nueva.
 */
const resetCheckpointIfIdle = async (symbol, client) => {
  if (!(await alertRepo.hasActiveForSymbol(symbol, client))) {
    await symbolRepo.setCheckedUntil(symbol, startOfCurrentHour(), client);
  }
};

/**
 * Cambiar nivel, dirección o is_invalidation re-arma la alerta. Una alerta ya
 * disparada se re-arma aunque el nivel sea el mismo ("Re-armar" desde la tarjeta).
 */
const isRearm = (alert, changes) => {
  const touched = REARM_FIELDS.filter((key) => changes[key] !== undefined);
  if (touched.length === 0) return false;
  if (alert.status === 'triggered') return true;
  return touched.some((key) =>
    key === 'target_price' ? Number(changes[key]) !== alert.target_price : changes[key] !== alert[key]
  );
};

export const listPriceAlerts = async (userId, status) => {
  const alerts = await alertRepo.listByUser(userId, status ?? null);
  return alerts.map(present);
};

export const createPriceAlert = async (userId, data) => {
  const anchor = await resolveAnchor(userId, data);

  const symbol = await symbolRepo.findBySymbol(data.symbol);
  if (!symbol || symbol.invalid_at) {
    throw new ValidationError('Símbolo no disponible en Binance Futures');
  }

  const arming = await armingFields(data);

  return withTransaction(async (client) => {
    await resetCheckpointIfIdle(data.symbol, client);
    const id = await alertRepo.insert(
      {
        ...data,
        ...anchor,
        ...arming,
        message: normalizeMessage(data.message),
        user_id: userId,
      },
      client
    );
    return present(await alertRepo.findByIdAndUser(id, userId, client));
  });
};

/**
 * Editar o re-armar. En la misma transacción (con la alerta bloqueada, igual que
 * en el tick) resuelve las tarjetas abiertas que dejan de aplicar:
 *   - re-armado → todas como `rearmed`;
 *   - fecha límite nueva → las `price_alert_deadline` como `updated`.
 * Cambiar solo el mensaje o el aviso previo no toca las tarjetas.
 */
export const updatePriceAlert = async (userId, id, changes) => {
  const current = await alertRepo.findByIdAndUser(id, userId);
  if (!current) throw new NotFoundError('Alerta no encontrada');

  // El precio se pide fuera de la transacción: puede llegar a Binance.
  const price = isRearm(current, changes) ? (await getPrice(current.symbol)).price : null;

  return withTransaction(async (client) => {
    const alert = await alertRepo.findByIdAndUser(id, userId, client, { forUpdate: true });
    if (!alert) throw new NotFoundError('Alerta no encontrada');

    const fields = {};
    for (const key of [...REARM_FIELDS, 'near_pct', 'deadline_at']) {
      if (changes[key] !== undefined) fields[key] = changes[key];
    }
    if (changes.message !== undefined) fields.message = normalizeMessage(changes.message);

    if (isRearm(alert, changes)) {
      const next = { ...alert, ...fields };
      Object.assign(fields, {
        status: 'active',
        armed_at: new Date(),
        near_at: price != null && isWithinNearBand(next, price) ? new Date() : null,
        triggered_at: null,
        price_at_creation: price,
      });
      // Una fecha límite ya vencida no pasa al nuevo armado: el siguiente tick la
      // daría por vencida al momento ("no se tocó antes del…"). Queda así cuando el
      // toque llegó antes de la fecha pero se evaluó después (paso 8e del job).
      if (changes.deadline_at === undefined && alert.deadline_at && toMs(alert.deadline_at) <= Date.now()) {
        fields.deadline_at = null;
      }
      await resetCheckpointIfIdle(alert.symbol, client);
      await notificationRepo.resolveOpenByAlerts([id], 'rearmed', client);
    }

    if (changes.deadline_at !== undefined && toMs(changes.deadline_at) !== toMs(alert.deadline_at)) {
      await notificationRepo.resolveOpenByAlerts([id], 'updated', client, { types: ['price_alert_deadline'] });
    }

    await alertRepo.update(id, fields, client);
    return present(await alertRepo.findByIdAndUser(id, userId, client));
  });
};

/** Borrar = cancelar. Sus tarjetas abiertas se resuelven como `dismissed`. */
export const deletePriceAlert = async (userId, id) =>
  withTransaction(async (client) => {
    const alert = await alertRepo.findByIdAndUser(id, userId, client, { forUpdate: true });
    if (!alert) throw new NotFoundError('Alerta no encontrada');
    await notificationRepo.resolveOpenByAlerts([id], 'dismissed', client);
    await alertRepo.deleteByIds([id], client);
  });
