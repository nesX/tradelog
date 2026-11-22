-- ============================================================
-- MIGRACIÓN: Recordatorios de análisis (alertas de precio y por fecha)
--
-- Catálogo de perpetuos de Binance Futures USDⓈ-M con su checkpoint de
-- vigilancia, alertas de precio y recordatorios por fecha anclados a un bloque
-- o a una nota, la bandeja genérica de tarjetas (notifications) y el estado del
-- job. Al borrar un bloque, sus alertas y recordatorios pasan a la nota.
-- Spec: docs/features/specs/alertas-de-precio-en-notas.md (§2).
-- Va después de 027_migration_todos.sql.
-- ============================================================

BEGIN;

-- 1. Catálogo de perpetuos + checkpoint de vigilancia.
--    Global (los símbolos son datos públicos). Lo llena el sync diario de exchangeInfo.
--    Estar en el catálogo NO implica vigilancia: el job solo consulta símbolos con alertas activas.
CREATE TABLE IF NOT EXISTS market_symbols (
  symbol         VARCHAR(30) PRIMARY KEY,          -- 'BTCUSDT', 'XAUUSDT', 'NVDAUSDT'
  contract_type  VARCHAR(20) NOT NULL,             -- 'PERPETUAL' (cripto) | 'TRADIFI_PERPETUAL'
  base_asset     VARCHAR(20) NOT NULL,             -- 'BTC'
  quote_asset    VARCHAR(20) NOT NULL,             -- 'USDT'
  tick_size      NUMERIC(24, 12) NOT NULL,         -- PRICE_FILTER.tickSize: step del input de precio
  checked_until  TIMESTAMPTZ,                      -- openTime de la última vela vista (aún abierta); NULL = nunca vigilado
  last_price     NUMERIC(24, 8),                   -- close de la última vela leída por el job
  last_price_at  TIMESTAMPTZ,
  invalid_at     TIMESTAMPTZ,                      -- dejó de estar en TRADING (deslistado); NULL = vigente
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Alertas de precio
CREATE TABLE IF NOT EXISTS price_alerts (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id),
  note_id           INTEGER REFERENCES notes(id) ON DELETE CASCADE,
  block_id          INTEGER REFERENCES note_blocks(id) ON DELETE CASCADE,
  symbol            VARCHAR(30) NOT NULL REFERENCES market_symbols(symbol),
  direction         VARCHAR(5) NOT NULL CHECK (direction IN ('above', 'below')),
  target_price      NUMERIC(24, 8) NOT NULL CHECK (target_price > 0),
  is_invalidation   BOOLEAN NOT NULL DEFAULT FALSE,  -- FALSE: salta por toque; TRUE: solo por cierre diario
  near_pct          NUMERIC(5, 2) CHECK (near_pct IS NULL OR (near_pct > 0 AND near_pct <= 50)),
  deadline_at       TIMESTAMPTZ,                     -- fecha límite opcional; se pone a NULL al avisar
  price_at_creation NUMERIC(24, 8),                  -- lo pone el servidor desde la caché de precios; NULL si no había precio
  message           VARCHAR(500),                    -- "objetivo", "invalidación", ...
  status            VARCHAR(10) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'triggered')),
  armed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- creación o último re-armado
  near_at           TIMESTAMPTZ,                     -- se emitió (u omitió) el aviso de cercanía de este armado
  triggered_at      TIMESTAMPTZ,                     -- openTime de la vela que disparó
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT price_alerts_one_anchor CHECK (num_nonnulls(note_id, block_id) = 1)
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_active_symbol
  ON price_alerts (symbol) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_price_alerts_deadline
  ON price_alerts (deadline_at) WHERE status = 'active' AND deadline_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_price_alerts_block ON price_alerts (block_id) WHERE block_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_price_alerts_note  ON price_alerts (note_id)  WHERE note_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_price_alerts_user_status ON price_alerts (user_id, status);

