BEGIN;

-- =========================================================
-- 1. Cambiar position de INTEGER a TEXT en notes
--    (fractional indexing: orden lexicográfico)
-- =========================================================

ALTER TABLE notes ADD COLUMN position_new TEXT;

-- Backfill: convertir enteros a fractional keys ordenados.
-- Usamos LPAD para que el orden lexicográfico coincida con el numérico original.
-- Ejemplo: 0 -> "a000000", 1 -> "a000001", 1000 -> "a001000"
UPDATE notes
SET position_new = 'a' || LPAD(position::text, 6, '0');

ALTER TABLE notes ALTER COLUMN position_new SET NOT NULL;
ALTER TABLE notes DROP COLUMN position;
ALTER TABLE notes RENAME COLUMN position_new TO position;

-- =========================================================
-- 2. Repetir para note_blocks (tabla real del proyecto)
-- =========================================================

ALTER TABLE note_blocks ADD COLUMN position_new TEXT;
UPDATE note_blocks
SET position_new = 'a' || LPAD(position::text, 6, '0');
ALTER TABLE note_blocks ALTER COLUMN position_new SET NOT NULL;
ALTER TABLE note_blocks DROP COLUMN position;
ALTER TABLE note_blocks RENAME COLUMN position_new TO position;

-- =========================================================
-- 3. Índices optimizados para DnD con fractional indexing
-- =========================================================

-- Hijos directos de una nota, ordenados por position.
-- Partial index excluye notas borradas para mantenerlo pequeño.
CREATE INDEX IF NOT EXISTS idx_notes_parent_position
  ON notes(parent_note_id, position)
  WHERE deleted_at IS NULL;

-- Notas raíz por usuario (parent_note_id IS NULL).
CREATE INDEX IF NOT EXISTS idx_notes_user_root_position
  ON notes(user_id, position)
  WHERE parent_note_id IS NULL AND deleted_at IS NULL;

-- Bloques ordenados por nota.
CREATE INDEX IF NOT EXISTS idx_note_blocks_note_position
  ON note_blocks(note_id, position);

COMMIT;

-- =========================================================
-- Verificación post-migración (ejecutar manualmente):
-- =========================================================
-- SELECT id, title, position FROM notes
--   WHERE parent_note_id IS NULL AND deleted_at IS NULL
--   ORDER BY position ASC;
--
-- SELECT id, block_type, position FROM note_blocks
--   WHERE note_id = <some_id>
--   ORDER BY position ASC;
