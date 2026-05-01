-- ============================================
-- Trading Journal - Triggers
-- ============================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Trigger para actualizar updated_at en trades
DROP TRIGGER IF EXISTS update_trades_updated_at ON trades;
CREATE TRIGGER update_trades_updated_at
    BEFORE UPDATE ON trades
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Función para actualizar status automáticamente cuando se cierra un trade
CREATE OR REPLACE FUNCTION auto_update_trade_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Si se establece exit_price y exit_date, marcar como CLOSED
    IF NEW.exit_price IS NOT NULL AND NEW.exit_date IS NOT NULL THEN
        NEW.status = 'CLOSED';
    -- Si se quitan exit_price o exit_date, marcar como OPEN
    ELSIF NEW.exit_price IS NULL OR NEW.exit_date IS NULL THEN
        NEW.status = 'OPEN';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Trigger para auto-actualizar status
DROP TRIGGER IF EXISTS auto_update_trade_status_trigger ON trades;
CREATE TRIGGER auto_update_trade_status_trigger
    BEFORE INSERT OR UPDATE ON trades
    FOR EACH ROW
    EXECUTE FUNCTION auto_update_trade_status();
