# Arquitectura — Base de datos

PostgreSQL 16 (en compose dev). En producción se conecta al postgres compartido del proyecto `market-tracker`.

Migraciones: `trading-journal/database/0NN_*.sql`, secuenciales del `001` al `030`. **No hay framework de migraciones** — se aplican manualmente con `psql`.

## Tablas

### Usuarios y auth

| Tabla | Propósito |
|-------|-----------|
| `users` | Cuenta del usuario. Campos clave: `id`, `email UNIQUE`, `name`, `picture`, `role` (`user` \| `admin` \| `super_admin`), `created_at`, `updated_at`, `last_login_at`. |

Migraciones relacionadas: `007_migration_auth.sql`, `021_migration_user_roles.sql`.

### Trading core

| Tabla | Propósito | Migración |
|-------|-----------|-----------|
| `trades` | Trade principal. Columnas computadas `pnl` y `pnl_percentage`. Soft-delete con `deleted_at`. | `005_schema.sql`, evolución en `006_*`, `008_*`. |
| `trade_images` | Múltiples imágenes por trade. FK `trade_id ON DELETE CASCADE`. | `005_schema.sql` |
| `trade_signals` | Señales asociadas a un trade. M:N entre `trades` y `signals`. | `009_migration_systems.sql` |
| `trade_timeframes` | Timeframes asociados a un trade. | `009_*` |
| `trade_tags` | Tags globales por usuario, para trades (espejo de `note_tags`). | `025_migration_trade_tags.sql` |
| `trade_tag_assignments` | M:N entre `trades` y `trade_tags`. | `025_migration_trade_tags.sql` |

#### Tabla `trades` — definición clave

```sql
CREATE TABLE trades (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),    -- añadido en 007
    symbol VARCHAR(20) NOT NULL,
    trade_type VARCHAR(10) CHECK (trade_type IN ('LONG', 'SHORT')),
    entry_price DECIMAL(18, 8) CHECK (entry_price > 0),
    exit_price DECIMAL(18, 8) CHECK (exit_price IS NULL OR exit_price > 0),
    quantity DECIMAL(18, 8) CHECK (quantity > 0),
    entry_date TIMESTAMP NOT NULL,
    exit_date TIMESTAMP,
    commission DECIMAL(18, 8) DEFAULT 0,

    -- Columna GENERADA STORED
    pnl DECIMAL(18, 8) GENERATED ALWAYS AS (
      CASE WHEN exit_price IS NOT NULL THEN
        CASE WHEN trade_type = 'LONG'
             THEN (exit_price - entry_price) * quantity - COALESCE(commission, 0)
             ELSE (entry_price - exit_price) * quantity - COALESCE(commission, 0)
        END
      END
    ) STORED,

    pnl_percentage DECIMAL(10, 4) GENERATED ALWAYS AS (
      CASE WHEN exit_price IS NOT NULL AND entry_price > 0 THEN
        CASE WHEN trade_type = 'LONG'
             THEN ((exit_price - entry_price) / entry_price) * 100
             ELSE ((entry_price - exit_price) / entry_price) * 100
        END
      END
    ) STORED,

    notes TEXT,
    status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL
);
```

**Trade-off de las columnas generadas**: rapidísimo para queries (no JOIN ni cómputo), pero **no podés actualizar `pnl` directamente** — depende exclusivamente de los inputs. Si la fórmula cambia, requiere DROP COLUMN + ADD COLUMN (operación pesada en tablas grandes; usar migración con `ALTER ... TYPE` no funciona para columnas generadas).

### Sistemas y señales

| Tabla | Propósito |
|-------|-----------|
| `systems` | Sistemas de trading del usuario. |
| `signals` | Señales nombradas (parte de un sistema o globales). |
| `user_timeframes` | Timeframes definidos por usuario. |

Migración: `009_migration_systems.sql`.

### Notas (feature compleja)

Modelo jerárquico tipo Notion con bloques tipados y reordenamiento por `fractional-indexing`.

