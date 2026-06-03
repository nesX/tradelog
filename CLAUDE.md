# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **For humans and Claude alike**: the canonical, exhaustive documentation lives in [`docs/`](docs/INDEX.md). This file is a quick reference; **always prefer `docs/` for depth**.

## Project Overview

Trading Journal — a full-stack web app for logging and analyzing trades. The codebase lives in `trading-journal/` and is split into three sub-projects: `backend/`, `frontend/`, and `database/`.

**Production URL**: `https://tradelog.nesx.co` (deployed automatically from `main` via GitHub Actions).

## Where to look for what

| Question | Document |
|----------|----------|
| "How do I run this locally?" | [`docs/getting-started.md`](docs/getting-started.md) |
| "What endpoints exist?" | [`docs/api/reference.md`](docs/api/reference.md) |
| "How is the backend structured?" | [`docs/architecture/backend.md`](docs/architecture/backend.md) |
| "How is auth implemented?" | [`docs/architecture/auth.md`](docs/architecture/auth.md) |
| "How do I add a migration?" | [`docs/operations/database-ops.md`](docs/operations/database-ops.md) |
| "How does deploy work?" | [`docs/operations/deployment.md`](docs/operations/deployment.md) + [`docs/operations/ci-cd.md`](docs/operations/ci-cd.md) |
| "What env vars exist?" | [`docs/operations/env-vars.md`](docs/operations/env-vars.md) |
| "Why is X slow / how to scale?" | [`docs/analysis/scaling.md`](docs/analysis/scaling.md) |
| "How to add offline support?" | [`docs/analysis/offline-strategy.md`](docs/analysis/offline-strategy.md) |
| "Security gaps?" | [`docs/analysis/security.md`](docs/analysis/security.md) |
| "What's pending / what to work on?" | [`docs/roadmap.md`](docs/roadmap.md) |
| "What decisions are open?" | [`docs/pending-decisions.md`](docs/pending-decisions.md) |

## Development Commands

```bash
# Backend (from trading-journal/backend/)
npm run dev        # node --watch (no nodemon needed)
npm start          # production
npm test           # Jest (ESM mode via --experimental-vm-modules)
npm run lint       # ESLint
npm run lint:fix   # ESLint with auto-fix
npm run format     # Prettier

# Frontend (from trading-journal/frontend/)
npm run dev        # Vite dev server on http://localhost:5173
npm run build      # Production build
npm run lint       # ESLint
```

**Docker (recommended)** from `trading-journal/`:
```bash
sudo docker compose --env-file backend/.env up -d --build
sudo docker compose --env-file backend/.env up -d --build backend     # rebuild solo backend
sudo docker compose --env-file backend/.env up -d --build frontend    # rebuild solo frontend
sudo docker exec -i tradelog-db psql -U postgres -d trading_journal < database/0NN_migration.sql
```

**Schema setup** (Docker): apply all SQL files in order:
```bash
for f in trading-journal/database/0*.sql; do
  sudo docker exec -i tradelog-db psql -U postgres -d trading_journal < "$f"
done
```

**Manual schema setup** (sin Docker) — los archivos están numerados `001_` a `023_`:
```bash
createdb trading_journal
for f in trading-journal/database/0*.sql; do psql -d trading_journal -f "$f"; done
```

> El `npm run db:init` del backend está desactualizado: referencia archivos antiguos (`schema.sql`, `indexes.sql`, ...). Hoy todo vive en `0NN_*.sql`. Ver [`docs/operations/database-ops.md`](docs/operations/database-ops.md).

## Architecture (quick reference)

Both backend and frontend use ES modules (`"type": "module"` in package.json).

### Backend (`trading-journal/backend/src/`)

Layered: `routes → middleware → controllers → services → repositories → database`

- `config/` — `database.js` (pg pool, max 20), `env.js` (Joi-validated env vars)
- `middleware/` — `auth.js`, `authorize.js`, `validation.js`, `upload.js`, `errorHandler.js`
- `controllers/` — thin parsers; call services and return via `utils/response.js`
- `services/` — business logic (8 files; `note.service.js` is the largest at ~557 LOC)
- `repositories/` — all SQL queries, parametrized
- `validators/` — Joi schemas per dominio
- `routes/` — 7 routers; all require `authenticate` except `/api/auth/google` and `/api/health`

Mount points (in `server.js`):
- `/api/auth`, `/api/trades`, `/api/stats`, `/api/backtest`, `/api/notes`, `/api/admin`
- `/api/systems`, `/api/timeframes` (via `systemRoutes` mounted at `/api`)
- `/api/health` (público)
- `/api/images/:filename` (static from `uploads/`, público)

**Auth**: Google OAuth (id_token via `google-auth-library`) → custom JWT (`jsonwebtoken`, `JWT_EXPIRES_IN=7d`). Roles: `user` / `admin` / `super_admin`. Super_admin is bootstrapped at startup via `SUPER_ADMIN_EMAIL` env. Details: [`docs/architecture/auth.md`](docs/architecture/auth.md).

**Images**: uploaded via multer to `uploads/` (volumen). Served at `GET /api/images/:filename`. **Client compresses to webp before upload** (`utils/imageCompression.js`).

