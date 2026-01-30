-- ============================================
-- Trading Journal - Datos de Prueba
-- ============================================

-- Trades de ejemplo para testing
INSERT INTO trades (symbol, trade_type, entry_price, exit_price, quantity, entry_date, exit_date, commission, notes) VALUES
-- Trades cerrados con ganancia
('BTCUSDT', 'LONG', 42000.00, 44500.00, 0.5, '2025-01-10 09:30:00', '2025-01-12 14:45:00', 10.50, 'Breakout en resistencia clave'),
('ETHUSDT', 'LONG', 2200.00, 2450.00, 2.0, '2025-01-08 11:00:00', '2025-01-11 16:30:00', 5.25, 'Patrón de doble suelo'),
('SOLUSDT', 'SHORT', 125.00, 110.00, 10.0, '2025-01-05 08:15:00', '2025-01-07 10:00:00', 3.00, 'Rechazo en máximo anterior'),

-- Trades cerrados con pérdida
('BTCUSDT', 'LONG', 45000.00, 43500.00, 0.3, '2025-01-13 10:00:00', '2025-01-14 09:00:00', 8.00, 'Stop loss ejecutado'),
('AVAXUSDT', 'SHORT', 35.00, 38.50, 20.0, '2025-01-06 14:00:00', '2025-01-06 18:00:00', 2.50, 'Squeeze alcista inesperado'),

-- Trades abiertos
('ETHUSDT', 'LONG', 2350.00, NULL, 1.5, '2025-01-15 09:00:00', NULL, 4.00, 'Esperando ruptura de consolidación'),
('LINKUSDT', 'SHORT', 18.50, NULL, 50.0, '2025-01-14 16:00:00', NULL, 1.50, 'Divergencia bajista en RSI'),

-- Más trades para estadísticas
('BTCUSDT', 'SHORT', 47000.00, 44000.00, 0.2, '2025-01-02 12:00:00', '2025-01-04 15:00:00', 6.00, 'Rechazo en 47k'),
('ADAUSDT', 'LONG', 0.55, 0.62, 1000.0, '2025-01-01 08:00:00', '2025-01-03 12:00:00', 1.00, 'Rebote en soporte'),
('DOTUSDT', 'LONG', 7.50, 7.20, 100.0, '2025-01-09 10:30:00', '2025-01-10 08:00:00', 0.75, 'Falló el soporte');

-- Verificar datos insertados
SELECT
    id, symbol, trade_type,
    entry_price, exit_price,
    ROUND(pnl::numeric, 2) as pnl,
    ROUND(pnl_percentage::numeric, 2) as pnl_pct,
    status
FROM trades
ORDER BY entry_date DESC;
