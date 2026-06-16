# Arquitectura — Base de datos

PostgreSQL 16 (en compose dev). En producción se conecta al postgres compartido del proyecto `market-tracker`.

Migraciones: `trading-journal/database/0NN_*.sql`, secuenciales del `001` al `023`. **No hay framework de migraciones** — se aplican manualmente con `psql`.

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
| `notes` | Nodo del árbol de notas. Campos: `id`, `user_id`, `title`, `parent_note_id` (self-FK), `position` (string fractional), `type` (`'note'` \| `'section'`), `deleted_at` (soft-delete). |
| `note_blocks` | Bloques dentro de una nota: `block_type` (`text`, `image_gallery`, `reference`, `callout`, `trade_reference`), `content` (TEXT), `metadata` (JSONB), `position` (string fractional), `requires_follow_up` (bool). |
| `note_block_images` | Imágenes asociadas a un bloque `image_gallery`. `position` INTEGER (reorden por índice, no fractional). |
| `note_block_trades` | Trades referenciados desde un bloque `trade_reference`. M:N entre `note_blocks` y `trades`. |
| `note_tags` | Tags globales por usuario. |
| `note_tag_assignments` | M:N entre `notes` y `note_tags`. |

Migraciones: `013_migration_notes.sql`, `014_migration_note_callout.sql`, `015_migration_notes_search.sql`, `017_migration_dnd.sql`, `018_migration_fix_positions.sql`, `019_migration_block_follow_up.sql`, `020_migration_note_sections.sql`, `022_migration_references.sql`, `023_migration_trade_reference_block.sql`, `024_migration_block_updated_at_skip_reorder.sql`.

#### Búsqueda full-text

`015_migration_notes_search.sql` añade columnas `tsvector` para full-text search sobre títulos y contenido de bloques. Endpoint: `GET /api/notes/search?q=...`.

#### Drag-and-drop

El campo `position` es un string ordenable lexicográficamente (algoritmo `fractional-indexing`). Insertar entre dos elementos `a` y `b` solo requiere generar un string entre `a` y `b` — sin reescribir el resto de la tabla. Ver el paquete `fractional-indexing` (también usado en frontend para optimistic updates en `utils/treeManipulation.js`).

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
           │
           ├── systems.user_id
           │   └── signals.system_id            (CASCADE)
           │
           ├── notes.user_id
           │   ├── notes.parent_note_id         (self, CASCADE)
           │   ├── note_blocks.note_id          (CASCADE)
           │   │   ├── note_block_images.block_id   (CASCADE)
           │   │   └── note_block_trades.block_id   (CASCADE)
           │   │       └── note_block_trades.trade_id → trades.id (CASCADE)
           │   └── note_tag_assignments.note_id     (CASCADE)
           │
           ├── note_tags.user_id
           │   └── note_tag_assignments.tag_id      (CASCADE)
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
