# Arquitectura — Vista global

## Componentes

Tres servicios independientes orquestados por Docker Compose:

```
                ┌──────────────────────────────────────────────────┐
                │  Browser                                         │
                │  React 18 + Vite + TanStack Query + Tailwind     │
                └─────────────────────┬────────────────────────────┘
                                      │ HTTPS (prod) / HTTP (dev)
                                      ▼
                     ┌───────────────────────────────┐
                     │  nginx (host, prod)           │
                     │  - SSL                        │
                     │  - reverse proxy              │
                     │  - client_max_body_size 20M   │
                     └─────────────┬─────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
      ┌──────────────┐    ┌──────────────────┐   (uploads bajo /api/images
      │  frontend    │    │  backend         │    se sirven desde
      │  container   │    │  container       │    backend container)
      │  nginx:80    │    │  Express :3000   │
      │  HTML/JS     │    │  (5000 en local) │
      │  estático    │    │                  │
      └──────────────┘    └────────┬─────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │  postgres:16     │
                          │  tradelog-db     │
                          │  :5432 (interno) │
                          └──────────────────┘
                                   │
                                   ▼
                          Volume:  tradelog_db_data
                          Volume:  backend/uploads (imágenes)
                          Volume:  backend/logs (Winston JSON)
```

En **producción**, el backend se conecta al postgres del proyecto `market-tracker` (red Docker externa, no contenedor propio). Ver [`operations/deployment.md`](../operations/deployment.md).

## Flujo típico de un request

Ejemplo: `GET /api/trades?page=1&limit=20` desde el navegador.

1. **Cliente**: `useTrades({ page: 1, limit: 20 })` (TanStack Query hook) → `apiClient.get('/api/trades', { params })`.
2. **axios interceptor (`api/client.js`)**: lee `localStorage.token` → agrega `Authorization: Bearer <jwt>`.
3. **nginx** (prod): proxy a `127.0.0.1:3002`.
4. **Express** (`server.js`): pasa por `helmet`, `cors`, `express.json`.
5. **Router** (`routes/trade.routes.js`): aplica `authenticate` middleware → `validate(listTradesQuerySchema, 'query')` → `tradeController.listTrades`.
6. **Middleware `authenticate`**: parsea Bearer, llama `authService.verifyToken`, agrega `req.user = { id, email, role }`.
7. **Controller**: extrae query/body/user, llama `tradeService.listTrades(filters, req.user.id)`.
8. **Service**: aplica lógica de negocio → llama `tradeRepository.findAll(...)`.
9. **Repository** (`repositories/trade.repository.js`): query SQL parametrizada al pool de `pg`.
10. **Postgres** ejecuta y devuelve filas.
11. Respuesta encadena de vuelta: repo → service → controller → `sendSuccess(res, data)` → `{ success: true, data: { trades, total, ... } }`.
12. **axios response interceptor**: extrae `response.data`, lo devuelve al hook.
13. **TanStack Query** cachea el resultado por 30s (`staleTime`) bajo el key `['trades', 'list', filters]`.

## Capas del backend (orden estricto)

```
HTTP Request
    │
    ▼
Routes  (src/routes/*.routes.js)
    │  · monta middlewares: authenticate, authorize, validate, upload
    │  · delega al controller
    ▼
Controllers  (src/controllers/*.controller.js)
    │  · thin: parsea req, llama service, llama sendSuccess/sendError
    │  · NO contiene lógica de negocio
    ▼
Services  (src/services/*.service.js)
    │  · lógica de negocio, reglas de dominio
    │  · orquesta múltiples repositories si hace falta
    ▼
Repositories  (src/repositories/*.repository.js)
    │  · ÚNICO lugar que ejecuta SQL
    │  · usa pool de pg con queries parametrizadas
    ▼
PostgreSQL
```

Errores fluyen al **error handler central** (`middleware/errorHandler.js`) gracias a `express-async-errors`.

## Capas del frontend

```
React Component
    │  · UI puro, no fetch directo
    ▼
Custom Hook  (hooks/use*.js)
    │  · useQuery / useMutation con query keys consistentes
    │  · maneja loading/error/data
    ▼
API Endpoint Function  (api/endpoints.js)
    │  · envuelve apiClient.{get,post,...}
    ▼
axios apiClient  (api/client.js)
    │  · interceptor request: agrega Bearer token
    │  · interceptor response: unwrap response.data, 401 → logout
    ▼
HTTP → backend
```

Contexts globales viven en `contexts/`:
- `AuthContext` — token, user, login, logout.
- `ThemeContext` — dark/light mode con persistencia en localStorage.

## Modelo de datos resumido

```
users  ──┐
         ├──< trades  ──< trade_images
         │
         ├──< systems  ──< system_signals
         │
         ├──< notes (jerarquía) ──< note_blocks  ──< note_block_images
         │                                       └──< note_block_trades  ──> trades
         │                       └──< note_tag_assignments  ──> note_tags
         │
         └──< backtest_sessions  ──< backtest_trades
```

Detalle completo: [`database.md`](database.md).

## Convenciones de comunicación

**Request bodies** validados con Joi en el backend. Si fallan: response 400 con `code: VALIDATION_ERROR` y array `details`.

**Respuestas exitosas**:
```json
{ "success": true, "data": { ... }, "message": "..." }
```

**Respuestas de error**:
```json
{
  "success": false,
  "error": { "message": "...", "code": "ERROR_CODE", "details": [...] }
}
```

El frontend (`api/client.js`) re-formatea errores a `{ message, code, details, status }` antes de propagarlos al hook.

## Componentes documentados aparte

- [`backend.md`](backend.md) — qué hay dentro de cada capa, paths reales, ejemplos.
- [`frontend.md`](frontend.md) — TanStack Query patterns, contexts, hooks específicos.
- [`database.md`](database.md) — tablas, FKs, columnas generadas, migraciones.
- [`auth.md`](auth.md) — Google OAuth, JWT lifecycle, roles.
