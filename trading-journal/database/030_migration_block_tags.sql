-- ============================================================
-- MIGRACIÓN 030: grupos de tags y tags por bloque.
--
-- - `note_tags.group_key`: grupo fijo del tag (activo, tipo, estrategia,
--   resultado, libre). Los tags existentes quedan en 'libre'. La lista tiene que
--   coincidir con TAG_GROUPS (backend/src/constants/tagGroups.js y
--   frontend/src/constants/tagGroups.js).
-- - `note_block_tag_assignments`: tags asignados a bloques, con el mismo
--   vocabulario que los tags de nota. PK compuesta: ninguna asignación se
--   direcciona por id. El índice (tag_id, block_id) sirve al filtro del repaso
--   por tag con un index-only scan.
--
-- Cascadas: borrar un tag o un bloque borra sus asignaciones; la purga de notas
-- llega por nota → bloques → asignaciones. El soft delete de notas no las toca.
--
-- Idempotente: ADD COLUMN / CREATE ... IF NOT EXISTS, y el CHECK se recrea con
-- DROP ... IF EXISTS (como la 026): declarado junto al ADD COLUMN IF NOT EXISTS,
-- Postgres rechaza el nombre repetido en la segunda corrida.
-- Ver docs/features/specs/tags-bloques.md §3.
-- ============================================================

BEGIN;

ALTER TABLE note_tags
  ADD COLUMN IF NOT EXISTS group_key VARCHAR(20) NOT NULL DEFAULT 'libre';

ALTER TABLE note_tags DROP CONSTRAINT IF EXISTS note_tags_group_key_check;
ALTER TABLE note_tags ADD CONSTRAINT note_tags_group_key_check
  CHECK (group_key IN ('activo', 'tipo', 'estrategia', 'resultado', 'libre'));

CREATE TABLE IF NOT EXISTS note_block_tag_assignments (
  block_id INTEGER NOT NULL REFERENCES note_blocks(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES note_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (block_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_note_block_tag_assignments_tag
  ON note_block_tag_assignments(tag_id, block_id);

COMMIT;

-- Validación post-migración:
--   \d note_block_tag_assignments
--   SELECT group_key, COUNT(*) FROM note_tags GROUP BY group_key;
