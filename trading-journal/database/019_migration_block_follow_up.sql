-- Agregar columna de seguimiento a bloques
ALTER TABLE note_blocks
  ADD COLUMN requires_follow_up BOOLEAN NOT NULL DEFAULT false;

-- Índice parcial: solo indexa bloques activos en seguimiento
CREATE INDEX idx_note_blocks_follow_up
  ON note_blocks (note_id, updated_at ASC)
  WHERE requires_follow_up = true;

-- Índice para consultas de actividad reciente
CREATE INDEX IF NOT EXISTS idx_note_blocks_updated
  ON note_blocks (updated_at DESC);
