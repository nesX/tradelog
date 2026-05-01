-- ============================================
-- Trading Journal - Schema de Base de Datos
-- ============================================

-- Crear extensión para UUIDs si es necesario
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLA PRINCIPAL: trades
-- ============================================
CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    trade_type VARCHAR(10) NOT NULL CHECK (trade_type IN ('LONG', 'SHORT')),
    entry_price DECIMAL(18, 8) NOT NULL CHECK (entry_price > 0),
    exit_price DECIMAL(18, 8) CHECK (exit_price IS NULL OR exit_price > 0),
    quantity DECIMAL(18, 8) NOT NULL CHECK (quantity > 0),
    entry_date TIMESTAMP NOT NULL,
    exit_date TIMESTAMP,
    commission DECIMAL(18, 8) DEFAULT 0 CHECK (commission >= 0),

    -- PnL calculado automáticamente
    pnl DECIMAL(18, 8) GENERATED ALWAYS AS (
        CASE
            WHEN exit_price IS NOT NULL THEN
                CASE
                    WHEN trade_type = 'LONG' THEN (exit_price - entry_price) * quantity - COALESCE(commission, 0)
                    WHEN trade_type = 'SHORT' THEN (entry_price - exit_price) * quantity - COALESCE(commission, 0)
                END
            ELSE NULL
        END
    ) STORED,

    -- Porcentaje de PnL calculado automáticamente
    pnl_percentage DECIMAL(10, 4) GENERATED ALWAYS AS (
        CASE
            WHEN exit_price IS NOT NULL AND entry_price > 0 THEN
                CASE
                    WHEN trade_type = 'LONG' THEN ((exit_price - entry_price) / entry_price) * 100
                    WHEN trade_type = 'SHORT' THEN ((entry_price - exit_price) / entry_price) * 100
                END
            ELSE NULL
        END
    ) STORED,

    notes TEXT,
    status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Soft delete
    deleted_at TIMESTAMP DEFAULT NULL
);

-- Comentarios descriptivos
COMMENT ON TABLE trades IS 'Tabla principal para almacenar trades del trading journal';
COMMENT ON COLUMN trades.pnl IS 'Profit/Loss calculado automáticamente basado en precios y tipo de trade';
COMMENT ON COLUMN trades.pnl_percentage IS 'Porcentaje de ganancia/pérdida respecto al precio de entrada';
COMMENT ON COLUMN trades.deleted_at IS 'Soft delete - si no es NULL, el trade está eliminado';

-- ============================================
-- TABLA: trade_images (múltiples imágenes por trade)
-- ============================================
CREATE TABLE IF NOT EXISTS trade_images (
    id SERIAL PRIMARY KEY,
    trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    file_size INTEGER,
    mime_type VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para buscar imágenes por trade
CREATE INDEX IF NOT EXISTS idx_trade_images_trade_id ON trade_images(trade_id);

COMMENT ON TABLE trade_images IS 'Imágenes asociadas a cada trade';
COMMENT ON COLUMN trade_images.filename IS 'Nombre único del archivo en el servidor';
COMMENT ON COLUMN trade_images.original_name IS 'Nombre original del archivo subido';