**API response shape**:
```js
// Success
{ success: true, data: {...}, message: "..." }
// Error
{ success: false, error: { message, code, details } }
```

### Frontend (`trading-journal/frontend/src/`)

- `api/client.js` — axios; interceptors add `Bearer` token + redirect to `/login` on 401
- `api/endpoints.js` — 76+ endpoint functions
- `hooks/` — TanStack Query hooks. Query keys via factory pattern (`tradeKeys`).
- `contexts/` — `AuthContext`, `ThemeContext`
- `pages/` — Home, CreateTrade, Stats, Settings, Login, Notes, NoteEditor, Review, Backtest×3, admin/Users
- `components/` — common, layout, auth, admin, trades, notes (18 archivos), backtest
- `utils/` — `imageCompression.js`, `treeManipulation.js`, `formatters.js`, `referenceLinks.js`, `notesGrouping.js`

TanStack Query: `staleTime=30s`, `refetchOnWindowFocus=false`, **NO persistence between sessions** (gap planeado — ver `docs/analysis/offline-strategy.md`).

### Database (`trading-journal/database/`)

15+ tablas; las principales:
- `users`, `trades` (+ `trade_images`), `systems`, `signals`, `user_timeframes`, `trade_signals`, `trade_timeframes`
- `notes` (jerárquico) → `note_blocks` → (`note_block_images`, `note_block_trades`) y `note_tag_assignments` → `note_tags`
- `backtest_sessions` → `backtest_trades`

Columnas generadas en `trades`: `pnl` y `pnl_percentage` (STORED). Soft-delete con `deleted_at` solo en `trades`. Drag-and-drop via `fractional-indexing`. Migrations secuenciales (`001_` a `023_`). Detalle: [`docs/architecture/database.md`](docs/architecture/database.md).

## CSV Import

Semicolon-separated. Spec completa: [`docs/api/csv-format.md`](docs/api/csv-format.md).

```
fecha;simbolo;tipo;precio_entrada;precio_salida;cantidad;comisiones;notas
2026-01-15 10:30;BTCUSDT;LONG;42000.50;43500.00;0.1;5.50;Breakout trade
```

## Known TODOs (cross-link al roadmap)

Ver [`docs/roadmap.md`](docs/roadmap.md) para vista unificada. Los 2 históricos:

- Fix edit column visibility at low screen resolutions (should be sticky/pinned) → roadmap item #20.
- Stats page should refresh when a new trade is created → roadmap item #19.

## Notas para Claude trabajando en este repo

- **NO crear archivos `.ts`/`.tsx`** — el proyecto es JavaScript puro con ES Modules.
- **NO usar `npm run db:init`** — está desactualizado. Aplicar `database/0NN_*.sql` en orden.
- **SQL siempre parametrizado** (`$1`, `$2`, …). Nunca string concatenation.
- **Lógica de negocio en services**, no en controllers. Acceso a BD solo en repositories.
- **Respuestas HTTP**: usar `sendSuccess` / `sendError` / `sendValidationError` de `utils/response.js`.
- **Errores**: levantar `AppError` y subclases; el middleware central las captura (`express-async-errors` ayuda).
- **Lint**: correr `npm run lint:fix` y `npm run format` antes de commitear (no hay hooks).
- **Tests**: `npm test` en backend (cobertura baja hoy); frontend no tiene tests configurados.
- **Cambios de schema**: archivo nuevo `database/0NN_descripcion.sql`, idempotente, sin rollback automático.
- **Nuevos endpoints**: seguir el patrón de 6 pasos en [`docs/development/workflow.md`](docs/development/workflow.md#cómo-añadir-un-endpoint-nuevo).
- **Imágenes**: client comprime; backend solo valida MIME (gap conocido — ver `docs/analysis/security.md`).

## Si el usuario pregunta sobre escalado, offline o seguridad

Hay tres documentos profundos:

- [`docs/analysis/scaling.md`](docs/analysis/scaling.md) — fases priorizadas, costos en días y dólares.
- [`docs/analysis/offline-strategy.md`](docs/analysis/offline-strategy.md) — 4 capas para reducir carga del server y permitir offline.
- [`docs/analysis/security.md`](docs/analysis/security.md) — gaps con severidad y fixes.

Cada uno cierra con cross-links a [`docs/pending-decisions.md`](docs/pending-decisions.md), que contiene las preguntas abiertas para el dueño del proyecto.

## Idioma

- Código y commits: mezcla razonable de español/inglés. Mantener consistencia con archivos vecinos.
- Mensajes de error al usuario: **en español**.
- Comentarios: en español o inglés según contexto, sin obsesionarse.
- Documentación (`docs/`): español.

## Doble dato de puertos en Docker

⚠ **Importante**: el backend código por defecto escucha en `5000` (`config.port`), pero el compose dev lo **override a `3000`** y el compose prod a `3002`. Si vas a hacer curl, prestar atención:

- Dev sin Docker: `http://localhost:5000/api`.
- Dev con Docker: `http://localhost:3000/api`.
- Prod: detrás de nginx en `https://tradelog.nesx.co/api`.
