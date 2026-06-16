# API Reference

Express REST API. Todos los endpoints exceptuando `POST /api/auth/google` y `GET /api/health` requieren `Authorization: Bearer <jwt>`.

Base URL en producción: `https://tradelog.nesx.co/api`. En local: `http://localhost:5000/api` (sin Docker) o `http://localhost:3000/api` (con Docker).

## Formato unificado

Respuesta exitosa:

```json
{
  "success": true,
  "data": { ... },
  "message": "Operación exitosa"
}
```

Respuesta de error:

```json
{
  "success": false,
  "error": {
    "message": "Descripción legible",
    "code": "ERROR_CODE",
    "details": [...]
  }
}
```

## Códigos de error

| Code | Status | Origen |
|------|--------|--------|
| `AUTH_REQUIRED` | 401 | Sin header Authorization |
| `INVALID_TOKEN_FORMAT` | 401 | Header malformado |
| `INVALID_TOKEN` | 401 | JWT inválido o expirado |
| `FORBIDDEN` | 403 | Rol insuficiente |
| `NOT_FOUND` | 404 | `NotFoundError` |
| `VALIDATION_ERROR` | 400 | Joi falló — `details: [{ field, message }]` |
| `CONFLICT` | 409 | `ConflictError` (duplicado, etc.) |
| `DUPLICATE_ENTRY` | 409 | PG 23505 (constraint UNIQUE) |
| `INVALID_REFERENCE` | 400 | PG 23503 (FK rota) |
| `CHECK_VIOLATION` | 400 | PG 23514 |
| `FILE_TOO_LARGE` | 400 | Multer `LIMIT_FILE_SIZE` |
| `INVALID_FILE_TYPE` | 400 | Multer `LIMIT_UNEXPECTED_FILE` o filtro MIME |
| `DATABASE_ERROR` | 500 | Errores no clasificados de PG |
| `INTERNAL_ERROR` | 500 | Cualquier otro error no operacional |
| `ROUTE_NOT_FOUND` | 404 | Ruta inexistente |

---

## Auth

### `POST /api/auth/google`

Público. Login con Google.

**Body**:
```json
{ "id_token": "<google_id_token>" }
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "token": "<jwt>",
    "user": { "id": 1, "email": "...", "name": "...", "picture": "...", "role": "user" }
  }
}
```

### `GET /api/auth/me`

Devuelve el usuario actual.

**Response 200**:
```json
{ "success": true, "data": { "user": { "id": 1, ... } } }
```

### `POST /api/auth/logout`

Cierra sesión (no revoca el token en backend — solo señal). Siempre 200.

### `POST /api/auth/refresh`

Emite un JWT nuevo con la misma identidad y `JWT_EXPIRES_IN` desde ahora.

---

## Health

### `GET /api/health`

Público. Sin auth.

**Response 200**:
```json
{
  "success": true,
  "data": { "status": "ok", "timestamp": "2026-05-28T12:34:56.789Z", "environment": "production" }
}
```

---

## Trades

`/api/trades` — todas las rutas protegidas con `authenticate`.

### `GET /api/trades`

Listar trades del usuario. Soporta filtros y paginación.

**Query params** (todos opcionales):

| Param | Tipo | Default | Notas |
|-------|------|---------|-------|
| `page` | int ≥1 | 1 | |
| `limit` | int 1–100 | 20 | |
| `sortBy` | enum | `entry_date` | `entry_date`, `exit_date`, `symbol`, `pnl`, `pnl_percentage`, `created_at` |
| `sortDir` | `asc`/`desc` | `desc` | |
| `symbol` | string | — | Filtro exacto (uppercase) |
| `trade_type` | `LONG`/`SHORT` | — | |
| `status` | `OPEN`/`CLOSED` | — | |
| `start_date` | ISO date | — | Filtra `entry_date >= start_date` |
| `end_date` | ISO date | — | Filtra `entry_date <= end_date` |

**Response 200**:
```json
{
  "success": true,
  "data": {
    "trades": [ { "id": 1, "symbol": "...", "pnl": 12.34, ... } ],
    "total": 234,
    "page": 1,
    "limit": 20,
    "totalPages": 12
  }
}
```

### `GET /api/trades/:id`

Detalle de un trade. Incluye `images: [{ id, filename, original_name, file_size }]`.

### `POST /api/trades`

Crear trade. `multipart/form-data` para soportar imágenes (campo `images`, máximo 10).

**Body (form-data)**:

| Campo | Tipo | Required |
|-------|------|----------|
| `symbol` | string ≤20 | sí |
| `trade_type` | `LONG`/`SHORT` | sí |
| `entry_price` | number > 0 | sí |
| `exit_price` | number > 0 | opcional (null = trade abierto) |
| `quantity` | number > 0 | sí |
| `entry_date` | ISO timestamp | sí |
| `exit_date` | ISO timestamp | opcional |
| `commission` | number ≥0 | opcional, default 0 |
| `notes` | string | opcional |
| `status` | `OPEN`/`CLOSED` | opcional, default `OPEN` |
| `system_id` | int | opcional, FK a `systems` |
| `signal_ids[]` | int[] | opcional |
| `timeframe_ids[]` | int[] | opcional |
| `images` | file[] (jpg/png/webp/gif) | opcional, max 10, ≤`MAX_FILE_SIZE` |

