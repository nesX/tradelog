import { query } from '../config/database.js';

/**
 * Service para cálculos de estadísticas
 */

/**
 * Obtiene estadísticas generales
 * @returns {Promise<Object>}
 */
export const getGeneralStats = async () => {
  const result = await query(`SELECT * FROM trade_stats`);
  return result.rows[0] || {
    total_trades: 0,
    open_trades: 0,
    closed_trades: 0,
    winning_trades: 0,
    losing_trades: 0,
    breakeven_trades: 0,
    total_pnl: 0,
    avg_pnl: 0,
    best_trade: 0,
    worst_trade: 0,
    win_rate: 0,
  };
};

/**
 * Obtiene estadísticas por símbolo
 * @returns {Promise<Array>}
 */
export const getStatsBySymbol = async () => {
  const result = await query(`SELECT * FROM trade_stats_by_symbol`);
  return result.rows;
};

/**
 * Obtiene estadísticas filtradas por rango de fechas
 * @param {Date} dateFrom - Fecha inicial
 * @param {Date} dateTo - Fecha final
 * @returns {Promise<Object>}
 */
export const getStatsByDateRange = async (dateFrom, dateTo) => {
  const result = await query(`
    SELECT
      COUNT(*) as total_trades,
      COUNT(*) FILTER (WHERE status = 'OPEN') as open_trades,
      COUNT(*) FILTER (WHERE status = 'CLOSED') as closed_trades,
      COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl > 0) as winning_trades,
      COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl < 0) as losing_trades,
      COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl = 0) as breakeven_trades,
      ROUND(COALESCE(SUM(pnl), 0)::numeric, 2) as total_pnl,
      ROUND(COALESCE(AVG(pnl) FILTER (WHERE status = 'CLOSED'), 0)::numeric, 2) as avg_pnl,
      ROUND(COALESCE(MAX(pnl), 0)::numeric, 2) as best_trade,
      ROUND(COALESCE(MIN(pnl), 0)::numeric, 2) as worst_trade,
      ROUND(
        CASE
          WHEN COUNT(*) FILTER (WHERE status = 'CLOSED') > 0
          THEN (COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl > 0)::numeric /
                COUNT(*) FILTER (WHERE status = 'CLOSED')::numeric) * 100
          ELSE 0
        END, 2
      ) as win_rate
    FROM trades
    WHERE deleted_at IS NULL
      AND entry_date >= $1
      AND entry_date <= $2
  `, [dateFrom, dateTo]);

  return result.rows[0];
};

/**
 * Obtiene el P&L acumulado por día
 * @param {number} days - Número de días hacia atrás
 * @returns {Promise<Array>}
 */
export const getDailyPnL = async (days = 30) => {
  const result = await query(`
    SELECT
      DATE(entry_date) as date,
      COUNT(*) as trades_count,
      ROUND(COALESCE(SUM(pnl), 0)::numeric, 2) as daily_pnl,
      SUM(SUM(pnl)) OVER (ORDER BY DATE(entry_date)) as cumulative_pnl
    FROM trades
    WHERE deleted_at IS NULL
      AND status = 'CLOSED'
      AND entry_date >= CURRENT_DATE - INTERVAL '${days} days'
    GROUP BY DATE(entry_date)
    ORDER BY date
  `);

  return result.rows;
};

/**
 * Obtiene el resumen de trades por tipo (LONG/SHORT)
 * @returns {Promise<Object>}
 */
export const getStatsByTradeType = async () => {
  const result = await query(`
    SELECT
      trade_type,
      COUNT(*) as total_trades,
      COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl > 0) as winning_trades,
      COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl < 0) as losing_trades,
      ROUND(COALESCE(SUM(pnl), 0)::numeric, 2) as total_pnl,
      ROUND(COALESCE(AVG(pnl) FILTER (WHERE status = 'CLOSED'), 0)::numeric, 2) as avg_pnl,
      ROUND(
        CASE
          WHEN COUNT(*) FILTER (WHERE status = 'CLOSED') > 0
          THEN (COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl > 0)::numeric /
                COUNT(*) FILTER (WHERE status = 'CLOSED')::numeric) * 100
          ELSE 0
        END, 2
      ) as win_rate
    FROM trades
    WHERE deleted_at IS NULL
    GROUP BY trade_type
  `);

  // Convertir a objeto
  const stats = {
    LONG: null,
    SHORT: null,
  };

  result.rows.forEach(row => {
    stats[row.trade_type] = row;
  });

  return stats;
};

/**
 * Obtiene los mejores y peores trades
 * @param {number} limit - Número de trades a retornar
 * @returns {Promise<Object>}
 */
export const getTopTrades = async (limit = 5) => {
  const bestQuery = query(`
    SELECT id, symbol, trade_type, entry_price, exit_price,
           ROUND(pnl::numeric, 2) as pnl,
           ROUND(pnl_percentage::numeric, 2) as pnl_percentage,
           entry_date
    FROM trades
    WHERE deleted_at IS NULL AND status = 'CLOSED' AND pnl IS NOT NULL
    ORDER BY pnl DESC
    LIMIT $1
  `, [limit]);

  const worstQuery = query(`
    SELECT id, symbol, trade_type, entry_price, exit_price,
           ROUND(pnl::numeric, 2) as pnl,
           ROUND(pnl_percentage::numeric, 2) as pnl_percentage,
           entry_date
    FROM trades
    WHERE deleted_at IS NULL AND status = 'CLOSED' AND pnl IS NOT NULL
    ORDER BY pnl ASC
    LIMIT $1
  `, [limit]);

  const [bestResult, worstResult] = await Promise.all([bestQuery, worstQuery]);

  return {
    best: bestResult.rows,
    worst: worstResult.rows,
  };
};
