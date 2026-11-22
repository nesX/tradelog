import { withTransaction } from '../config/database.js';
import { NotFoundError } from '../middleware/errorHandler.js';
import * as reminderRepo from '../repositories/dateReminder.repository.js';
import * as notificationRepo from '../repositories/notification.repository.js';
import { buildExcerpt } from './notificationPayload.js';
import { resolveAnchor } from './reminderAnchor.service.js';

// Recordatorios por fecha (§3.7 de la spec de recordatorios de análisis). No
// usan Binance: el job los envía al llegar `remind_at`.

const toMs = (value) => (value == null ? null : new Date(value).getTime());
const normalizeMessage = (message) => (message === undefined ? undefined : message?.trim() || null);

const present = (reminder) => {
  const { anchor_content, note_deleted_at: _deleted, user_id: _userId, ...rest } = reminder;
  return { ...rest, block_excerpt: buildExcerpt(anchor_content) };
};

export const listDateReminders = async (userId, status) => {
  const reminders = await reminderRepo.listByUser(userId, status ?? null);
  return reminders.map(present);
};

export const createDateReminder = async (userId, data) => {
  const anchor = await resolveAnchor(userId, data);
  const id = await reminderRepo.insert({
    ...anchor,
    user_id: userId,
    remind_at: data.remind_at,
    message: normalizeMessage(data.message),
  });
  return present(await reminderRepo.findByIdAndUser(id, userId));
};

/**
 * Una fecha nueva re-programa: vuelve a `pending` y sus tarjetas abiertas se
 * resuelven como `rearmed`.
 */
export const updateDateReminder = async (userId, id, changes) =>
  withTransaction(async (client) => {
    const reminder = await reminderRepo.findByIdAndUser(id, userId, client, { forUpdate: true });
    if (!reminder) throw new NotFoundError('Recordatorio no encontrado');

    const reschedule = changes.remind_at !== undefined && toMs(changes.remind_at) !== toMs(reminder.remind_at);
    await reminderRepo.update(
      id,
      { remind_at: changes.remind_at, message: normalizeMessage(changes.message), reschedule },
      client
    );
    if (reschedule) await notificationRepo.resolveOpenByReminder(id, 'rearmed', client);

    return present(await reminderRepo.findByIdAndUser(id, userId, client));
  });

export const deleteDateReminder = async (userId, id) =>
  withTransaction(async (client) => {
    const reminder = await reminderRepo.findByIdAndUser(id, userId, client, { forUpdate: true });
    if (!reminder) throw new NotFoundError('Recordatorio no encontrado');
    await notificationRepo.resolveOpenByReminder(id, 'dismissed', client);
    await reminderRepo.deleteById(id, client);
  });
