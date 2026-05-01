-- ============================================
-- Trading Journal - Vistas
-- ============================================

-- Vista para estadísticas generales
CREATE OR REPLACE VIEW trade_stats AS
SELECT
    COUNT(*) FILTER (WHERE deleted_at IS NULL) as total_trades,
    COUNT(*) FILTER (WHERE status = 'OPEN' AND deleted_at IS NULL) as open_trades,
    COUNT(*) FILTER (WHERE status = 'CLOSED' AND deleted_at IS NULL) as closed_trades,
    COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl > 0 AND deleted_at IS NULL) as winning_trades,
    COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl < 0 AND deleted_at IS NULL) as losing_trades,
    COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl = 0 AND deleted_at IS NULL) as breakeven_trades,
    ROUND(COALESCE(SUM(pnl) FILTER (WHERE deleted_at IS NULL), 0)::numeric, 2) as total_pnl,
    ROUND(COALESCE(AVG(pnl) FILTER (WHERE status = 'CLOSED' AND deleted_at IS NULL), 0)::numeric, 2) as avg_pnl,
    ROUND(COALESCE(MAX(pnl) FILTER (WHERE deleted_at IS NULL), 0)::numeric, 2) as best_trade,
    ROUND(COALESCE(MIN(pnl) FILTER (WHERE deleted_at IS NULL), 0)::numeric, 2) as worst_trade,
    ROUND(
        CASE
            WHEN COUNT(*) FILTER (WHERE status = 'CLOSED' AND deleted_at IS NULL) > 0
            THEN (COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl > 0 AND deleted_at IS NULL)::numeric /
                  COUNT(*) FILTER (WHERE status = 'CLOSED' AND deleted_at IS NULL)::numeric) * 100
            ELSE 0
        END, 2
    ) as win_rate
FROM trades;

-- Vista para estadísticas por símbolo
CREATE OR REPLACE VIEW trade_stats_by_symbol AS
SELECT
    symbol,
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
GROUP BY symbol
ORDER BY total_pnl DESC;

-- Vista para trades activos (no eliminados)
CREATE OR REPLACE VIEW active_trades AS
SELECT
    id, symbol, trade_type, entry_price, exit_price, quantity,
    entry_date, exit_date, commission, pnl, pnl_percentage,
    image_url, notes, status, created_at, updated_at
FROM trades
WHERE deleted_at IS NULL
ORDER BY entry_date DESC;
