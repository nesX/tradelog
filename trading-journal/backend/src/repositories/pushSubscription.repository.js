import { pool, withTransaction } from '../config/database.js';

// Dispositivos vinculados a una cuenta para recibir avisos push. El endpoint
// identifica al dispositivo y es único: un dispositivo recibe los avisos de una
// sola cuenta.

const COLUMNS = 'id, user_id, endpoint, p256dh, auth, user_agent, created_at, last_seen_at';

/**
 * Vinculación manual (el usuario activó los avisos en este dispositivo). Si el
 * dispositivo estaba vinculado a otra cuenta, pasa a esta.
 */
export const link = async ({ userId, endpoint, p256dh, auth, userAgent = null }) => {
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent, last_seen_at = NOW()`,
    [userId, endpoint, p256dh, auth, userAgent]
  );
};

/**
 * Comprobación automática al abrir la app. Desvincula el dispositivo de
 * cualquier otra cuenta y renueva la fila propia. Nunca inserta: vincular es
 * siempre manual (`link`).
 * @returns {Promise<{ linked: boolean, unlinkedUserIds: number[] }>}
 */
export const checkIn = ({ userId, endpoint, p256dh, auth, userAgent = null }) =>
  withTransaction(async (client) => {
    const removed = await client.query(
      `DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id <> $2 RETURNING user_id`,
      [endpoint, userId]
    );
    const updated = await client.query(
      `UPDATE push_subscriptions
          SET p256dh = $3, auth = $4, user_agent = COALESCE($5, user_agent), last_seen_at = NOW()
        WHERE endpoint = $1 AND user_id = $2`,
      [endpoint, userId, p256dh, auth, userAgent]
    );
    return { linked: updated.rowCount > 0, unlinkedUserIds: removed.rows.map((row) => row.user_id) };
  });

/** Desvincula el dispositivo, solo si es de la cuenta. */
export const deleteByEndpoint = async (userId, endpoint) => {
  const result = await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`, [
    endpoint,
    userId,
  ]);
  return result.rowCount;
};

export const findByEndpoint = async (userId, endpoint) => {
  const result = await pool.query(`SELECT ${COLUMNS} FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`, [
    endpoint,
    userId,
  ]);
  return result.rows[0] || null;
};

export const findByUserIds = async (userIds) => {
  if (userIds.length === 0) return [];
  const result = await pool.query(`SELECT ${COLUMNS} FROM push_subscriptions WHERE user_id = ANY($1::int[])`, [
    userIds,
  ]);
  return result.rows;
};

/** Limpieza tras un 404/410 del servicio de push: el dispositivo ya no existe. */
export const deleteByEndpoints = async (endpoints) => {
  if (endpoints.length === 0) return 0;
  const result = await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = ANY($1::text[])`, [endpoints]);
  return result.rowCount;
};
