-- ============================================================
-- MIGRACIÓN: Renombrar block_type `note_link` → `reference`
-- y migrar la columna linked_note_id al campo metadata.
-- ============================================================

BEGIN;

-- 1. Quitar el CHECK constraint antiguo para poder actualizar a 'reference'.
ALTER TABLE note_blocks DROP CONSTRAINT IF EXISTS note_blocks_block_type_check;

-- 2. Mover linked_note_id al metadata como target_note_id,
--    snapshot del título como label, target_block_id = null.
UPDATE note_blocks nb
SET metadata = COALESCE(nb.metadata, '{}'::jsonb) || jsonb_build_object(
  'target_note_id', nb.linked_note_id,
  'target_block_id', NULL,
  'label', COALESCE(
    (SELECT title FROM notes n WHERE n.id = nb.linked_note_id AND n.deleted_at IS NULL),
    'Sub-nota'
  )
)
WHERE nb.block_type = 'note_link' AND nb.linked_note_id IS NOT NULL;

-- 3. Renombrar block_type.
UPDATE note_blocks SET block_type = 'reference' WHERE block_type = 'note_link';

-- 4. Reinstaurar CHECK constraint con el nuevo valor permitido.
ALTER TABLE note_blocks ADD CONSTRAINT note_blocks_block_type_check
  CHECK (block_type IN ('text', 'image_gallery', 'reference', 'callout'));

COMMIT;

-- Validación post-migración:
--   SELECT COUNT(*) FROM note_blocks WHERE block_type = 'note_link';   -- esperado: 0
--   SELECT id, block_type, metadata FROM note_blocks WHERE block_type = 'reference' LIMIT 5;
