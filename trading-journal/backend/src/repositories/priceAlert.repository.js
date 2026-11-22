import { pool } from '../config/database.js';
import { toNumberOrNull } from '../utils/numeric.js';
import { anchorJoins, anchorColumns } from './reminderAnchor.js';

// Alertas de precio. Se leen siempre con su anclaje (nota derivada del bloque,
// título, contenido para el extracto) y los datos del símbolo.

const parseAlert = (row) =>
  row && {
    ...row,
    target_price: Number(row.target_price),
    near_pct: toNumberOrNull(row.near_pct),
    price_at_creation: toNumberOrNull(row.price_at_creation),
    tick_size: toNumberOrNull(row.tick_size),
    last_price: toNumberOrNull(row.last_price),
  };

const ALERT_SELECT = `
  SELECT pa.id, pa.user_id, pa.symbol, pa.direction, pa.target_price, pa.is_invalidation,
    pa.near_pct, pa.deadline_at, pa.price_at_creation, pa.message, pa.status,
    pa.armed_at, pa.near_at, pa.triggered_at, pa.created_at, pa.updated_at,
    ${anchorColumns('pa')},
    ms.contract_type, ms.tick_size, ms.last_price, ms.last_price_at,
    ms.invalid_at AS symbol_invalid_at
  FROM price_alerts pa
  ${anchorJoins('pa')}
  JOIN market_symbols ms ON ms.symbol = pa.symbol`;

const UPDATABLE = [
  'target_price',
  'direction',
  'is_invalidation',
  'near_pct',
  'deadline_at',
  'message',
  'status',
  'armed_at',
  'near_at',
  'triggered_at',
  'price_at_creation',
];

/** Alerta del usuario (aunque su nota esté en la papelera). */
export const findByIdAndUser = async (id, userId, exec = pool, { forUpdate = false } = {}) => {
  const result = await exec.query(
    `${ALERT_SELECT}
     WHERE pa.id = $1 AND pa.user_id = $2
     ${forUpdate ? 'FOR UPDATE OF pa' : ''}`,
    [id, userId]
  );
  return parseAlert(result.rows[0]) || null;
};

/** Pestaña Programadas / historial: solo alertas de notas no borradas. */
export const listByUser = async (userId, status = null) => {
  const result = await pool.query(
    `${ALERT_SELECT}
     WHERE pa.user_id = $1 AND an.deleted_at IS NULL
       AND ($2::varchar IS NULL OR pa.status = $2)
     ORDER BY pa.created_at DESC`,
    [userId, status]
  );
  return result.rows.map(parseAlert);
};

export const insert = async (data, exec = pool) => {
  const result = await exec.query(
    `INSERT INTO price_alerts (user_id, note_id, block_id, symbol, direction, target_price,
       is_invalidation, near_pct, deadline_at, price_at_creation, message, near_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      data.user_id,
      data.note_id ?? null,
      data.block_id ?? null,
      data.symbol,
      data.direction,
      data.target_price,
      data.is_invalidation ?? false,
      data.near_pct ?? null,
      data.deadline_at ?? null,
      data.price_at_creation ?? null,
      data.message ?? null,
      data.near_at ?? null,
    ]
  );
  return result.rows[0].id;
};

/** UPDATE parcial con las columnas presentes en `fields` (lista blanca). */
export const update = async (id, fields, exec = pool) => {
  const sets = [];
  const params = [];
  for (const key of UPDATABLE) {
    if (fields[key] !== undefined) {
      params.push(fields[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (sets.length === 0) return;
  params.push(id);
  await exec.query(`UPDATE price_alerts SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
};

export const deleteByIds = async (ids, exec = pool) => {
  if (ids.length === 0) return;
  await exec.query(`DELETE FROM price_alerts WHERE id = ANY($1::int[])`, [ids]);
};

/**
 * ¿El símbolo tiene alertas activas en notas no borradas? Mismo criterio que el
 * job para decidir qué símbolos revisar.
 */
export const hasActiveForSymbol = async (symbol, exec = pool) => {
  const result = await exec.query(
    `SELECT EXISTS (
       SELECT 1 FROM price_alerts pa
       LEFT JOIN note_blocks b ON b.id = pa.block_id
       JOIN notes n ON n.id = COALESCE(pa.note_id, b.note_id)
       WHERE pa.symbol = $1 AND pa.status = 'active' AND n.deleted_at IS NULL
     ) AS has_active`,
    [symbol]
  );
  return result.rows[0].has_active;
};

/**
 * Alertas activas de unos símbolos con la nota no borradas, bloqueadas hasta el
 * fin de la transacción: un re-armado concurrente espera, así que nunca se
 * dispara una alerta con la evaluación de un objetivo viejo.
 */
export const findActiveBySymbolsForUpdate = async (symbols, exec) => {
  const result = await exec.query(
    `${ALERT_SELECT}
     WHERE pa.symbol = ANY($1::varchar[]) AND pa.status = 'active' AND an.deleted_at IS NULL
     ORDER BY pa.id
     FOR UPDATE OF pa`,
    [symbols]
  );
  return result.rows.map(parseAlert);
};

/** Fechas límite vencidas de alertas activas con la nota no borrada. */
export const findDueDeadlinesForUpdate = async (exec) => {
  const result = await exec.query(
    `${ALERT_SELECT}
     WHERE pa.status = 'active' AND pa.deadline_at IS NOT NULL AND pa.deadline_at <= NOW()
       AND an.deleted_at IS NULL
     ORDER BY pa.id
     FOR UPDATE OF pa`
  );
  return result.rows.map(parseAlert);
};

/**
 * Otras alertas activas del mismo anclaje (mismo bloque, o misma nota si es de
 * nota), del usuario.
 * @param {{ blockId: number|null, noteId: number|null }} anchor
 */
export const findActiveByAnchor = async (userId, { blockId, noteId }, excludeId = null, exec = pool) => {
  const result = await exec.query(
    `SELECT pa.id, pa.symbol, pa.direction, pa.target_price, pa.is_invalidation
     FROM price_alerts pa
     WHERE pa.user_id = $1 AND pa.status = 'active'
       AND ${blockId ? 'pa.block_id = $2' : 'pa.note_id = $2'}
       AND ($3::int IS NULL OR pa.id <> $3)
     ORDER BY pa.id`,
    [userId, blockId || noteId, excludeId]
  );
  return result.rows.map((r) => ({ ...r, target_price: Number(r.target_price) }));
};

/** Disparo: una vez por armado. Rellena near_at para no emitir la cercanía después. */
export const markTriggered = async (id, triggeredAt, exec) => {
  await exec.query(
    `UPDATE price_alerts
     SET status = 'triggered', triggered_at = $2, near_at = COALESCE(near_at, NOW())
     WHERE id = $1`,
    [id, triggeredAt]
  );
};

export const markNear = async (id, exec) => {
  await exec.query(`UPDATE price_alerts SET near_at = NOW() WHERE id = $1`, [id]);
};

/** La fecha límite se consume al avisar (queda en el payload de la tarjeta). */
export const clearDeadline = async (id, exec) => {
  await exec.query(`UPDATE price_alerts SET deadline_at = NULL WHERE id = $1`, [id]);
};
