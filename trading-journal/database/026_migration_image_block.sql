-- ============================================================
-- MIGRACIÓN: Bloque `image` (una sola imagen a ancho completo).
-- Reutiliza note_block_images: el bloque guarda como máximo una
-- fila (el backend reemplaza la anterior al subir una nueva).
-- ============================================================

BEGIN;

ALTER TABLE note_blocks DROP CONSTRAINT IF EXISTS note_blocks_block_type_check;
ALTER TABLE note_blocks ADD CONSTRAINT note_blocks_block_type_check
  CHECK (block_type IN ('text', 'image_gallery', 'image', 'reference', 'callout', 'trade_reference'));

COMMIT;

-- Validación post-migración:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'note_blocks'::regclass AND conname = 'note_blocks_block_type_check';
