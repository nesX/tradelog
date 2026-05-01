-- Agregar columna metadata JSONB a note_blocks
ALTER TABLE note_blocks ADD COLUMN metadata JSONB DEFAULT '{}';

-- Actualizar CHECK constraint para incluir 'callout'
ALTER TABLE note_blocks DROP CONSTRAINT note_blocks_block_type_check;
ALTER TABLE note_blocks ADD CONSTRAINT note_blocks_block_type_check
  CHECK (block_type IN ('text', 'image_gallery', 'note_link', 'callout'));
