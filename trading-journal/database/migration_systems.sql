-- ============================================
-- Migration: Sistema de Estrategias y Señales
-- ============================================

-- 1. Tabla de sistemas de trading del usuario
CREATE TABLE IF NOT EXISTS systems (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL
);

-- 2. Tabla de señales que componen un sistema
CREATE TABLE IF NOT EXISTS signals (
    id SERIAL PRIMARY KEY,
    system_id INTEGER NOT NULL REFERENCES systems(id),
    name VARCHAR(100) NOT NULL,
    uses_scale BOOLEAN DEFAULT FALSE,
    -- uses_scale=false → booleana (presente/ausente)
    -- uses_scale=true  → escala: 1=débil, 2=media, 3=fuerte, 4=importante
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL
);

-- 3. Tabla de timeframes configurados por el usuario
CREATE TABLE IF NOT EXISTS user_timeframes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    label VARCHAR(20) NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla de señales registradas en un trade
CREATE TABLE IF NOT EXISTS trade_signals (
    id SERIAL PRIMARY KEY,
    trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    signal_id INTEGER NOT NULL REFERENCES signals(id),
    system_role VARCHAR(10) NOT NULL CHECK (system_role IN ('primary', 'secondary')),
    value INTEGER NOT NULL DEFAULT 1
    -- Para booleana: 1=presente (solo se guarda si está presente)
    -- Para escala:   1=débil, 2=media, 3=fuerte, 4=importante
);

-- 5. Tabla de timeframes usados en un trade
CREATE TABLE IF NOT EXISTS trade_timeframes (
    id SERIAL PRIMARY KEY,
    trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    timeframe_id INTEGER NOT NULL REFERENCES user_timeframes(id)
);

-- 6. Modificar tabla trades para agregar referencias a sistemas
ALTER TABLE trades
    ADD COLUMN IF NOT EXISTS primary_system_id INTEGER REFERENCES systems(id) ON DELETE SET NULL;

ALTER TABLE trades
    ADD COLUMN IF NOT EXISTS secondary_system_id INTEGER REFERENCES systems(id) ON DELETE SET NULL;

-- 7. Índices
CREATE INDEX IF NOT EXISTS idx_systems_user_id ON systems(user_id);
CREATE INDEX IF NOT EXISTS idx_signals_system_id ON signals(system_id);
CREATE INDEX IF NOT EXISTS idx_trade_signals_trade_id ON trade_signals(trade_id);
CREATE INDEX IF NOT EXISTS idx_user_timeframes_user_id ON user_timeframes(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_timeframes_trade_id ON trade_timeframes(trade_id);
