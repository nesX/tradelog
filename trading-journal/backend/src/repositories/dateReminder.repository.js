import { pool } from '../config/database.js';
import { anchorJoins, anchorColumns } from './reminderAnchor.js';

// Recordatorios por fecha. Se leen siempre con su anclaje.

const REMINDER_SELECT = `
  SELECT dr.id, dr.user_id, dr.remind_at, dr.message, dr.status, dr.sent_at,
    dr.created_at, dr.updated_at,
    ${anchorColumns('dr')}
  FROM date_reminders dr
  ${anchorJoins('dr')}`;

/** Recordatorio del usuario (aunque su nota esté en la papelera). */
export const findByIdAndUser = async (id, userId, exec = pool, { forUpdate = false } = {}) => {
  const result = await exec.query(
    `${REMINDER_SELECT}
     WHERE dr.id = $1 AND dr.user_id = $2
     ${forUpdate ? 'FOR UPDATE OF dr' : ''}`,
    [id, userId]
  );
  return result.rows[0] || null;
};

/** Pestaña Programadas: solo recordatorios de notas no borradas. */
export const listByUser = async (userId, status = null) => {
  const result = await pool.query(
    `${REMINDER_SELECT}
     WHERE dr.user_id = $1 AND an.deleted_at IS NULL
       AND ($2::varchar IS NULL OR dr.status = $2)
     ORDER BY dr.remind_at ASC`,
    [userId, status]
  );
  return result.rows;
};

export const insert = async ({ user_id, note_id, block_id, remind_at, message }, exec = pool) => {
  const result = await exec.query(
    `INSERT INTO date_reminders (user_id, note_id, block_id, remind_at, message)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [user_id, note_id ?? null, block_id ?? null, remind_at, message ?? null]
  );
  return result.rows[0].id;
};

/**
 * @param {{ remind_at?: Date, message?: string|null, reschedule?: boolean }} fields
 *   reschedule: vuelve el recordatorio a 'pending' (fecha nueva).
 */
export const update = async (id, { remind_at, message, reschedule = false }, exec = pool) => {
  const sets = [];
  const params = [];
  if (remind_at !== undefined) {
    params.push(remind_at);
    sets.push(`remind_at = $${params.length}`);
  }
  if (message !== undefined) {
    params.push(message);
    sets.push(`message = $${params.length}`);
  }
  if (reschedule) sets.push(`status = 'pending'`, 'sent_at = NULL');
  if (sets.length === 0) return;
  params.push(id);
  await exec.query(`UPDATE date_reminders SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
};

export const deleteById = async (id, exec = pool) => {
  await exec.query(`DELETE FROM date_reminders WHERE id = $1`, [id]);
};

/** Pendientes vencidos con la nota no borrada, bloqueados para el envío. */
export const findDueForUpdate = async (exec) => {
  const result = await exec.query(
    `${REMINDER_SELECT}
     WHERE dr.status = 'pending' AND dr.remind_at <= NOW() AND an.deleted_at IS NULL
     ORDER BY dr.remind_at
     FOR UPDATE OF dr`
  );
  return result.rows;
};

export const markSent = async (id, exec) => {
  await exec.query(`UPDATE date_reminders SET status = 'sent', sent_at = NOW() WHERE id = $1`, [id]);
};
