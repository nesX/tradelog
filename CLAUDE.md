# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Trading Journal — a full-stack web app for logging and analyzing trades. The codebase lives in `trading-journal/` and is split into three sub-projects: `backend/`, `frontend/`, and `database/`.

## Development Commands

Run backend and frontend in separate terminals from their respective directories:

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

**Database setup** (run once from `trading-journal/`):
```bash
createdb trading_journal
psql -d trading_journal -f database/schema.sql
psql -d trading_journal -f database/indexes.sql
psql -d trading_journal -f database/triggers.sql
psql -d trading_journal -f database/views.sql
psql -d trading_journal -f database/seed.sql   # optional
```

Or via npm script from `trading-journal/backend/`:
```bash
npm run db:init
```

**Environment files:**
- `trading-journal/backend/.env` — copy from `.env.example`, set DB credentials and `JWT_SECRET`
- `trading-journal/frontend/.env` — set `VITE_API_URL=http://localhost:5000`

## Architecture

Both backend and frontend use ES modules (`"type": "module"` in package.json).

### Backend (`trading-journal/backend/src/`)

Layered architecture: `routes → middleware → controllers → services → repositories → database`

- **`config/`** — `database.js` (pg pool), `env.js` (validated env vars)
- **`middleware/`** — `auth.js` (JWT verify → `req.user`), `validation.js` (Joi schemas), `upload.js` (multer for images), `errorHandler.js` (centralised `AppError` class + catch-all)
- **`controllers/`** — thin: parse request, call service, return response via `utils/response.js`
- **`services/`** — business logic (`trade.service.js`, `stats.service.js`, `csvParser.service.js`, `auth.service.js`)
- **`repositories/`** — all SQL queries, parameterised; only place that touches the DB
- **`validators/`** — Joi schemas imported by the `validate` middleware
- **`routes/`** — `auth.routes.js`, `trade.routes.js`, `stats.routes.js`; all trade/stats routes require the `authenticate` middleware

**Authentication** — JWT-based. `auth.routes.js` handles register/login/Google OAuth. `authenticate` middleware attaches `req.user = { id, email }`. All `/api/trades` and `/api/stats` endpoints are protected.

**Images** — uploaded via multer to `backend/uploads/`, served statically at `GET /api/images/:filename`. Each trade can have multiple images stored in the `trade_images` table (FK to `trades`).

**API response shape:**
```js
// Success
{ success: true, data: {...}, message: "..." }
// Error
{ success: false, error: { message, code, details } }
```

### Frontend (`trading-journal/frontend/src/`)

- **`api/client.js`** — Axios instance; request interceptor adds `Authorization: Bearer <token>` from localStorage; response interceptor unwraps `response.data` and redirects to `/login` on 401
- **`api/endpoints.js`** — all API call functions imported by hooks
- **`hooks/`** — TanStack Query hooks (`useTrades`, `useStats`, `useImageUpload`, etc.); cache keys centralised in `tradeKeys` factory
- **`contexts/`** — `AuthContext.jsx` (login state + token), `ThemeContext.jsx` (dark mode)
- **`pages/`** — `Home.jsx` (trade list), `CreateTrade.jsx`, `Stats.jsx`, `Login.jsx`; all except Login wrapped in `ProtectedRoute`
- **`components/common/`** — `Toast.jsx` (provider + hook), `Modal.jsx`, `ImageViewer.jsx`
- **`components/trades/`** — `TradeTable.jsx`, `TradeRow.jsx`, `CreateTradeForm.jsx`, `CSVImport.jsx`

### Database (`trading-journal/database/`)

Two tables:
- `trades` — main table; `pnl` and `pnl_percentage` are **generated/stored columns** computed from prices; `deleted_at` for soft delete
- `trade_images` — multiple images per trade, FK `trade_id → trades(id) ON DELETE CASCADE`

`pnl` formula: `(exit_price - entry_price) * quantity - commission` for LONG; reversed for SHORT.

### CSV Import Format

Semicolon-separated, with header row:
```
fecha;simbolo;tipo;precio_entrada;precio_salida;cantidad;comisiones;notas
2025-01-15 10:30;BTCUSDT;LONG;42000.50;43500.00;0.1;5.50;Breakout trade
```
`precio_salida` can be empty for open trades. Import goes through preview (`/api/trades/import/preview`) before commit (`/api/trades/import`).

## Known TODOs

- Fix edit column visibility at low screen resolutions (should be sticky/pinned)
- Stats page should refresh when a new trade is created

## Docker
Recordar que estamos usando contenedores separados para el backend, frontend, postgres 
- sudo docker exec -i tradelog-db psql -U postgres -d tradelog < database/migration_notes.sql
- sudo docker compose --env-file backend/.env up -d --build
- sudo docker compose --env-file backend/.env up -d --build frontend
