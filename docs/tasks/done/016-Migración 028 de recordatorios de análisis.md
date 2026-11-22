# Task: migración 028 — catálogo, alertas de precio, recordatorios por fecha y bandeja
2026-11-22 · Base de datos · Recordatorios de análisis 1/11 · Depende de: —

Spec: §2 de [alertas-de-precio-en-notas.md](../../features/specs/alertas-de-precio-en-notas.md).

## Objetivo
Crear todo el esquema de la feature en una migración idempotente: catálogo de
perpetuos con su checkpoint de vigilancia, alertas de precio, recordatorios por
fecha, la bandeja genérica de tarjetas (`notifications`), el estado del job y el
trigger que, al borrar un bloque, pasa sus alertas y recordatorios a la nota.

## Alcance

### 1. `database/028_migration_price_alerts_and_reminders.sql`
El SQL de §2 tal cual: `market_symbols`, `price_alerts`, `date_reminders`,
`notifications`, `reminder_job_state` (fila única sembrada con
`ON CONFLICT DO NOTHING`), los índices parciales, `reanchor_block_reminders()`
con su trigger `BEFORE DELETE` y los triggers de `updated_at` (la función
`update_updated_at_column()` existe desde `002_triggers.sql`).

- Va después de `027_migration_todos.sql`, que aún no está commiteada. 028 no
  depende de ella, pero el orden en dev y en prod debe ser 027 → 028.
- Idempotente: `IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`, `CREATE OR REPLACE`.

### 2. Supuestos de la spec, ya verificados en el código
- `note_blocks.note_id` existe (`013_migration_notes.sql:20`): el trigger puede
  usar `OLD.note_id`.
- Borrar un bloque es un `DELETE` real (`note.repository.js → deleteBlock`, un
  CTE que borra imágenes y bloque), así que dispara el trigger. Incluye el
  bloque `reference` de una sub-nota: `note.service.js → deleteBlock` hace
  soft-delete de la sub-nota y `DELETE` del bloque, y las alertas del bloque
  pasan a la nota padre.
- Mover un bloque a otra nota es un `UPDATE` (`moveBlockToNote →
  updateBlockNoteAndPosition`): las alertas viajan con el bloque sin código
  extra.

## Criterios de aceptación
- La migración corre dos veces seguidas sin errores.
- `reminder_job_state` tiene exactamente una fila (`id = 1`).
- Una alerta o un recordatorio con `note_id` y `block_id` a la vez, o sin
  ninguno, falla por la constraint `*_one_anchor`.
- Borrar un bloque con una alerta y un recordatorio: ambos quedan con
  `block_id = NULL` y `note_id` = la nota del bloque.
- Purgar una nota (`DELETE FROM notes`) con alertas en sus bloques y en la
  propia nota: todo se borra por CASCADE, sin errores de FK. Es el caso
  delicado del trigger: dentro del cascade, el `EXISTS` sobre `notes` debe ver
  la nota ya borrada y no re-anclar.
- Borrar una alerta deja sus tarjetas con `price_alert_id = NULL`.

## Verificación
No hay tests de BD: script manual en dev contra `tradelog-db`, dentro de
`BEGIN; … ROLLBACK;` para no dejar datos. Insertar a mano un símbolo
(`INSERT INTO market_symbols (symbol, contract_type, base_asset, quote_asset,
tick_size) VALUES ('BTCUSDT', 'PERPETUAL', 'BTC', 'USDT', 0.1)`), una alerta y
un recordatorio sobre un bloque existente, y recorrer los criterios.
