-- =============================================================
-- Migración: Módulo de Backtesting
-- Ejecutar desde trading-journal/ con:
--   psql -d trading_journal -f database/migration_backtesting.sql
-- =============================================================

-- Tabla principal de sesiones de backtesting
CREATE TABLE backtest_sessions (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id),
  symbol                VARCHAR(20) NOT NULL,
  timeframe             VARCHAR(10) NOT NULL,
  period_date           DATE NOT NULL,

  -- Estado anímico al inicio
  mood_start_score      SMALLINT NOT NULL CHECK (mood_start_score BETWEEN 1 AND 5),
  mood_start_comment    TEXT,

  -- Estado anímico al cierre (se llena al cerrar la sesión)
  mood_end_score        SMALLINT CHECK (mood_end_score BETWEEN 1 AND 5),
  mood_end_comment      TEXT,

  -- Comentario de cierre obligatorio al cerrar
  closing_comment       TEXT,
  closed_at             TIMESTAMP,

  -- Relación de continuación
  parent_session_id     INTEGER REFERENCES backtest_sessions(id) ON DELETE SET NULL,

  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de trades dentro de una sesión de backtesting
CREATE TABLE backtest_trades (
  id          SERIAL PRIMARY KEY,
  session_id  INTEGER NOT NULL REFERENCES backtest_sessions(id) ON DELETE CASCADE,
  result      VARCHAR(20) NOT NULL CHECK (result IN ('long_win', 'long_loss', 'short_win', 'short_loss', 'break_even')),
  comment     TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_backtest_sessions_user_id ON backtest_sessions(user_id);
CREATE INDEX idx_backtest_sessions_parent ON backtest_sessions(parent_session_id);
CREATE INDEX idx_backtest_sessions_closed ON backtest_sessions(closed_at);
CREATE INDEX idx_backtest_trades_session_id ON backtest_trades(session_id);

-- Trigger para updated_at en backtest_sessions
-- Requiere que la función update_updated_at_column() ya exista (definida en triggers.sql)
CREATE TRIGGER update_backtest_sessions_updated_at
  BEFORE UPDATE ON backtest_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
