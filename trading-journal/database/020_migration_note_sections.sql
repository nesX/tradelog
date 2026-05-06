BEGIN;

-- 1. Columna type
ALTER TABLE notes
  ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'note';

-- 2. Restringir valores válidos
ALTER TABLE notes
  ADD CONSTRAINT notes_type_check
  CHECK (type IN ('note', 'section'));

-- 3. Secciones siempre a nivel raíz
ALTER TABLE notes
  ADD CONSTRAINT sections_only_at_root
  CHECK (type = 'note' OR parent_note_id IS NULL);

-- 4. Trigger: una nota no puede tener una sección como padre (cross-row, no se puede hacer con CHECK)
CREATE OR REPLACE FUNCTION prevent_section_as_parent()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_note_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM notes
      WHERE id = NEW.parent_note_id
        AND type = 'section'
    ) THEN
      RAISE EXCEPTION 'Una nota no puede tener una sección como padre (parent_note_id=%)', NEW.parent_note_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notes_no_section_parent
  BEFORE INSERT OR UPDATE OF parent_note_id ON notes
  FOR EACH ROW
  EXECUTE FUNCTION prevent_section_as_parent();

COMMIT;