| Tabla | Propósito |
|-------|-----------|
| `notes` | Nodo del árbol de notas. Campos: `id`, `user_id`, `title`, `parent_note_id` (self-FK), `position` (string fractional), `type` (`'note'` \| `'section'` \| `'todo'`), `deleted_at` (soft-delete). Las de tipo `'todo'` son el contenido oculto de un item de TODO (ver abajo). |
| `note_blocks` | Bloques dentro de una nota: `block_type` (`text`, `image_gallery`, `image`, `reference`, `callout`, `trade_reference`), `content` (TEXT), `metadata` (JSONB), `position` (string fractional), `requires_follow_up` (bool, "Revisión"), `marked_for_revisit` (bool, "Repaso"). |
| `note_block_images` | Imágenes asociadas a un bloque `image_gallery` o `image` (este último guarda como máximo una: subir otra reemplaza la anterior). `position` INTEGER (reorden por índice, no fractional). |
| `note_block_trades` | Trades referenciados desde un bloque `trade_reference`. M:N entre `note_blocks` y `trades`. |
| `note_tags` | Tags globales por usuario, con `group_key` (`activo` \| `tipo` \| `estrategia` \| `resultado` \| `libre`, default `libre`). Nombre único por usuario sin distinguir mayúsculas (`idx_note_tags_unique_name`). |
| `note_tag_assignments` | M:N entre `notes` y `note_tags`. Los tags de una nota son los tags por defecto de sus bloques nuevos. |
| `note_block_tag_assignments` | M:N entre `note_blocks` y `note_tags` (PK `(block_id, tag_id)`). Es lo que filtra el repaso por tag. |

Migraciones: `013_migration_notes.sql`, `014_migration_note_callout.sql`, `015_migration_notes_search.sql`, `017_migration_dnd.sql`, `018_migration_fix_positions.sql`, `019_migration_block_follow_up.sql`, `020_migration_note_sections.sql`, `022_migration_references.sql`, `023_migration_trade_reference_block.sql`, `024_migration_block_updated_at_skip_reorder.sql`, `025_migration_block_revisit.sql`, `026_migration_image_block.sql`, `030_migration_block_tags.sql`.

#### Tags por bloque (migración 030)

`030_migration_block_tags.sql` (spec [`features/specs/tags-bloques.md`](../features/specs/tags-bloques.md)):

- `note_tags.group_key VARCHAR(20) NOT NULL DEFAULT 'libre'` con el CHECK `note_tags_group_key_check`. Los tags existentes quedan en `libre`. La lista de grupos tiene que coincidir con `TAG_GROUPS` del backend y del frontend (`constants/tagGroups.js`): agregar un grupo es una migración nueva más esas dos constantes.
- `note_block_tag_assignments (block_id, tag_id)`, PK compuesta (ninguna asignación se direcciona por id) e índice `idx_note_block_tag_assignments_tag (tag_id, block_id)` para el filtro del repaso por tag.
- Cascadas: borrar un bloque o un tag borra sus asignaciones; la purga de notas (`hardDeleteNotes`) llega por nota → bloques → asignaciones. El soft delete de notas no las toca.
- Idempotente. El CHECK se recrea con `DROP CONSTRAINT IF EXISTS` + `ADD`: declarado junto al `ADD COLUMN IF NOT EXISTS`, Postgres rechaza el nombre repetido en la segunda corrida.

`note_blocks` no tiene `user_id`: el dueño de un bloque se comprueba siempre por su nota (`JOIN notes n ON n.id = b.note_id AND n.user_id = $N`). Las referencias (`block_type = 'reference'`) no llevan tags.

#### Repaso de bloques (migración 025)

`025_migration_block_revisit.sql` añade la marca de "Repaso" (espejo de "Revisión"/follow-up):

- Columna `marked_for_revisit BOOLEAN NOT NULL DEFAULT false` en `note_blocks`.
- Índice parcial `idx_note_blocks_revisit ON note_blocks (note_id, updated_at ASC) WHERE marked_for_revisit = true` — solo indexa bloques activamente marcados.
- Recrea el trigger `update_note_blocks_updated_at` copiando la cláusula `WHEN` de la migración 024 (excluye los cambios de solo `position`) y añadiendo `OR OLD.marked_for_revisit IS DISTINCT FROM NEW.marked_for_revisit`, para que marcar/desmarcar un bloque cuente como actividad (igual que el follow-up). Migración idempotente (`IF NOT EXISTS` + `DROP TRIGGER IF EXISTS`).

La vista "Repaso" (`GET /api/notes/blocks/revisit`) lista estos bloques ordenados por `updated_at ASC`, con filtro opcional de antigüedad (`pendingHours`).

#### Búsqueda full-text

`015_migration_notes_search.sql` añade columnas `tsvector` para full-text search sobre títulos y contenido de bloques. Endpoint: `GET /api/notes/search?q=...`.

#### Drag-and-drop

El campo `position` es un string ordenable lexicográficamente (algoritmo `fractional-indexing`). Insertar entre dos elementos `a` y `b` solo requiere generar un string entre `a` y `b` — sin reescribir el resto de la tabla. Ver el paquete `fractional-indexing` (también usado en frontend para optimistic updates en `utils/treeManipulation.js`).

### TODO

| Tabla | Propósito |
|-------|-----------|
| `todo_lists` | Listas de pendientes por usuario. `position` fractional. |
| `todo_items` | Items de una lista (`list_id` con `ON DELETE CASCADE`): `title`, `position` fractional (compartida entre pendientes y completados), `completed_at`, `note_id` (UNIQUE, FK a `notes` con `ON DELETE CASCADE`). |

