import { withTransaction } from '../config/database.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import * as notificationRepo from '../repositories/notification.repository.js';
import * as alertRepo from '../repositories/priceAlert.repository.js';

// Bandeja de tarjetas (§3.6–3.7 de la spec de recordatorios de análisis). Una
// tarjeta solo se cierra por una acción del usuario.

export const RESOLVED_PAGE_SIZE = 50;

/**
 * Abiertas: todas. Resueltas: 50 por página; `next_before` es el cursor de la
 * página siguiente (null si no hay más).
 */
export const listNotifications = async (userId, { status = 'open', before } = {}) => {
  if (status === 'resolved') {
    const items = await notificationRepo.listResolved(userId, before, RESOLVED_PAGE_SIZE);
    const nextBefore = items.length === RESOLVED_PAGE_SIZE ? items[items.length - 1].id : null;
    return { items, next_before: nextBefore };
  }
  return { items: await notificationRepo.listOpen(userId), next_before: null };
};

export const countOpen = async (userId) => ({ open: await notificationRepo.countOpen(userId) });

/**
 * Cerrar una tarjeta. Idempotente: si ya estaba resuelta se devuelve tal cual
 * (un doble clic no da error).
 *
 * `delete_sibling_alerts` (solo en `price_alert_invalidation`) borra en la misma
 * transacción las demás alertas activas del mismo anclaje y resuelve sus tarjetas
 * abiertas. El anclaje es el actual de la alerta (pudo pasar del bloque a la nota
 * al borrarse el bloque) o, si ya no existe, el del payload. Los recordatorios
 * por fecha no se tocan.
 */
export const resolveNotification = async (userId, id, { resolution = 'dismissed', delete_sibling_alerts = false } = {}) =>
  withTransaction(async (client) => {
    const card = await notificationRepo.findByIdAndUser(id, userId, client, { forUpdate: true });
    if (!card) throw new NotFoundError('Tarjeta no encontrada');

    if (delete_sibling_alerts && card.type !== 'price_alert_invalidation') {
      throw new ValidationError('Solo una tarjeta de invalidación puede borrar las demás alertas');
    }
    if (card.resolved_at) return card;

    if (delete_sibling_alerts) {
      // card.block_id / card.note_id ya son el anclaje actual (ver CARD_SELECT)
      const anchor = card.block_id
        ? { blockId: card.block_id, noteId: null }
        : { blockId: null, noteId: card.note_id };
      if (anchor.blockId || anchor.noteId) {
        const siblings = await alertRepo.findActiveByAnchor(userId, anchor, card.price_alert_id, client);
        const ids = siblings.map((s) => s.id);
        await notificationRepo.resolveOpenByAlerts(ids, 'dismissed', client);
        await alertRepo.deleteByIds(ids, client);
      }
    }

    await notificationRepo.resolve(id, resolution, client);
    return notificationRepo.findByIdAndUser(id, userId, client);
  });