-- 3. Recordatorios por fecha
CREATE TABLE IF NOT EXISTS date_reminders (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  note_id     INTEGER REFERENCES notes(id) ON DELETE CASCADE,
  block_id    INTEGER REFERENCES note_blocks(id) ON DELETE CASCADE,
  remind_at   TIMESTAMPTZ NOT NULL,
  message     VARCHAR(500),
  status      VARCHAR(10) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'sent')),
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT date_reminders_one_anchor CHECK (num_nonnulls(note_id, block_id) = 1)
);

CREATE INDEX IF NOT EXISTS idx_date_reminders_due
  ON date_reminders (remind_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_date_reminders_block ON date_reminders (block_id) WHERE block_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_date_reminders_note  ON date_reminders (note_id)  WHERE note_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_date_reminders_user_status ON date_reminders (user_id, status);

-- 4. Bandeja (genérica)
CREATE TABLE IF NOT EXISTS notifications (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  type             VARCHAR(30) NOT NULL,           -- price_alert_near | _hit | _invalidation | _deadline | _delisted | date_reminder_due
  price_alert_id   INTEGER REFERENCES price_alerts(id) ON DELETE SET NULL,
  date_reminder_id INTEGER REFERENCES date_reminders(id) ON DELETE SET NULL,
  payload          JSONB NOT NULL,                 -- foto del momento
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ,                    -- NULL = tarjeta abierta
  resolution       VARCHAR(20) CHECK (resolution IN ('dismissed', 'rearmed', 'updated'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_open
  ON notifications (user_id, created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_resolved
  ON notifications (user_id, resolved_at DESC) WHERE resolved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_open_alert
  ON notifications (price_alert_id) WHERE resolved_at IS NULL AND price_alert_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_open_reminder
  ON notifications (date_reminder_id) WHERE resolved_at IS NULL AND date_reminder_id IS NOT NULL;

-- 5. Estado del job (una sola fila)
CREATE TABLE IF NOT EXISTS reminder_job_state (
  id                SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_run_at       TIMESTAMPTZ,                   -- inicio del último tick
  catalog_synced_at TIMESTAMPTZ,                   -- último sync correcto de exchangeInfo
  backoff_until     TIMESTAMPTZ,                   -- 429/418: no llamar a Binance antes de esta fecha
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO reminder_job_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 6. Al borrar un bloque, sus alertas y recordatorios pasan a la nota.
--    Si la nota ya no existe (purga), no se re-ancla y actúa el CASCADE.
CREATE OR REPLACE FUNCTION reanchor_block_reminders()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM notes WHERE id = OLD.note_id) THEN
    UPDATE price_alerts   SET note_id = OLD.note_id, block_id = NULL WHERE block_id = OLD.id;
    UPDATE date_reminders SET note_id = OLD.note_id, block_id = NULL WHERE block_id = OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS note_blocks_reanchor_reminders ON note_blocks;
CREATE TRIGGER note_blocks_reanchor_reminders
  BEFORE DELETE ON note_blocks FOR EACH ROW EXECUTE FUNCTION reanchor_block_reminders();

-- 7. updated_at automático
DROP TRIGGER IF EXISTS update_market_symbols_updated_at ON market_symbols;
CREATE TRIGGER update_market_symbols_updated_at
  BEFORE UPDATE ON market_symbols FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_price_alerts_updated_at ON price_alerts;
CREATE TRIGGER update_price_alerts_updated_at
  BEFORE UPDATE ON price_alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_date_reminders_updated_at ON date_reminders;
CREATE TRIGGER update_date_reminders_updated_at
  BEFORE UPDATE ON date_reminders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_reminder_job_state_updated_at ON reminder_job_state;
CREATE TRIGGER update_reminder_job_state_updated_at
  BEFORE UPDATE ON reminder_job_state FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- Validación post-migración:
--   \d market_symbols
--   \d price_alerts
--   \d date_reminders
--   \d notifications
--   SELECT * FROM reminder_job_state;   -- exactamente una fila (id = 1)
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'note_blocks'::regclass AND NOT tgisinternal;
