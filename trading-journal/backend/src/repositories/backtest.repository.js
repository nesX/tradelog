import { query, getClient } from '../config/database.js';

// ==================
// SESIONES
// ==================

/**
 * Lista todas las sesiones del usuario con contadores de trades y win rate
 */
export const findAllByUser = async (userId) => {
  const sql = `
    SELECT
      s.*,
      p.symbol AS parent_symbol,
      p.period_date AS parent_period_date,
      COUNT(t.id) AS total_trades,
      COUNT(t.id) FILTER (WHERE t.result = 'long_win') AS long_wins,
      COUNT(t.id) FILTER (WHERE t.result = 'long_loss') AS long_losses,
      COUNT(t.id) FILTER (WHERE t.result = 'short_win') AS short_wins,
      COUNT(t.id) FILTER (WHERE t.result = 'short_loss') AS short_losses,
      COUNT(t.id) FILTER (WHERE t.result = 'break_even') AS break_evens,
      ROUND(
        COUNT(t.id) FILTER (WHERE t.result IN ('long_win', 'short_win'))::numeric /
        NULLIF(COUNT(t.id), 0) * 100, 1
      ) AS win_rate
    FROM backtest_sessions s
    LEFT JOIN backtest_sessions p ON s.parent_session_id = p.id
    LEFT JOIN backtest_trades t ON t.session_id = s.id
    WHERE s.user_id = $1
    GROUP BY s.id, p.symbol, p.period_date
    ORDER BY s.created_at DESC
  `;
  const result = await query(sql, [userId]);
  return result.rows;
};

/**
 * Obtiene una sesión con sus trades
 */
export const findById = async (id, userId) => {
  const sessionSql = `
    SELECT
      s.*,
      p.symbol AS parent_symbol,
      p.period_date AS parent_period_date,
      COUNT(t.id) AS total_trades,
      COUNT(t.id) FILTER (WHERE t.result = 'long_win') AS long_wins,
      COUNT(t.id) FILTER (WHERE t.result = 'long_loss') AS long_losses,
      COUNT(t.id) FILTER (WHERE t.result = 'short_win') AS short_wins,
      COUNT(t.id) FILTER (WHERE t.result = 'short_loss') AS short_losses,
      COUNT(t.id) FILTER (WHERE t.result = 'break_even') AS break_evens,
      ROUND(
        COUNT(t.id) FILTER (WHERE t.result IN ('long_win', 'short_win'))::numeric /
        NULLIF(COUNT(t.id), 0) * 100, 1
      ) AS win_rate
    FROM backtest_sessions s
    LEFT JOIN backtest_sessions p ON s.parent_session_id = p.id
    LEFT JOIN backtest_trades t ON t.session_id = s.id
    WHERE s.id = $1 AND s.user_id = $2
    GROUP BY s.id, p.symbol, p.period_date
  `;
  const sessionResult = await query(sessionSql, [id, userId]);
  if (sessionResult.rows.length === 0) return null;

  const tradesSql = `
    SELECT id, result, comment, image_filename, image_original_name, created_at
    FROM backtest_trades
    WHERE session_id = $1
    ORDER BY created_at ASC
  `;
  const tradesResult = await query(tradesSql, [id]);

  return { ...sessionResult.rows[0], trades: tradesResult.rows };
};

/**
 * Solo datos de la sesión sin trades (para verificaciones y continuación)
 */
export const findByIdRaw = async (id, userId) => {
  const sql = `
    SELECT * FROM backtest_sessions
    WHERE id = $1 AND user_id = $2
  `;
  const result = await query(sql, [id, userId]);
  return result.rows[0] || null;
};

/**
 * Crea una sesión nueva
 */
export const create = async (data) => {
  const sql = `
    INSERT INTO backtest_sessions
      (user_id, symbol, timeframe, period_date, mood_start_score, mood_start_comment, description, parent_session_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;
  const params = [
    data.user_id,
    data.symbol,
    data.timeframe,
    data.period_date,
    data.mood_start_score,
    data.mood_start_comment || null,
    data.description || null,
    data.parent_session_id || null,
  ];
  const result = await query(sql, params);
  return result.rows[0];
};

/**
 * Actualiza la descripción de la sesión
 */
export const updateDescription = async (id, userId, description) => {
  const sql = `
    UPDATE backtest_sessions
    SET description = $3
    WHERE id = $1 AND user_id = $2
    RETURNING *
  `;
  const result = await query(sql, [id, userId, description || null]);
  return result.rows[0] || null;
};

/**
 * Cierra una sesión
 */
export const closeSession = async (id, userId, data) => {
  const sql = `
    UPDATE backtest_sessions
    SET mood_end_score = $3, mood_end_comment = $4, closing_comment = $5,
        period_end_date = $6, closed_at = NOW()
    WHERE id = $1 AND user_id = $2
    RETURNING *
  `;
  const params = [
    id,
    userId,
    data.mood_end_score,
    data.mood_end_comment || null,
    data.closing_comment,
    data.period_end_date,
  ];
  const result = await query(sql, params);
  return result.rows[0] || null;
};

// ==================
// TRADES
// ==================

/**
 * Agrega un trade a una sesión activa
 */
export const addTrade = async (sessionId, data) => {
  const sql = `
    INSERT INTO backtest_trades
      (session_id, result, comment, image_filename, image_original_name, image_file_size, image_mime_type)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;
  const params = [
    sessionId,
    data.result,
    data.comment,
    data.image_filename || null,
    data.image_original_name || null,
    data.image_file_size || null,
    data.image_mime_type || null,
  ];
  const result = await query(sql, params);
  return result.rows[0];
};

/**
 * Elimina la imagen de un trade (pone a NULL los campos de imagen)
 */
export const clearTradeImage = async (tradeId) => {
  const sql = `
    UPDATE backtest_trades
    SET image_filename = NULL, image_original_name = NULL,
        image_file_size = NULL, image_mime_type = NULL
    WHERE id = $1
    RETURNING *
  `;
  const result = await query(sql, [tradeId]);
  return result.rows[0] || null;
};

/**
 * Elimina un trade por ID verificando que pertenece a la sesión
 */
export const deleteTrade = async (tradeId, sessionId) => {
  const sql = `
    DELETE FROM backtest_trades
    WHERE id = $1 AND session_id = $2
    RETURNING *
  `;
  const result = await query(sql, [tradeId, sessionId]);
  return result.rows[0] || null;
};

/**
 * Obtiene un trade con los datos de su sesión (para verificar propiedad)
 */
export const findTradeWithSession = async (tradeId, userId) => {
  const sql = `
    SELECT t.*, s.user_id AS session_user_id, s.closed_at AS session_closed_at
    FROM backtest_trades t
    JOIN backtest_sessions s ON t.session_id = s.id
    WHERE t.id = $1 AND s.user_id = $2
  `;
  const result = await query(sql, [tradeId, userId]);
  return result.rows[0] || null;
};
