-- ============================================================
-- MIGRACIÓN: Listas de pendientes (TODO)
--
-- Cada item tiene detrás una nota oculta (notes.type = 'todo') que guarda
-- su contenido con el sistema de bloques de notas (texto markdown, imagen,
-- galería). Esas notas no aparecen en el árbol, búsqueda, exportación ni
-- en Revisión/Repaso. Al ser type <> 'note', el CHECK sections_only_at_root
-- ya las obliga a vivir a nivel raíz.
-- ============================================================

BEGIN;

-- 1. Nuevo tipo de nota
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_type_check;
ALTER TABLE notes ADD CONSTRAINT notes_type_check
  CHECK (type IN ('note', 'section', 'todo'));

-- 2. Listas
CREATE TABLE IF NOT EXISTS todo_lists (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  name        VARCHAR(200) NOT NULL,
  position    TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Items. position es fractional indexing (orden COLLATE "C"), compartido
--    entre pendientes y completados de la misma lista.
CREATE TABLE IF NOT EXISTS todo_items (
  id            SERIAL PRIMARY KEY,
  list_id       INTEGER NOT NULL REFERENCES todo_lists(id) ON DELETE CASCADE,
  note_id       INTEGER NOT NULL UNIQUE REFERENCES notes(id) ON DELETE CASCADE,
  title         VARCHAR(500) NOT NULL,
  position      TEXT NOT NULL,
  completed_at  TIMESTAMP DEFAULT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_todo_lists_user_position ON todo_lists(user_id, position);
CREATE INDEX IF NOT EXISTS idx_todo_items_list_position ON todo_items(list_id, position);

-- 4. updated_at automático
DROP TRIGGER IF EXISTS update_todo_lists_updated_at ON todo_lists;
CREATE TRIGGER update_todo_lists_updated_at
  BEFORE UPDATE ON todo_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_todo_items_updated_at ON todo_items;
CREATE TRIGGER update_todo_items_updated_at
  BEFORE UPDATE ON todo_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- Validación post-migración:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'notes'::regclass AND conname = 'notes_type_check';
--   \d todo_lists
--   \d todo_items