**Response 201**: el trade creado con imágenes incluidas.

### `PUT /api/trades/:id`

Actualiza un trade. Mismo body que POST. Acepta nuevas imágenes vía `images[]` que se **agregan** (no reemplazan).

### `DELETE /api/trades/:id`

Soft delete (setea `deleted_at = NOW()`).

### `GET /api/trades/symbols`

Lista de símbolos únicos del usuario.

**Response**:
```json
{ "success": true, "data": { "symbols": ["BTCUSDT", "ETHUSDT", ...] } }
```

### `POST /api/trades/:id/images`

Agrega imágenes a un trade existente. `multipart/form-data` con `images[]`.

### `DELETE /api/trades/:id/images/:imageId`

Elimina una imagen específica del trade.

### `DELETE /api/trades/:id/images`

Elimina **todas** las imágenes del trade.

### `POST /api/trades/import/preview`

Previsualiza un import CSV sin guardar. Body JSON:

```json
{ "csv_text": "fecha;simbolo;tipo;...\n2025-01-15 10:30;BTCUSDT;..." }
```

**Response**:
```json
{
  "success": true,
  "data": {
    "valid": [ { "line": 2, "data": { "symbol": "...", ... } } ],
    "errors": [ { "line": 5, "errors": [{ "field": "...", "message": "..." }] } ]
  }
}
```

### `POST /api/trades/import`

Importa CSV de verdad (mismo body). Solo importa filas válidas. Devuelve cantidad de creados.

Spec del CSV: [`csv-format.md`](csv-format.md).

---

## Stats

`/api/stats/*` — todas autenticadas. Las queries hacen agregaciones SQL en tiempo real (sin caching).

### `GET /api/stats`

Estadísticas generales del usuario.

**Response**:
```json
{
  "success": true,
  "data": {
    "total_trades": 234,
    "open_trades": 5,
    "closed_trades": 229,
    "winning_trades": 145,
    "losing_trades": 84,
    "win_rate": 63.32,
    "total_pnl": 1234.56,
    "avg_pnl": 5.39,
    "best_trade": 89.10,
    "worst_trade": -45.20,
    "avg_winning": 12.34,
    "avg_losing": -6.78
  }
}
```

### `GET /api/stats/by-symbol`

Agregaciones agrupadas por símbolo.

### `GET /api/stats/by-date?start_date&end_date`

Stats dentro de un rango.

### `GET /api/stats/daily-pnl?start_date&end_date`

Serie temporal: `[{ date: 'YYYY-MM-DD', pnl: 12.34, count: 3 }, ...]`.

### `GET /api/stats/by-type`

Stats agrupadas por `LONG` vs `SHORT`.

### `GET /api/stats/top-trades?limit=5`

Mejores y peores: `{ best: [...], worst: [...] }`.

---

## Systems & Timeframes

### `GET /api/systems`, `POST /api/systems`, `GET /api/systems/:id`, `PATCH /api/systems/:id/name`, `DELETE /api/systems/:id`

CRUD de sistemas de trading. Cada sistema tiene `signals[]` anidados.

### `GET /api/timeframes`, `POST /api/timeframes`, `DELETE /api/timeframes/:id`

Timeframes del usuario.

---

## Notes

`/api/notes/*` — feature compleja, ver código en `note.routes.js` y `note.service.js`.

### Rutas planas (sin :id de nota)

| Método | Ruta | Notas |
|--------|------|-------|
| `GET` | `/api/notes/tree` | Árbol completo de notas del usuario. |
| `GET` | `/api/notes/search?q=...` | Full-text search sobre títulos y contenido. |
| `GET` | `/api/notes/export/json` | Export completo. |
| `GET` | `/api/notes/export/markdown` | Export como markdown. |
| `PATCH` | `/api/notes/reorder` | Reordenar nodos (sin cambiar parent). |
| `GET` | `/api/notes/blocks/review` | Seguimiento pendiente (`requires_follow_up`) + actividad reciente. Query: `hours` (24/48/168), `pendingHours`. |

### CRUD de notas

| Método | Ruta | Notas |
|--------|------|-------|
| `POST` | `/api/notes` | Crear nota. Body: `{ title?, parent_note_id?, type? }` (`type` ∈ `note` \| `section`). |
| `GET` | `/api/notes/:id` | Detalle con bloques. |
| `PATCH` | `/api/notes/:id/title` | Renombrar. |
| `DELETE` | `/api/notes/:id` | Soft-delete recursivo (nota + descendientes vía `deleted_at`). Conserva las filas de bloques/imágenes; de disco solo borra archivos de imagen con >24h. |
| `PATCH` | `/api/notes/:id/move` | Mover (cambia parent). |
| `PATCH` | `/api/notes/:id/move-dnd` | Mover con drag-and-drop (cambia parent + position fractional). |

### Tags (globales por usuario)

