-- =============================================================
-- Migración v2: Módulo de Backtesting
-- Agrega period_end_date a backtest_sessions
-- Ejecutar desde trading-journal/ con:
--   psql -d trading_journal -f database/migration_backtesting_v2.sql
-- =============================================================

ALTER TABLE backtest_sessions
  ADD COLUMN period_end_date DATE;
