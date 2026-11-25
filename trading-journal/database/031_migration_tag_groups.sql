-- ============================================================
-- MIGRACIÓN 031: grupos de tags por usuario.
--
-- - `note_tag_groups`: los grupos de cada usuario, con nombre (único sin
--   distinguir mayúsculas), color (el que se propone a los tags nuevos del grupo)
--   y `position` (orden de los grupos y, con él, el orden canónico de los tags).
-- - `note_tags.group_id`: grupo del tag. NULL es "Libre": no hay una fila para
--   Libre, va siempre al final y borrar un grupo deja sus tags ahí
--   (ON DELETE SET NULL), sin quitarlos de ninguna nota ni bloque.
--
-- Semilla: los usuarios que no tienen ningún grupo reciben Activo, Tipo,
-- Estrategia y Resultado (los grupos fijos de la 030, con sus colores y su
-- orden), y cada tag pasa al grupo de su `group_key`. Libre no se siembra. Las
-- dos cosas van dentro de un IF EXISTS sobre `group_key`: tras la 032 (que borra
-- la columna) la 031 ya no siembra ni mueve nada, así que volver a correrla no
-- resucita grupos que el usuario borró.
--
-- No borra `group_key`: el código anterior la sigue usando entre esta migración
-- y el deploy. La borra la 032, que en prod va DESPUÉS del deploy.
--
-- Idempotente: CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS, y la semilla
-- y el UPDATE solo tocan usuarios sin grupos y tags con group_id NULL.
-- Ver docs/tasks (046) y docs/features/specs/tags-bloques.md (D1).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS note_tag_groups (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(50) NOT NULL,
  color      VARCHAR(7) NOT NULL DEFAULT '#6B7280',
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- También sirve para listar los grupos de un usuario (prefijo user_id).
CREATE UNIQUE INDEX IF NOT EXISTS uq_note_tag_groups_user_name
  ON note_tag_groups (user_id, LOWER(name));

ALTER TABLE note_tags
  ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES note_tag_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_note_tags_group ON note_tags (group_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'note_tags' AND column_name = 'group_key'
  ) THEN
    INSERT INTO note_tag_groups (user_id, name, color, position)
    SELECT u.id, g.name, g.color, g.position
    FROM users u
    CROSS JOIN (VALUES
      ('Activo', '#3B82F6', 0),
      ('Tipo', '#F59E0B', 1),
      ('Estrategia', '#8B5CF6', 2),
      ('Resultado', '#10B981', 3)
    ) AS g(name, color, position)
    WHERE NOT EXISTS (SELECT 1 FROM note_tag_groups x WHERE x.user_id = u.id);

    -- Las claves de la 030 son los nombres en minúsculas.
    UPDATE note_tags t
    SET group_id = g.id
    FROM note_tag_groups g
    WHERE g.user_id = t.user_id
      AND t.group_id IS NULL
      AND t.group_key <> 'libre'
      AND LOWER(g.name) = t.group_key;
  END IF;
END $$;

COMMIT;

-- Validación post-migración:
--   \d note_tag_groups
--   SELECT user_id, name, position FROM note_tag_groups ORDER BY user_id, position;
--   -- Tiene que dar 0 filas (tags con grupo en la 030 que no pasaron a group_id):
--   SELECT id, user_id, name, group_key FROM note_tags WHERE group_key <> 'libre' AND group_id IS NULL;