`GET`/`POST`/`PATCH`/`DELETE` en `/api/notes/tags[/:tagId]`. Asignar/remover a una nota: `POST`/`DELETE /api/notes/:noteId/tags` con `{ tag_ids: [...] }`.

### Bloques

| Método | Ruta | Notas |
|--------|------|-------|
| `POST` | `/api/notes/:noteId/blocks` | Crear bloque (`block_type` ∈ `text`, `image_gallery`, `reference`, `callout`, `trade_reference`). |
| `PATCH` | `/api/notes/blocks/:blockId` | Actualizar contenido. |
| `PATCH` | `/api/notes/blocks/:blockId/metadata` | Actualizar metadata (variante de callout, etc.). |
| `PATCH` | `/api/notes/blocks/:blockId/move-dnd` | Reordenar bloque dentro de la nota (DnD; cross-nota no soportado en V1). |
| `PATCH` | `/api/notes/blocks/:blockId/follow-up` | Toggle de seguimiento. Body: `{ requires_follow_up: boolean }`. |
| `PATCH` | `/api/notes/:noteId/blocks/reorder` | Reordenar bloques dentro de una nota. |
| `DELETE` | `/api/notes/blocks/:blockId` | Borrar bloque. |

### Imágenes en bloques

| Método | Ruta | Notas |
|--------|------|-------|
| `POST` | `/api/notes/blocks/:blockId/images` | Multipart `image` único. |
| `PATCH` | `/api/notes/blocks/:blockId/images/reorder` | Reordenar imágenes del bloque. |
| `PATCH` | `/api/notes/images/:imageId` | Editar caption. |
| `DELETE` | `/api/notes/images/:imageId` | Borrar imagen. |

### Trades referenciados desde bloques `trade-reference`

| Método | Ruta | Notas |
|--------|------|-------|
| `POST` | `/api/notes/blocks/:blockId/trades` | Body: `{ trade_id }`. |
| `DELETE` | `/api/notes/blocks/:blockId/trades/:tradeId` | Quitar trade del bloque. |

---

## Backtest

`/api/backtest/*` — sesiones de backtesting con trades virtuales.

| Método | Ruta | Notas |
|--------|------|-------|
| `GET` | `/api/backtest/sessions` | Listar. |
| `POST` | `/api/backtest/sessions` | Crear (symbol, timeframe, initial_balance, etc.). |
| `GET` | `/api/backtest/sessions/:id` | Detalle con trades. |
| `PATCH` | `/api/backtest/sessions/:id/close` | Cerrar sesión (resumen final). |
| `PATCH` | `/api/backtest/sessions/:id/description` | Editar descripción. |
| `GET` | `/api/backtest/sessions/:id/continuation-data` | Datos para "continuar desde donde quedó". |
| `POST` | `/api/backtest/sessions/:id/trades` | Agregar trade virtual (acepta 1 imagen). |
| `DELETE` | `/api/backtest/trades/:tradeId` | Borrar trade virtual. |
| `DELETE` | `/api/backtest/trades/:tradeId/image` | Quitar imagen del trade virtual. |

---

## Admin

`/api/admin/*` — requiere `authorize('admin', 'super_admin')`.

| Método | Ruta | Notas |
|--------|------|-------|
| `GET` | `/api/admin/users` | Listar usuarios (query: `page`, `limit`, `search`). |
| `GET` | `/api/admin/users/:id` | Detalle. |
| `POST` | `/api/admin/users` | Crear usuario (sin contraseña; deberá loguearse con Google con ese email). |
| `PATCH` | `/api/admin/users/:id/role` | Cambiar rol. **No se puede demote a un super_admin.** |
| `DELETE` | `/api/admin/users/:id` | Eliminar (cascade a sus datos). |

---

## Images

### `GET /api/images/:filename`

Público (sin auth). Sirve directamente desde el directorio `uploads/` con `express.static`. Sin transformación.

**Importante**: el camino es por filename — no por trade_id ni user_id. Los filenames son UUID + timestamp y no son adivinables, pero **cualquiera con el filename puede acceder**. Documentado como gap en [`../analysis/security.md`](../analysis/security.md).

---

## Cómo invocar desde curl

```bash
TOKEN="..."  # obtener del flujo de Google

# Listar trades
curl -H "Authorization: Bearer $TOKEN" \
  "https://tradelog.nesx.co/api/trades?page=1&limit=20&sortBy=pnl&sortDir=desc"

# Crear trade (sin imágenes)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTCUSDT","trade_type":"LONG","entry_price":42000,"exit_price":43500,"quantity":0.1,"entry_date":"2026-01-15T10:30:00Z"}' \
  "https://tradelog.nesx.co/api/trades"

# Crear trade con imágenes
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -F "symbol=BTCUSDT" -F "trade_type=LONG" -F "entry_price=42000" \
  -F "exit_price=43500" -F "quantity=0.1" -F "entry_date=2026-01-15T10:30:00Z" \
  -F "images=@chart1.png" -F "images=@chart2.png" \
  "https://tradelog.nesx.co/api/trades"
```
