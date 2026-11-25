-- ============================================================
-- MIGRACIÓN 033: orden de los tags dentro de su grupo.
--
-- - `note_tags.position`: orden del tag entre los de su grupo (Libre incluido,
--   group_id NULL). El orden canónico pasa a ser: posición del grupo, Libre al
--   final, posición del tag y, para empates, nombre.
--
-- Semilla: cada grupo (y Libre) de cada usuario queda numerado 0..n-1 por
-- nombre, el orden que se veía hasta ahora. Va dentro del IF NOT EXISTS de la
-- columna: volver a correr la migración no pisa el orden que eligió el usuario.
--
-- Va ANTES del deploy: el código anterior no lee la columna y el nuevo la
-- necesita.
--
-- Idempotente: la columna y la semilla solo se crean si la columna no existe.
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'note_tags' AND column_name = 'position'
  ) THEN
    ALTER TABLE note_tags ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

    UPDATE note_tags t
    SET position = o.ord
    FROM (
      SELECT id, (ROW_NUMBER() OVER (PARTITION BY user_id, group_id ORDER BY LOWER(name), id) - 1)::int AS ord
      FROM note_tags
    ) o
    WHERE t.id = o.id;
  END IF;
END $$;

COMMIT;

-- Validación post-migración:
--   \d note_tags   -- con position
--   SELECT user_id, group_id, position, name FROM note_tags ORDER BY user_id, group_id NULLS LAST, position;
