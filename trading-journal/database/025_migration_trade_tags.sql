-- ============================================================
-- MIGRACIÓN: Etiquetas en trades
-- Espejo de note_tags / note_tag_assignments (013_migration_notes.sql)
-- aplicado a trades. Idempotente (IF NOT EXISTS en tablas e índices).
-- ============================================================

BEGIN;

-- 1. Tags globales del usuario, reutilizables entre trades
CREATE TABLE IF NOT EXISTS trade_tags (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  name            VARCHAR(100) NOT NULL,
  color           VARCHAR(7) DEFAULT '#6B7280',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla pivot trades ↔ tags
CREATE TABLE IF NOT EXISTS trade_tag_assignments (
  id              SERIAL PRIMARY KEY,
  trade_id        INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  tag_id          INTEGER NOT NULL REFERENCES trade_tags(id) ON DELETE CASCADE,
  UNIQUE(trade_id, tag_id)
);

-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_trade_tags_user_id ON trade_tags(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trade_tags_unique_name ON trade_tags(user_id, LOWER(name));
CREATE INDEX IF NOT EXISTS idx_trade_tag_assignments_trade ON trade_tag_assignments(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_tag_assignments_tag ON trade_tag_assignments(tag_id);

COMMIT;
