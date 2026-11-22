import { pool } from '../config/database.js';

// Bandeja de tarjetas (genérica). Las crean el job y el sync del catálogo; solo
// se cierran por una acción del usuario.

export const insert = async ({ userId, type, priceAlertId = null, dateReminderId = null, payload }, exec = pool) => {
  const result = await exec.query(
    `INSERT INTO notifications (user_id, type, price_alert_id, date_reminder_id, payload)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, type, priceAlertId, dateReminderId, JSON.stringify(payload)]
  );
  return result.rows[0].id;
};

/**
 * Tarjeta + lo que la UI necesita para decidir qué acciones mostrar:
 *   - price_alert / date_reminder: estado actual (NULL si se borró: la FK pasa a NULL).
 *   - note_id / block_id: anclaje ACTUAL para "Ver análisis" (el bloque pudo
 *     moverse de nota, o la alerta pasar a la nota al borrar el bloque); si la
 *     alerta o el recordatorio ya no existen, el del payload.
 *   - note_available: la nota existe y no está en la papelera.
 */
const CARD_SELECT = `
  SELECT nt.id, nt.type, nt.price_alert_id, nt.date_reminder_id, nt.payload,
    nt.created_at, nt.resolved_at, nt.resolution,
    CASE WHEN pa.id IS NULL THEN NULL ELSE json_build_object(
      'id', pa.id, 'symbol', pa.symbol, 'direction', pa.direction,
      'target_price', pa.target_price, 'is_invalidation', pa.is_invalidation,
      'near_pct', pa.near_pct, 'deadline_at', pa.deadline_at, 'message', pa.message,
      'status', pa.status, 'armed_at', pa.armed_at, 'triggered_at', pa.triggered_at,
      'note_id', COALESCE(pa.note_id, pab.note_id), 'block_id', pa.block_id
    ) END AS price_alert,
    CASE WHEN dr.id IS NULL THEN NULL ELSE json_build_object(
      'id', dr.id, 'remind_at', dr.remind_at, 'message', dr.message, 'status', dr.status,
      'note_id', COALESCE(dr.note_id, drb.note_id), 'block_id', dr.block_id
    ) END AS date_reminder,
    ln.id AS note_id,
    lb.id AS block_id,
    (ln.id IS NOT NULL AND ln.deleted_at IS NULL) AS note_available
  FROM notifications nt
  LEFT JOIN price_alerts pa ON pa.id = nt.price_alert_id
  LEFT JOIN note_blocks pab ON pab.id = pa.block_id
  LEFT JOIN date_reminders dr ON dr.id = nt.date_reminder_id
  LEFT JOIN note_blocks drb ON drb.id = dr.block_id
  LEFT JOIN LATERAL (
    SELECT
      CASE WHEN pa.id IS NOT NULL THEN pa.block_id
           WHEN dr.id IS NOT NULL THEN dr.block_id
           ELSE (nt.payload->>'block_id')::int END AS block_id,
      CASE WHEN pa.id IS NOT NULL THEN COALESCE(pa.note_id, pab.note_id)
           WHEN dr.id IS NOT NULL THEN COALESCE(dr.note_id, drb.note_id)
           ELSE (nt.payload->>'note_id')::int END AS note_id
  ) cur ON TRUE
  LEFT JOIN note_blocks lb ON lb.id = cur.block_id
  LEFT JOIN notes ln ON ln.id = COALESCE(lb.note_id, cur.note_id) AND ln.user_id = nt.user_id`;

/** Tarjetas abiertas, las más recientes primero. */
export const listOpen = async (userId) => {
  const result = await pool.query(
    `${CARD_SELECT}
     WHERE nt.user_id = $1 AND nt.resolved_at IS NULL
     ORDER BY nt.created_at DESC, nt.id DESC`,
    [userId]
  );
  return result.rows;
};

/**
 * Historial por `resolved_at DESC`. El cursor es el id de la última tarjeta de la
 * página anterior: se pagina por (resolved_at, id) porque las tarjetas no se
 * archivan en el orden en que se crearon.
 */
export const listResolved = async (userId, beforeId, limit) => {
  const result = await pool.query(
    `${CARD_SELECT}
     WHERE nt.user_id = $1 AND nt.resolved_at IS NOT NULL
       AND ($2::int IS NULL OR (nt.resolved_at, nt.id) < (
         SELECT c.resolved_at, c.id FROM notifications c WHERE c.id = $2 AND c.user_id = $1
       ))
     ORDER BY nt.resolved_at DESC, nt.id DESC
     LIMIT $3`,
    [userId, beforeId ?? null, limit]
  );
  return result.rows;
};

export const countOpen = async (userId) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS open FROM notifications WHERE user_id = $1 AND resolved_at IS NULL`,
    [userId]
  );
  return result.rows[0].open;
};

export const findByIdAndUser = async (id, userId, exec = pool, { forUpdate = false } = {}) => {
  if (forUpdate) {
    // Bloqueo sobre la tabla base (FOR UPDATE no admite el lado nullable de los LEFT JOIN)
    await exec.query(`SELECT id FROM notifications WHERE id = $1 AND user_id = $2 FOR UPDATE`, [id, userId]);
  }
  const result = await exec.query(`${CARD_SELECT} WHERE nt.id = $1 AND nt.user_id = $2`, [id, userId]);
  return result.rows[0] || null;
};

export const resolve = async (id, resolution, exec = pool) => {
  await exec.query(
    `UPDATE notifications SET resolved_at = NOW(), resolution = $2
     WHERE id = $1 AND resolved_at IS NULL`,
    [id, resolution]
  );
};

/**
 * Resuelve las tarjetas abiertas de unas alertas (re-armado, borrado, cambio de
 * fecha límite). `types` limita a ciertos tipos de tarjeta.
 */
export const resolveOpenByAlerts = async (alertIds, resolution, exec = pool, { types = null } = {}) => {
  if (alertIds.length === 0) return 0;
  const result = await exec.query(
    `UPDATE notifications SET resolved_at = NOW(), resolution = $2
     WHERE price_alert_id = ANY($1::int[]) AND resolved_at IS NULL
       AND ($3::varchar[] IS NULL OR type = ANY($3::varchar[]))`,
    [alertIds, resolution, types]
  );
  return result.rowCount;
};

export const resolveOpenByReminder = async (reminderId, resolution, exec = pool) => {
  const result = await exec.query(
    `UPDATE notifications SET resolved_at = NOW(), resolution = $2
     WHERE date_reminder_id = $1 AND resolved_at IS NULL`,
    [reminderId, resolution]
  );
  return result.rowCount;
};
