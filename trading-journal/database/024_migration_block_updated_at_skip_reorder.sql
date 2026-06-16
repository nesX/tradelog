-- ============================================================
-- MIGRACIÓN: el trigger de updated_at de note_blocks NO debe
-- dispararse cuando lo único que cambió fue `position` (reorden /
-- drag-and-drop). Así la vista de Revisión ("actividad reciente")
-- no trata un bloque meramente reordenado como editado.
--
-- No se modifica la función compartida update_updated_at_column()
-- (la usan trades, backtests, etc.): solo se recrea el trigger de
-- note_blocks con una cláusula WHEN que excluye los cambios de
-- posición. El repo además deja de setear updated_at = NOW() en
-- updateBlockPosition (si lo hiciera, sobreescribiría este efecto).
-- ============================================================

BEGIN;

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
  )
  EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- Validación post-migración:
--   -- reordenar (solo position) NO debe cambiar updated_at:
--   UPDATE note_blocks SET position = position WHERE id = <id>;  -- no-op real
--   -- editar contenido SÍ debe cambiarlo.