Cada item reutiliza el sistema de bloques de notas a través de su nota `type = 'todo'` (siempre raíz: el CHECK `sections_only_at_root` ya lo exige). Las consultas del árbol, búsqueda, exportación, Revisión y Repaso filtran ese tipo. Borrar un item o una lista hace soft-delete de las notas; `purgeDeletedNotes` borra después bloques e imágenes.

Migración: `027_migration_todos.sql`.

### Recordatorios de análisis

| Tabla | Propósito |
|-------|-----------|
| `market_symbols` | Catálogo global de perpetuos de Binance Futures USDⓈ-M (`symbol` PK, `contract_type` `PERPETUAL` \| `TRADIFI_PERPETUAL`, `tick_size`). Lo llena el sync diario de `exchangeInfo`. Guarda el checkpoint de vigilancia (`checked_until`: `openTime` de la última vela leída) y `last_price`. Un deslistado pone `invalid_at`; nunca se borran filas. |
| `price_alerts` | Alertas de precio: `symbol` (FK al catálogo), `direction`, `target_price`, `is_invalidation` (salta solo por cierre diario), `near_pct`, `deadline_at`, `price_at_creation`, `status` `active` \| `triggered`, `armed_at`, `near_at`, `triggered_at`. |
| `date_reminders` | Recordatorios por fecha: `remind_at`, `message`, `status` `pending` \| `sent`. |
| `notifications` | Bandeja genérica de tarjetas: `type`, `price_alert_id` / `date_reminder_id` (`ON DELETE SET NULL`), `payload` JSONB (foto del momento), `resolved_at` + `resolution` (`dismissed` \| `rearmed` \| `updated`). |
| `reminder_job_state` | Una sola fila (`id = 1`): `last_run_at`, `catalog_synced_at`, `backoff_until` (429/418 de Binance, sobrevive a reinicios) y `push_notified_id` (marca de agua de los avisos push: id de la última tarjeta de la que ya se intentó avisar; la migración 029 la siembra en `MAX(id)`). |
| `push_subscriptions` | Dispositivos vinculados para recibir las tarjetas como notificaciones push: `user_id` (`ON DELETE CASCADE`), `endpoint` (`UNIQUE`: un dispositivo, una cuenta), `p256dh` y `auth` (claves del navegador, nunca se devuelven por la API), `user_agent`, `last_seen_at`. Una fila se borra sola cuando el servicio de push responde 404/410. |

Alertas y recordatorios se anclan a un bloque **o** a una nota (`CHECK num_nonnulls(note_id, block_id) = 1`, ambos con `ON DELETE CASCADE`); en los de bloque la nota se deriva por join, así que mover el bloque no desincroniza nada. Las columnas que se comparan con los `openTime` de Binance o con fechas del usuario son `TIMESTAMPTZ`. `pg` devuelve los `NUMERIC` como string: los repositories los convierten a `Number`.

Migraciones: `028_migration_price_alerts_and_reminders.sql` y `029_migration_push_subscriptions.sql` (avisos push). Specs: [`features/specs/alertas-de-precio-en-notas.md`](../features/specs/alertas-de-precio-en-notas.md) y [`features/specs/notificaciones-push-pwa.md`](../features/specs/notificaciones-push-pwa.md).

### Backtesting

| Tabla | Propósito |
|-------|-----------|
| `backtest_sessions` | Sesión de backtesting (símbolo, timeframe, balance inicial, descripción, abierta/cerrada). |
| `backtest_trades` | Trades virtuales dentro de una sesión. Tienen su propia imagen opcional. |

Migraciones: `010_*`, `011_*`, `012_*` (imágenes), `016_*` (description).

## FKs y cascadas (resumen)

```
users.id ──┐  ON DELETE CASCADE (en la mayoría de los hijos):
           │
           ├── trades.user_id
           │   └── trade_images.trade_id        (CASCADE)
           │   └── trade_signals.trade_id       (CASCADE)
           │   └── trade_timeframes.trade_id    (CASCADE)
           │   └── trade_tag_assignments.trade_id   (CASCADE)
           │
           ├── trade_tags.user_id
           │   └── trade_tag_assignments.tag_id     (CASCADE)
           │
           ├── systems.user_id
           │   └── signals.system_id            (CASCADE)
           │
           ├── notes.user_id
           │   ├── notes.parent_note_id         (self, CASCADE)
           │   ├── note_blocks.note_id          (CASCADE)
           │   │   ├── note_block_images.block_id   (CASCADE)
           │   │   ├── note_block_tag_assignments.block_id   (CASCADE)
           │   │   └── note_block_trades.block_id   (CASCADE)
           │   │       └── note_block_trades.trade_id → trades.id (CASCADE)
           │   └── note_tag_assignments.note_id     (CASCADE)
           │
           ├── note_tags.user_id
           │   ├── note_tag_assignments.tag_id      (CASCADE)
           │   └── note_block_tag_assignments.tag_id      (CASCADE)
           │
           ├── price_alerts.user_id / date_reminders.user_id
           │   ├── .note_id  → notes.id         (CASCADE)
           │   ├── .block_id → note_blocks.id   (CASCADE; el trigger de re-anclaje actúa antes)
           │   └── notifications.price_alert_id / .date_reminder_id   (SET NULL)
           │
           └── backtest_sessions.user_id
               └── backtest_trades.session_id       (CASCADE)
```

