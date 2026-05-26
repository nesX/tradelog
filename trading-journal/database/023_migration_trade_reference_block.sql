-- ============================================================
-- MIGRACIÓN: Bloque `trade_reference` y tabla pivote
-- note_block_trades para galería de trades en notas.
-- ============================================================

BEGIN;

-- 1. Permitir el nuevo block_type
ALTER TABLE note_blocks DROP CONSTRAINT IF EXISTS note_blocks_block_type_check;
ALTER TABLE note_blocks ADD CONSTRAINT note_blocks_block_type_check
  CHECK (block_type IN ('text', 'image_gallery', 'reference', 'callout', 'trade_reference'));

-- 2. Tabla pivote bloque ↔ trades
CREATE TABLE IF NOT EXISTS note_block_trades (
  id         SERIAL PRIMARY KEY,
  block_id   INTEGER NOT NULL REFERENCES note_blocks(id) ON DELETE CASCADE,
  trade_id   INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(block_id, trade_id)
);

CREATE INDEX IF NOT EXISTS idx_note_block_trades_block_id ON note_block_trades(block_id);
CREATE INDEX IF NOT EXISTS idx_note_block_trades_trade_id ON note_block_trades(trade_id);

COMMIT;

-- Validación post-migración:
--   \d note_block_trades
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'note_blocks'::regclass AND conname = 'note_blocks_block_type_check';


public                   | note_block_trades                                | tabla    | postgres
 public                   | note_block_trades_id_seq                         | sequence | postgres


 public                   | prevent_section_as_parent                      | postgres

