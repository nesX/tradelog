-- ============================================================
-- MIGRACIÓN: Notificaciones push (Web Push) de los recordatorios
--
-- Dispositivos vinculados a mano desde /recordatorios ("Avisos en este
-- dispositivo") y la marca de agua con la que el job decide de qué tarjetas
-- avisar. Las tarjetas (notifications) no cambian.
-- Spec: docs/features/specs/notificaciones-push-pwa.md (§2).
-- Va después de 028_migration_price_alerts_and_reminders.sql.
-- ============================================================

BEGIN;

-- 1. Suscripciones Web Push: una fila por navegador/dispositivo en el que el usuario
--    activó los avisos. El endpoint identifica al dispositivo (lo genera el servicio
--    de push del navegador) y es único: un dispositivo recibe los avisos de una sola
--    cuenta, y si otra lo activa, la fila pasa a ser suya.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,                     -- clave pública del navegador (base64url)
  auth          TEXT NOT NULL,                     -- secreto de autenticación (base64url)
  user_agent    VARCHAR(300),                      -- solo para depurar ("iPhone", "Chrome Linux"…)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() -- última comprobación desde la app
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);

-- 2. Marca de agua: id de la última tarjeta de la que ya se intentó avisar por push.
--    Se siembra en MAX(id) para no avisar del histórico al desplegar. El WHERE la
--    hace idempotente: re-aplicar la migración no la mueve.
ALTER TABLE reminder_job_state ADD COLUMN IF NOT EXISTS push_notified_id INTEGER;
UPDATE reminder_job_state
   SET push_notified_id = (SELECT COALESCE(MAX(id), 0) FROM notifications)
 WHERE id = 1 AND push_notified_id IS NULL;

COMMIT;

-- Validación post-migración:
--   \d push_subscriptions
--   SELECT push_notified_id, (SELECT MAX(id) FROM notifications) FROM reminder_job_state;