> **Importante**: `trades` **y** `notes` tienen soft-delete (`deleted_at`). Borrar una nota es un soft-delete recursivo (marca la nota y sus descendientes); las filas de `note_blocks` / `note_block_images` se conservan, y de disco solo se eliminan los archivos de imagen con más de 24h (los recientes sobreviven por si el borrado fue accidental — ver `note.service.deleteNote`). Backtests y el resto se borran físicamente (cascada vía FK).

## Índices

`001_indexes.sql` (estado inicial):

```sql
CREATE INDEX idx_trades_entry_date ON trades(entry_date DESC);
CREATE INDEX idx_trades_symbol ON trades(symbol);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_created_at ON trades(created_at DESC);
CREATE INDEX idx_trade_images_trade_id ON trade_images(trade_id);
```

> **Pendiente** (ver [`../analysis/scaling.md`](../analysis/scaling.md#fase-2--optimización-de-db)): los índices no consideran `user_id`. Para multi-usuario reales conviene `(user_id, entry_date DESC)`, `(user_id, symbol)`, `(user_id, status)`.

## Triggers

`002_triggers.sql` define una función `update_updated_at_column()` y la ata a tablas con `updated_at`:

```sql
CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON trades
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

Aplicado a varias tablas (notes, etc.).

El trigger de `note_blocks` es un caso especial: se recrea con una cláusula `WHEN` que **excluye los cambios de solo `position`** (reorden/DnD no cuenta como "actividad" para la vista de Revisión) e **incluye** `content`, `metadata`, `block_type`, `linked_note_id`, `requires_follow_up` y `marked_for_revisit`. Ver migraciones `024_migration_block_updated_at_skip_reorder.sql` y `025_migration_block_revisit.sql`.

Al borrar un bloque, el trigger `note_blocks_reanchor_reminders` (`BEFORE DELETE`, función `reanchor_block_reminders()`, migración 028) pasa sus alertas y recordatorios a la nota (`block_id = NULL`, `note_id` = la nota del bloque). Cubre cualquier camino de borrado. Si la nota ya no existe (purga), no re-ancla y actúa el CASCADE.

## Vistas

`003_views.sql` define `trade_stats`:

```sql
CREATE VIEW trade_stats AS
SELECT
  COUNT(*) AS total_trades,
  COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl > 0) AS winning_trades,
  COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl < 0) AS losing_trades,
  ROUND(SUM(pnl)::numeric, 2) AS total_pnl,
  ROUND(AVG(pnl) FILTER (WHERE status = 'CLOSED')::numeric, 2) AS avg_pnl,
  MAX(pnl) AS best_trade,
  MIN(pnl) AS worst_trade
FROM trades;
```

> Esta vista **no filtra por `user_id`** — el service de stats hace queries explícitas filtradas. La vista podría retirarse o reescribirse como function/view filtrada.

## Seed

`004_seed.sql` carga datos de demo (opcional, no se ejecuta automáticamente).

## Aplicar migraciones

```bash
# En dev (Docker)
for f in trading-journal/database/0*.sql; do
  sudo docker exec -i tradelog-db psql -U postgres -d trading_journal < "$f"
done

# En prod (postgres compartido de market-tracker)
docker exec -i market-tracker-postgres-1 psql -U tradelog_user -d tradelog \
  < trading-journal/database/024_mi_migracion.sql
```

Más detalle en [`../operations/database-ops.md`](../operations/database-ops.md).

## Próximos cambios al schema (pendientes en specs)

- **`feature-cleanup`**: revisar tablas y FKs sin uso (algunas specs no se implementaron, ej. `sistema-de-estrategias.md`).
- **Índices compuestos por `user_id`**: ver [`scaling.md`](../analysis/scaling.md).
- **UUIDs client-generated**: si se adopta offline-first con creación local (ver `pending-decisions.md` D-010), requiere migrar IDs a UUID v4.
- **Revocation list de JWT**: nueva tabla `jwt_revocations` (token_jti, expires_at) si se decide implementar logout fuerte (D-006).
