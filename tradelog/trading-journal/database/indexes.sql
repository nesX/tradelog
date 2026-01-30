-- ============================================
-- Trading Journal - Índices Optimizados
-- ============================================

-- Índice para ordenar por fecha de entrada (más común)
CREATE INDEX IF NOT EXISTS idx_trades_entry_date ON trades(entry_date DESC);

-- Índice para filtrar por símbolo
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);

-- Índice para filtrar por estado (OPEN/CLOSED)
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);

-- Índice para ordenar por fecha de creación
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at DESC);

-- Índice para trades no eliminados (soft delete)
CREATE INDEX IF NOT EXISTS idx_trades_not_deleted ON trades(deleted_at) WHERE deleted_at IS NULL;

-- Índice compuesto para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_trades_symbol_status ON trades(symbol, status) WHERE deleted_at IS NULL;

-- Índice para filtrar por tipo de trade
CREATE INDEX IF NOT EXISTS idx_trades_type ON trades(trade_type);

-- Índice para rangos de fechas
CREATE INDEX IF NOT EXISTS idx_trades_date_range ON trades(entry_date, exit_date);
