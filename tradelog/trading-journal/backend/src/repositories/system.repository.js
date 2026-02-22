import { query, getClient } from '../config/database.js';

// ==================
// SYSTEMS
// ==================

/**
 * Lista los sistemas activos del usuario (sin soft-deleted)
 */
export const findAllSystems = async (userId) => {
  const result = await query(
    `SELECT s.id, s.name, s.description, s.created_at,
            COUNT(sg.id) FILTER (WHERE sg.deleted_at IS NULL) AS signal_count
     FROM systems s
     LEFT JOIN signals sg ON sg.system_id = s.id
     WHERE s.user_id = $1 AND s.deleted_at IS NULL
     GROUP BY s.id
     ORDER BY s.created_at DESC`,
    [userId]
  );
  return result.rows;
};

/**
 * Obtiene un sistema con sus señales
 */
export const findSystemById = async (userId, systemId) => {
  const sysResult = await query(
    `SELECT id, name, description, created_at
     FROM systems
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [systemId, userId]
  );

  if (!sysResult.rows[0]) return null;

  const system = sysResult.rows[0];

  const sigResult = await query(
    `SELECT id, name, uses_scale
     FROM signals
     WHERE system_id = $1 AND deleted_at IS NULL
     ORDER BY id`,
    [systemId]
  );

  system.signals = sigResult.rows;
  return system;
};

/**
 * Crea un sistema junto con todas sus señales en una transacción
 */
export const createSystem = async (userId, { name, description, signals }) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const sysResult = await client.query(
      `INSERT INTO systems (user_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, created_at`,
      [userId, name, description || null]
    );
    const system = sysResult.rows[0];

    const createdSignals = [];
    for (const sig of signals) {
      const sigResult = await client.query(
        `INSERT INTO signals (system_id, name, uses_scale)
         VALUES ($1, $2, $3)
         RETURNING id, name, uses_scale`,
        [system.id, sig.name, sig.uses_scale ?? false]
      );
      createdSignals.push(sigResult.rows[0]);
    }

    await client.query('COMMIT');

    system.signals = createdSignals;
    return system;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Actualiza solo el nombre del sistema
 */
export const updateSystemName = async (userId, systemId, name) => {
  const result = await query(
    `UPDATE systems SET name = $1
     WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
     RETURNING id, name, description, created_at`,
    [name, systemId, userId]
  );
  return result.rows[0] || null;
};

/**
 * Verifica si un sistema tiene trades asociados
 */
export const systemHasTrades = async (systemId) => {
  const result = await query(
    `SELECT 1 FROM trades
     WHERE (primary_system_id = $1 OR secondary_system_id = $1)
       AND deleted_at IS NULL
     LIMIT 1`,
    [systemId]
  );
  return result.rows.length > 0;
};

/**
 * Soft-delete de sistema y sus señales
 */
export const softDeleteSystem = async (userId, systemId) => {
  const result = await query(
    `UPDATE systems SET deleted_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [systemId, userId]
  );
  if (!result.rows[0]) return false;

  // Soft-delete señales también
  await query(
    `UPDATE signals SET deleted_at = CURRENT_TIMESTAMP
     WHERE system_id = $1 AND deleted_at IS NULL`,
    [systemId]
  );
  return true;
};

/**
 * Hard-delete de sistema (solo cuando no tiene trades)
 */
export const hardDeleteSystem = async (userId, systemId) => {
  // Las señales se eliminan por CASCADE desde signals → systems no tiene cascade,
  // así que eliminamos manualmente señales primero
  await query(`DELETE FROM signals WHERE system_id = $1`, [systemId]);
  const result = await query(
    `DELETE FROM systems WHERE id = $1 AND user_id = $2 RETURNING id`,
    [systemId, userId]
  );
  return result.rows.length > 0;
};

// ==================
// TIMEFRAMES
// ==================

/**
 * Lista los timeframes del usuario
 */
export const findAllTimeframes = async (userId) => {
  const result = await query(
    `SELECT id, label, sort_order, created_at
     FROM user_timeframes
     WHERE user_id = $1
     ORDER BY sort_order, created_at`,
    [userId]
  );
  return result.rows;
};

/**
 * Crea un timeframe
 */
export const createTimeframe = async (userId, { label, sort_order }) => {
  const result = await query(
    `INSERT INTO user_timeframes (user_id, label, sort_order)
     VALUES ($1, $2, $3)
     RETURNING id, label, sort_order, created_at`,
    [userId, label, sort_order ?? 0]
  );
  return result.rows[0];
};

/**
 * Cuenta cuántos trades usan un timeframe
 */
export const countTradesUsingTimeframe = async (timeframeId) => {
  const result = await query(
    `SELECT COUNT(*) FROM trade_timeframes WHERE timeframe_id = $1`,
    [timeframeId]
  );
  return parseInt(result.rows[0].count, 10);
};

/**
 * Elimina un timeframe (solo si el usuario es dueño)
 */
export const deleteTimeframe = async (userId, timeframeId) => {
  const result = await query(
    `DELETE FROM user_timeframes
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [timeframeId, userId]
  );
  return result.rows.length > 0;
};

// ==================
// TRADE SIGNALS / TIMEFRAMES
// ==================

/**
 * Guarda señales de un trade (dentro de una transacción existente)
 */
export const insertTradeSignals = async (client, tradeId, systemRole, signalValues) => {
  for (const sv of signalValues) {
    await client.query(
      `INSERT INTO trade_signals (trade_id, signal_id, system_role, value)
       VALUES ($1, $2, $3, $4)`,
      [tradeId, sv.signal_id, systemRole, sv.value]
    );
  }
};

/**
 * Guarda timeframes de un trade (dentro de una transacción existente)
 */
export const insertTradeTimeframes = async (client, tradeId, timeframeIds) => {
  for (const tfId of timeframeIds) {
    await client.query(
      `INSERT INTO trade_timeframes (trade_id, timeframe_id)
       VALUES ($1, $2)`,
      [tradeId, tfId]
    );
  }
};

/**
 * Elimina trade_signals de un trade por rol (para actualización)
 */
export const deleteTradeSignalsByRole = async (client, tradeId, systemRole) => {
  await client.query(
    `DELETE FROM trade_signals WHERE trade_id = $1 AND system_role = $2`,
    [tradeId, systemRole]
  );
};

/**
 * Elimina todos los timeframes de un trade
 */
export const deleteAllTradeTimeframes = async (client, tradeId) => {
  await client.query(
    `DELETE FROM trade_timeframes WHERE trade_id = $1`,
    [tradeId]
  );
};

/**
 * Obtiene señales registradas de un trade para un sistema/rol dado
 */
export const getTradeSignals = async (tradeId, systemRole) => {
  const result = await query(
    `SELECT ts.signal_id, s.name, s.uses_scale, ts.value
     FROM trade_signals ts
     JOIN signals s ON s.id = ts.signal_id
     WHERE ts.trade_id = $1 AND ts.system_role = $2`,
    [tradeId, systemRole]
  );
  return result.rows;
};

/**
 * Obtiene timeframes de un trade (labels)
 */
export const getTradeTimeframes = async (tradeId) => {
  const result = await query(
    `SELECT ut.id, ut.label
     FROM trade_timeframes tt
     JOIN user_timeframes ut ON ut.id = tt.timeframe_id
     WHERE tt.trade_id = $1
     ORDER BY ut.sort_order, ut.created_at`,
    [tradeId]
  );
  return result.rows;
};

/**
 * Obtiene señales + timeframes para múltiples trades a la vez
 * Retorna { signals: { tradeId: { primary: [], secondary: [] } }, timeframes: { tradeId: [] } }
 */
export const getSystemDataForTrades = async (tradeIds) => {
  if (!tradeIds.length) return { signals: {}, timeframes: {} };

  const sigResult = await query(
    `SELECT ts.trade_id, ts.signal_id, s.name, s.uses_scale, ts.value, ts.system_role
     FROM trade_signals ts
     JOIN signals s ON s.id = ts.signal_id
     WHERE ts.trade_id = ANY($1)`,
    [tradeIds]
  );

  const tfResult = await query(
    `SELECT tt.trade_id, ut.id, ut.label
     FROM trade_timeframes tt
     JOIN user_timeframes ut ON ut.id = tt.timeframe_id
     WHERE tt.trade_id = ANY($1)
     ORDER BY ut.sort_order, ut.created_at`,
    [tradeIds]
  );

  const signals = {};
  for (const row of sigResult.rows) {
    if (!signals[row.trade_id]) signals[row.trade_id] = { primary: [], secondary: [] };
    signals[row.trade_id][row.system_role].push({
      signal_id: row.signal_id,
      name: row.name,
      uses_scale: row.uses_scale,
      value: row.value,
    });
  }

  const timeframes = {};
  for (const row of tfResult.rows) {
    if (!timeframes[row.trade_id]) timeframes[row.trade_id] = [];
    timeframes[row.trade_id].push(row.label);
  }

  return { signals, timeframes };
};

/**
 * Valida que todas las signal_ids pertenecen al system_id indicado
 */
export const validateSignalsBelongToSystem = async (systemId, signalIds) => {
  if (!signalIds.length) return true;
  const result = await query(
    `SELECT COUNT(*) FROM signals
     WHERE id = ANY($1) AND system_id = $2 AND deleted_at IS NULL`,
    [signalIds, systemId]
  );
  return parseInt(result.rows[0].count, 10) === signalIds.length;
};
