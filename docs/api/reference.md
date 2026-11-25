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
| `tag_ids` | CSV de ints (`"1,2,3"`) | — | Filtra trades que tengan **al menos uno** de esos tags (`EXISTS` sobre `trade_tag_assignments`) |

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
| `tag_ids[]` | int[] | opcional, FKs a `trade_tags` (deben pertenecer al usuario) |
| `images` | file[] (jpg/png/webp/gif) | opcional, max 10, ≤`MAX_FILE_SIZE` |

**Response 201**: el trade creado con imágenes incluidas.

### `PUT /api/trades/:id`

Actualiza un trade. Mismo body que POST. Acepta nuevas imágenes vía `images[]` que se **agregan** (no reemplazan). `tag_ids` es **reemplazo total** (igual que los tags de notas): si se envía, sustituye todas las asignaciones existentes; `tag_ids: []` limpia todos los tags del trade.

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

### Tags (globales por usuario)

`GET`/`POST`/`PATCH`/`DELETE` en `/api/trades/tags[/:tagId]` (montadas antes de `/api/trades/:id` para que Express no confunda `tags` con un `:id`). Espejo de los tags de notas (`/api/notes/tags`).

| Ruta | Body | Notas |
|------|------|-------|
| `GET /api/trades/tags` | — | Lista los tags del usuario, ordenados por nombre |
| `POST /api/trades/tags` | `{ name, color? }` | `color` hex `#RRGGBB`, default `#6B7280`. 400 si ya existe un tag con ese nombre (case-insensitive) |
| `PATCH /api/trades/tags/:tagId` | `{ name?, color? }` | |
| `DELETE /api/trades/tags/:tagId` | — | Borra el tag y sus asignaciones (`ON DELETE CASCADE`) |

