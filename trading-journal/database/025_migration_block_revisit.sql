-- ============================================================
-- MIGRACIÓN: marca "Repaso" en bloques (espejo de "Revisión"/follow-up).
--
-- `marked_for_revisit` permite marcar bloques para repasarlos más tarde,
-- independiente de `requires_follow_up`. La vista "Repaso" del frontend lista
-- los bloques marcados, ordenados por antigüedad (updated_at ASC).
--
-- Se recrea el trigger update_note_blocks_updated_at copiando la cláusula WHEN
-- de la migración 024 (que excluye los cambios de solo-posición para no ensuciar
-- la "actividad reciente") y añadiendo el nuevo campo, de modo que marcar/desmarcar
-- para repaso cuente como actividad, igual que el follow-up.
--
-- Idempotente: usa IF NOT EXISTS y recrea el trigger con DROP ... IF EXISTS.
-- ============================================================

BEGIN;

-- Columna de marca de repaso
ALTER TABLE note_blocks
  ADD COLUMN IF NOT EXISTS marked_for_revisit BOOLEAN NOT NULL DEFAULT false;

-- Índice parcial: solo indexa bloques activamente marcados para repaso
CREATE INDEX IF NOT EXISTS idx_note_blocks_revisit
  ON note_blocks (note_id, updated_at ASC)
  WHERE marked_for_revisit = true;

-- Recrear el trigger de updated_at incluyendo el nuevo campo en la cláusula WHEN.
-- Se copia la lista de la migración 024 (excluye cambios de solo `position`) y se
-- añade marked_for_revisit para que marcar/desmarcar repaso cuente como actividad.
DROP TRIGGER IF EXISTS update_note_blocks_updated_at ON note_blocks;

CREATE TRIGGER update_note_blocks_updated_at
  BEFORE UPDATE ON note_blocks
  FOR EACH ROW
  WHEN (
    OLD.content IS DISTINCT FROM NEW.content
    OR OLD.metadata IS DISTINCT FROM NEW.metadata
    OR OLD.block_type IS DISTINCT FROM NEW.block_type
    OR OLD.linked_note_id IS DISTINCT FROM NEW.linked_note_id
    OR OLD.requires_follow_up IS DISTINCT FROM NEW.requires_follow_up
    OR OLD.marked_for_revisit IS DISTINCT FROM NEW.marked_for_revisit
  )
  EXECUTE FUNCTION update_updated_at_column();

COMMIT;
