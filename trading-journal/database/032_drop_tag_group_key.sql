-- ============================================================
-- MIGRACIÓN 032: borra los grupos fijos de la 030.
--
-- `note_tags.group_key` y su CHECK quedan reemplazados por `note_tags.group_id`
-- (031). En dev se aplica junto con la 031. En prod va DESPUÉS del deploy del
-- código que usa `group_id`: hasta entonces el código anterior lee `group_key`.
--
-- Idempotente: DROP ... IF EXISTS.
-- ============================================================

BEGIN;

ALTER TABLE note_tags DROP CONSTRAINT IF EXISTS note_tags_group_key_check;
ALTER TABLE note_tags DROP COLUMN IF EXISTS group_key;

COMMIT;

-- Validación post-migración:
--   \d note_tags   -- sin group_key