La asignación de tags a un trade **no** tiene endpoints propios: se hace vía el campo `tag_ids` en `POST /api/trades` y `PUT /api/trades/:id` (ver arriba). El detalle (`GET /api/trades/:id`) y el listado (`GET /api/trades`) incluyen `tags: [{ id, name, color }]` en cada trade.

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
| `GET` | `/api/notes/search?q=...&tag_ids=1,4` | Búsqueda de bloques por texto y tags, agrupados por nota. Ver [Búsqueda](#búsqueda). |
| `GET` | `/api/notes/export/json` | Export completo. El diccionario raíz de tags trae `{ name, color, group }` (`group`: nombre del grupo, o `"Libre"`) y cada bloque `tags: [nombres]` (orden canónico, `[]` si no tiene). |
| `GET` | `/api/notes/export/markdown` | Export como markdown. Tras cada bloque con tags va una línea `> Tags: NQ, proyección`. |
| `PATCH` | `/api/notes/reorder` | Reordenar nodos (sin cambiar parent). |
| `GET` | `/api/notes/blocks/review` | Seguimiento pendiente (`requires_follow_up`) + actividad reciente. Query: `hours` (24/48/168), `pendingHours`. |
| `GET` | `/api/notes/blocks/revisit` | Bloques marcados para repaso (`marked_for_revisit`), ordenados por antigüedad (`updated_at ASC`). Query opcional: `pendingHours` (24/48/168 \| `all`). Devuelve `{ blocks, pendingHours }`. |
| `GET` | `/api/notes/blocks/by-tags?tag_ids=1,4,7` | Repaso por tag: bloques con al menos un tag de la selección de **cada** grupo presente (OR dentro de un grupo, AND entre grupos; Libre cuenta como un grupo más). `tag_ids` es un CSV requerido (los repetidos se ignoran; más de 50 → 400; un tag ajeno o borrado → 400). Excluye referencias, notas en la papelera y pendientes. Devuelve `{ items, total, truncated }`: hasta 500 items `{ block_id, note_id, note_title, block_type, preview, created_at, updated_at, marked_for_revisit }`, del más reciente al más antiguo; `preview` (140 caracteres) solo en `text`/`callout`. |
| `GET` | `/api/notes/blocks/:blockId` | Un bloque suelto, con el mismo shape que cada elemento de `blocks` en `GET /api/notes/:id` (imágenes, trades, recordatorios, `tags`), más `note: { id, title }`. 404 si es ajeno o su nota está en la papelera. Lo usa el visor de repaso. |

### Búsqueda

`GET /api/notes/search` — la usa la página `/buscar`. Query: `q` (hasta 500 caracteres), `tag_ids` (CSV) y `limit` (notas, 1–100, default 30).

| Entrada | Resultado |
|---|---|
| Solo `q` | Notas cuyo título hace match, y bloques `text`/`callout` cuyo contenido hace match, agrupados por nota. |
| Solo `tag_ids` | Bloques con esos tags: OR dentro de un grupo, AND entre grupos (la misma regla que `/blocks/by-tags`). |
| `q` + `tag_ids` | Bloques que cumplen los tags **y** cuyo contenido o el título de su nota hace match. |
| Nada (o `q` sin letras ni dígitos) | 400 "Escribe algo o elige un tag". |

- **Texto:** sin operadores, cada palabra es un AND y la última se busca como prefijo (`proyec` encuentra "proyección" mientras se escribe). Con comillas, `or` como palabra o `-` al inicio de una palabra se usa la sintaxis de `websearch_to_tsquery` (`"frase exacta"`, `-excluir`, `a or b`). Los caracteres especiales nunca dan 500. Diccionario `spanish`, sin `unaccent`: "operacion" no encuentra "operación".
- Nunca devuelve bloques de referencia, notas en la papelera ni contenido de otro usuario. Un tag ajeno o borrado → 400, como en el repaso por tag.

```json
{
  "notes": [
    {
      "id": 12, "title": "NQ", "parent_note_id": 3, "updated_at": "…",
      "title_headline": "<b>NQ</b>", "title_match": true, "block_count": 7,
      "blocks": [
        { "block_id": 81, "block_type": "text", "snippet": "… <b>proyección</b> …",
          "tags": [{ "id": 4, "name": "NQ", "color": "#3B82F6", "group_id": 2 }], "created_at": "…" }
      ],
      "block_ids": [81, 84, 90]
    }
  ],
  "total_notes": 14, "total_blocks": 52, "truncated": false
}
```

- `blocks`: hasta 3 por nota, con snippet (`ts_headline`, o los primeros 140 caracteres; `null` fuera de `text`/`callout`). Con texto, los de mejor rank; solo con tags, los más recientes.
- `block_ids`: todos los bloques de la nota que hicieron match, en el orden de la nota (para "Repasar"). En total hasta 500; si se corta, `truncated: true`.
- Orden de las notas: con texto, por rank (título ×2 + mejor bloque) y `updated_at`; solo con tags, por el bloque más reciente.

### CRUD de notas

| Método | Ruta | Notas |
|--------|------|-------|
| `POST` | `/api/notes` | Crear nota. Body: `{ title?, parent_note_id?, type? }` (`type` ∈ `note` \| `section`). |
| `GET` | `/api/notes/:id` | Detalle con bloques. Cada bloque trae `price_alerts` y `date_reminders` (con `last_price` del catálogo para la distancia), y la nota los suyos de nivel nota. Ver [Recordatorios de análisis](#recordatorios-de-análisis). La nota y cada bloque traen `tags: [{ id, name, color, group_id, position }]` en orden canónico (`[]` si no tienen). |
| `PATCH` | `/api/notes/:id/title` | Renombrar. |
| `DELETE` | `/api/notes/:id` | Soft-delete recursivo (nota + descendientes vía `deleted_at`). Conserva las filas de bloques/imágenes; de disco solo borra archivos de imagen con >24h. |
| `PATCH` | `/api/notes/:id/move` | Mover (cambia parent). |
| `PATCH` | `/api/notes/:id/move-dnd` | Mover con drag-and-drop (cambia parent + position fractional). |

### Tags (globales por usuario)

`GET`/`POST`/`PATCH`/`DELETE` en `/api/notes/tags[/:tagId]`. Cada tag es `{ id, name, color, group_id, position }` en todas las respuestas (el CRUD agrega `created_at`). `group_id` es un grupo del usuario, o `null` para **Libre**; `position` es su orden dentro del grupo. `POST` y `PATCH` aceptan `group_id` (entero positivo o `null`; sin él, Libre); un grupo ajeno o inexistente → 404 "Grupo no encontrado". El tag nuevo va al final de su grupo, y un `PATCH` que cambia el grupo lo pone al final del nuevo (con el mismo grupo conserva su lugar). Un nombre repetido (sin distinguir mayúsculas, también con dos creaciones simultáneas) → 400 "Ya existe un tag con ese nombre". `GET` ordena por nombre; el resto de respuestas usan el **orden canónico**: por la posición de su grupo, Libre al final, luego por la `position` del tag y, para empates, por nombre. Spec: [`features/specs/tags-bloques.md`](../features/specs/tags-bloques.md).

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| `PUT` | `/api/notes/tags/order` | `{ group_id, tag_ids }` | Los tags del grupo en el orden nuevo. `group_id` es obligatorio (`null`: Libre) y `tag_ids` tiene que ser exactamente el conjunto de tags del grupo, sin repetidos → si no, 400. Grupo ajeno o inexistente → 404. Cambia el orden de los tags en todas las respuestas. |

#### Grupos de tags

Cada usuario tiene sus grupos (`note_tag_groups`). **Libre no es un grupo**: son los tags con `group_id = null`; va siempre al final y su nombre está reservado. Un grupo es `{ id, name, color, position, tag_count }`; `color` es el que se propone a los tags nuevos del grupo.

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| `GET` | `/api/notes/tag-groups` | — | Lista por `position, id`. |
| `POST` | `/api/notes/tag-groups` | `{ name, color? }` | 201 con el grupo, al final. |
| `PATCH` | `/api/notes/tag-groups/:groupId` | `{ name?, color? }` | El grupo. |
| `DELETE` | `/api/notes/tag-groups/:groupId` | — | `{ id, moved_tags }`: sus tags pasan al final de Libre, en el orden que tenían, y siguen asignados a sus notas y bloques. |
| `PUT` | `/api/notes/tag-groups/order` | `{ group_ids }` | La lista ordenada. Reordenar cambia el orden de los tags en todas las respuestas. |

- `name`: de 1 a 50 caracteres, con trim. Repetido (sin mayúsculas) → 409 "Ya existe un grupo con ese nombre". "Libre" → 400 `"Libre" es el grupo de los tags sin grupo`.
- Como máximo 20 grupos por usuario → 400.
- Grupo ajeno o inexistente → 404 "Grupo no encontrado".
- `group_ids` tiene que ser exactamente el conjunto de grupos del usuario, sin repetidos → si no, 400.

Los mismos tags sirven para notas y para bloques:

| Método | Ruta | Notas |
|--------|------|-------|
| `POST` | `/api/notes/:noteId/tags` | **Reemplaza** los tags de la nota. Body: `{ tag_ids: [...] }` (repetidos ignorados; `[]` limpia). Los tags de la nota son los **tags por defecto** de sus bloques nuevos: no cambian los bloques existentes. |
| `DELETE` | `/api/notes/:noteId/tags` | Quita tags de la nota. Body: `{ tag_ids: [...] }`. |
| `POST` | `/api/notes/:noteId/tags/apply-to-blocks` | "Aplicar a bloques existentes": agrega los tags de la nota a sus bloques directos que no son referencias (sin sub-notas). Solo agrega. Devuelve `{ blocks_updated, assignments_created }`. |
| `POST` | `/api/notes/blocks/:blockId/tags` | Agrega un tag a un bloque. Body: `{ tag_id }`. Idempotente. Devuelve `{ block_id, tags }` (lista completa, orden canónico). Tag ajeno → 404; bloque `reference` → 400. |
| `DELETE` | `/api/notes/blocks/:blockId/tags/:tagId` | Quita un tag de un bloque. Idempotente. Devuelve `{ block_id, tags }`. |

### Bloques

| Método | Ruta | Notas |
|--------|------|-------|
| `POST` | `/api/notes/:noteId/blocks` | Crear bloque (`block_type` ∈ `text`, `image_gallery`, `image`, `reference`, `callout`, `trade_reference`). El bloque nace con los tags de su nota (salvo las referencias, que no llevan tags); la respuesta trae `tags`. |
| `PATCH` | `/api/notes/blocks/:blockId` | Actualizar contenido. |
| `PATCH` | `/api/notes/blocks/:blockId/metadata` | Actualizar metadata (variante de callout, etc.). |
| `PATCH` | `/api/notes/blocks/:blockId/move-dnd` | Reordenar bloque dentro de la nota (DnD; para mover a otra nota usar `move-to-note`). |
| `PATCH` | `/api/notes/blocks/:blockId/move-to-note` | Mover el bloque a otra nota (se apenda al final). Body: `{ target_note_id }`. Si el bloque es `reference` de una sub-nota (hija de la nota origen), reparenta también la sub-nota. Transaccional. Ver `docs/features/notas/`. |
| `PATCH` | `/api/notes/blocks/:blockId/follow-up` | Toggle de seguimiento. Body: `{ requires_follow_up: boolean }`. |
| `PATCH` | `/api/notes/blocks/:blockId/revisit` | Toggle de repaso. Body: `{ marked_for_revisit: boolean }`. |
| `PATCH` | `/api/notes/:noteId/blocks/reorder` | Reordenar bloques dentro de una nota. |
| `DELETE` | `/api/notes/blocks/:blockId` | Borrar bloque. Si es el bloque `reference` de una sub-nota (su `linked_note_id` cuelga de la misma nota), soft-delete también de la sub-nota y su subtree. Devuelve `{ deleted_note_ids }`. |

### Imágenes en bloques

| Método | Ruta | Notas |
|--------|------|-------|
| `POST` | `/api/notes/blocks/:blockId/images` | Multipart `image` único. En bloques `image` reemplaza la imagen anterior. |
| `PATCH` | `/api/notes/blocks/:blockId/images/reorder` | Reordenar imágenes del bloque. |
| `PATCH` | `/api/notes/images/:imageId` | Editar caption. |
| `DELETE` | `/api/notes/images/:imageId` | Borrar imagen. |

### Trades referenciados desde bloques `trade-reference`

| Método | Ruta | Notas |
|--------|------|-------|
| `POST` | `/api/notes/blocks/:blockId/trades` | Body: `{ trade_id }`. |
| `DELETE` | `/api/notes/blocks/:blockId/trades/:tradeId` | Quitar trade del bloque. |

---

## TODO

`/api/todos/*` — listas de pendientes. Cada item tiene detrás una nota oculta (`notes.type = 'todo'`, campo `note_id`) cuyo contenido se edita con los endpoints de **Bloques** e **Imágenes en bloques** de `/api/notes` (solo `text`, `image` e `image_gallery`). Esas notas no aparecen en el árbol, búsqueda, exportación, Revisión ni Repaso.

| Método | Ruta | Notas |
|--------|------|-------|
| `GET` | `/api/todos/lists` | Listas del usuario con `pending_count` y `preview_items` (primeros 5 pendientes, `{ id, title }`, en orden). |
| `POST` | `/api/todos/lists` | Crear lista. Body: `{ name }`. |
| `PATCH` | `/api/todos/lists/:listId` | Renombrar. Body: `{ name }`. |
| `DELETE` | `/api/todos/lists/:listId` | Borra la lista y sus items; soft-delete de sus notas (la purga diferida borra después las imágenes). |
| `GET` | `/api/todos/lists/:listId/items` | Items ordenados por `position` (pendientes y completados juntos; el cliente los separa). Incluye `has_content`. |
| `POST` | `/api/todos/lists/:listId/items` | Crear item (entra arriba de todo). Body: `{ title }`. Crea también su nota con un bloque de texto vacío. |
| `PATCH` | `/api/todos/items/:itemId` | Body: `{ title?, completed? }` (al menos uno). Re-completar conserva el `completed_at` original. |
| `PATCH` | `/api/todos/items/:itemId/move` | Reordenar dentro de la misma lista. Body: `{ targetId, dropType }` (`sibling-above` \| `sibling-below`). |
| `DELETE` | `/api/todos/items/:itemId` | Borra el item y hace soft-delete de su nota. |

---

## Recordatorios de análisis

Alertas de precio sobre perpetuos de Binance Futures USDⓈ-M (cripto y TradFi) y recordatorios por fecha, anclados a un bloque **o** a una nota (`block_id` XOR `note_id`; solo notas `type = 'note'` y sus bloques). Un job del backend crea las tarjetas de la bandeja `/recordatorios`. Ninguno de estos endpoints pide velas ni catálogo a Binance; el único acceso es el precio de la caché (como mucho una llamada por minuto para toda la app). Spec: [`features/specs/alertas-de-precio-en-notas.md`](../features/specs/alertas-de-precio-en-notas.md).

Las fechas se envían en ISO 8601 **con zona** (`Z` u offset); sin zona → 400.

### Catálogo — `/api/market-symbols`

| Método | Ruta | Notas |
|--------|------|-------|
| `GET` | `/api/market-symbols` | Perpetuos vigentes (`invalid_at IS NULL`): primero los que el usuario usó en alertas (`last_used_at`), luego alfabético. Campos: `symbol`, `contract_type` (`PERPETUAL` \| `TRADIFI_PERPETUAL`), `base_asset`, `quote_asset`, `tick_size`, `last_price`, `last_price_at`. No hay alta: lo mantiene el sync diario del job. |
| `GET` | `/api/market-symbols/:symbol/price` | `{ price, as_of }` desde la caché de 60 s, o `{ price: null }`. Si no se puede refrescar (backoff, peso alto, error) devuelve el último precio cacheado o el `last_price` del catálogo. |

### Alertas de precio — `/api/price-alerts`

| Método | Ruta | Notas |
|--------|------|-------|
| `POST` | `/api/price-alerts` | Body: `{ block_id \| note_id, symbol, target_price, direction, is_invalidation?, near_pct?, deadline_at?, message? }`. `direction` ∈ `above` \| `below`; `near_pct` 0.1–50 o `null` (sin aviso previo); `deadline_at` futura o `null`. Símbolo fuera del catálogo o deslistado → 400 "Símbolo no disponible en Binance Futures". El servidor pone `price_at_creation` y, si el precio ya está en la banda de aviso, `near_at`. |
| `GET` | `/api/price-alerts?status=active\|triggered` | Alertas de notas no borradas con `last_price`, `last_price_at`, `distance_pct` (desde `last_price`, o desde `price_at_creation` si el job aún no leyó el símbolo) y el anclaje (`note_id`, `note_title`, `block_id`, `block_excerpt`). |
| `PATCH` | `/api/price-alerts/:id` | Editar `target_price` / `direction` / `is_invalidation` / `near_pct` / `deadline_at` / `message`. Cambiar nivel, dirección o `is_invalidation` re-arma (una alerta disparada se re-arma aunque el nivel sea el mismo) y resuelve sus tarjetas abiertas como `rearmed`; una `deadline_at` nueva resuelve las `price_alert_deadline` como `updated`. |
| `DELETE` | `/api/price-alerts/:id` | Borra la alerta; sus tarjetas abiertas se resuelven como `dismissed`. |

### Recordatorios por fecha — `/api/date-reminders`

| Método | Ruta | Notas |
|--------|------|-------|
| `POST` | `/api/date-reminders` | Body: `{ block_id \| note_id, remind_at, message? }`. `remind_at` al menos 1 min en el futuro. |
| `GET` | `/api/date-reminders?status=pending\|sent` | Con el anclaje, ordenados por `remind_at`. |
| `PATCH` | `/api/date-reminders/:id` | `remind_at` / `message`. Una fecha nueva re-programa (`pending`) y resuelve sus tarjetas abiertas como `rearmed`. |
| `DELETE` | `/api/date-reminders/:id` | Borra; sus tarjetas abiertas se resuelven como `dismissed`. |

### Bandeja — `/api/notifications`

| Método | Ruta | Notas |
|--------|------|-------|
| `GET` | `/api/notifications?status=open\|resolved&before=<id>` | `{ items, next_before }`. Abiertas: todas, las más recientes primero. Resueltas: 50 por página ordenadas por `resolved_at` (el cursor `before` es el id de la última tarjeta; se pagina por `(resolved_at, id)`). Cada tarjeta trae `payload` (foto del momento), `price_alert` / `date_reminder` (estado actual, `null` si se borró), `note_id` / `block_id` del anclaje actual y `note_available`. |
| `GET` | `/api/notifications/count` | `{ open }` para el badge. |
| `POST` | `/api/notifications/:id/resolve` | Body: `{ resolution: 'dismissed', delete_sibling_alerts? }`. Idempotente (una tarjeta ya resuelta se devuelve tal cual). `delete_sibling_alerts` solo en `price_alert_invalidation` (si no, 400): borra las demás alertas activas del mismo anclaje. |

### Avisos push — `/api/push`

Vinculan **este** dispositivo a la cuenta para recibir las tarjetas nuevas como notificaciones del sistema (Web Push). Vincular es siempre manual (sección "Avisos en este dispositivo" de `/recordatorios`), y un dispositivo recibe los avisos de una sola cuenta. Spec: [`notificaciones-push-pwa.md`](../features/specs/notificaciones-push-pwa.md).

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/push/config` | `{ enabled, public_key }` (`public_key: null` si el push está desactivado por falta de claves VAPID). |
| `POST` | `/api/push/subscriptions` | Body: `{ endpoint, keys: { p256dh, auth }, user_agent? }` (lo que da `subscription.toJSON()`; `expirationTime` se descarta). `201`. Vincula el dispositivo; si era de otra cuenta, pasa a esta. `409 PUSH_DISABLED` sin claves; `400 PUSH_ENDPOINT_NOT_ALLOWED` si el host del endpoint no es FCM, Mozilla, Apple o WNS (anti-SSRF). |
| `POST` | `/api/push/subscriptions/status` | Mismo body. `{ linked }`. Si el dispositivo estaba vinculado a otra cuenta, lo desvincula de ella; si es de esta, renueva claves y `last_seen_at`. Nunca vincula. |
| `DELETE` | `/api/push/subscriptions` | Body: `{ endpoint }`. Desvincula el dispositivo (solo la fila de la cuenta; no falla si no existía). |
| `POST` | `/api/push/test` | Body: `{ endpoint }`. Envía una notificación de prueba y espera al servicio de push: `{ delivered: true }`; `410 PUSH_SUBSCRIPTION_GONE` (fila borrada: el frontend resuscribe); `502 PUSH_REJECTED` con `details.status` (p. ej. 403 = claves VAPID que no coinciden); `502 PUSH_SEND_FAILED`; `404` si el dispositivo no es de la cuenta. |

Tipos de tarjeta: `price_alert_near`, `price_alert_hit`, `price_alert_invalidation`, `price_alert_deadline`, `price_alert_delisted`, `date_reminder_due`.

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
