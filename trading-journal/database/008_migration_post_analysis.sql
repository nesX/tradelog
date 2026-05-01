-- ============================================
-- Migración: Agregar campo post_analysis a trades
-- Fecha: 2026-02-01
-- ============================================

-- Agregar columna post_analysis para análisis posterior del trade
ALTER TABLE trades ADD COLUMN IF NOT EXISTS post_analysis TEXT;

COMMENT ON COLUMN trades.post_analysis IS 'Análisis posterior del trade, reflexiones después de cerrar la operación';
