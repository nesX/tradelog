# Task: API de alertas de precio y recordatorios por fecha
2026-11-22 · Backend · Recordatorios de análisis 5/11 · Depende de: 016, 018, 019

Spec: §3.7 (Alertas y Recordatorios) y §2 (Ciclo de vida) de [alertas-de-precio-en-notas.md](../../features/specs/alertas-de-precio-en-notas.md).

## Objetivo
El CRUD de lo que el usuario arma desde el modal, sin pedir velas ni catálogo a
Binance desde estos endpoints, y los datos que necesita el editor para pintar
los chips sin peticiones extra.

## Alcance

### 1. Alertas de precio — `/api/price-alerts`
Patrón de `docs/development/workflow.md`: `priceAlert.validator.js`,
`.repository.js`, `.service.js`, `.controller.js`, `.routes.js` y montaje en
`server.js`.

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/price-alerts` | Crear |
| `GET` | `/api/price-alerts?status=active\|triggered` | Listar (pestaña Programadas) |
| `PATCH` | `/api/price-alerts/:id` | Editar o re-armar |
| `DELETE` | `/api/price-alerts/:id` | Borrar |

**Validator**: `xor('block_id', 'note_id')`; `symbol` en mayúsculas con
`/^[A-Z0-9]{2,30}$/`; `target_price > 0`; `direction` `above|below`;
`is_invalidation` (default `false`); `near_pct` entre 0.1 y 50 o `null`;
`deadline_at` futura o `null`; `message` de hasta 500 caracteres. Fechas ISO
8601 **con zona** (`Z` u offset): sin zona, el servidor (en UTC) las correría
5 h. Mensajes en español.

**`create`** (service):
1. El bloque o la nota es del usuario y no está borrado. Solo se anclan notas
   `type = 'note'` y sus bloques: las `section` no tienen bloques y las `todo`
   son las notas ocultas de los pendientes (el deep-link `/notes/:id` no les
   sirve). Esta restricción no está en la spec: confirmarla.
2. Símbolo en el catálogo y sin `invalid_at`; si no,
   `ValidationError('Símbolo no disponible en Binance Futures')`.
3. `price_at_creation` = `marketPrice.getPrice(symbol)` (task 019; puede ser
   `null`). Es la única vía por la que este endpoint puede llegar a Binance, y
   como mucho una vez por minuto.
4. Si ese precio ya está dentro de la banda de cercanía (`isWithinNearBand`,
   task 018) → `near_at = NOW()`.
5. Si el símbolo no tiene alertas activas en notas no borradas (mismo criterio
   que el job) → `checked_until` = inicio de la hora actual (UTC).
6. Insertar. Los pasos 5 y 6, en la misma transacción.

**`PATCH`**, en una transacción con `SELECT … FOR UPDATE` de la alerta (el tick
la bloquea igual, §3.2 paso 8e):
- Cambiar `target_price`, `direction` o `is_invalidation` = re-armar:
  `status = 'active'`, `armed_at = NOW()`, `near_at = NULL`,
  `triggered_at = NULL`, los pasos 3–5 de `create` con el nivel nuevo y todas
  sus tarjetas abiertas resueltas como `rearmed`.
- Cambiar `deadline_at` → sus tarjetas `price_alert_deadline` abiertas se
  resuelven como `updated`.
- Cambiar solo `message` o `near_pct` no toca las tarjetas.

**`DELETE`**: borra la alerta y resuelve sus tarjetas abiertas como
`dismissed`, en la misma transacción.

**`GET`**: solo alertas de notas no borradas, con `last_price`,
`last_price_at`, `distance_pct` y el anclaje (`note_id`, `note_title`,
`block_id`, `block_excerpt`).

**Repository**: convertir `target_price`, `near_pct`, `price_at_creation` y
`last_price` a `Number` (con strings, `'60000' > '100000'` da `true`).

### 2. Recordatorios por fecha — `/api/date-reminders`
Mismo patrón y la misma validación de anclaje.

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/date-reminders` | `{ block_id \| note_id, remind_at, message? }` |
| `GET` | `/api/date-reminders?status=pending\|sent` | Con los datos del anclaje |
| `PATCH` | `/api/date-reminders/:id` | `remind_at` / `message` |
| `DELETE` | `/api/date-reminders/:id` | Borrar |

- `remind_at`: al menos 1 minuto en el futuro, ISO con zona.
- Una fecha nueva en `PATCH` = re-programar: `status = 'pending'`,
  `sent_at = NULL` y sus tarjetas abiertas resueltas como `rearmed`.
- `DELETE` resuelve sus tarjetas abiertas como `dismissed`.

### 3. `GET /api/notes/:id`
En `note.repository.js → getById` (`:33`), dos subqueries `json_agg` más por
bloque, igual que `images` y `trades`: `price_alerts` (con el `last_price` del
catálogo, para la distancia) y `date_reminders`. En la nota, sus alertas y
recordatorios de nivel nota. Dentro de `json_agg` los `NUMERIC` salen como
números JSON, así que ahí no hace falta convertir. `note.repository.js` tiene
cambios sin commitear de la feature de pendientes.

### 4. Tests (repos mockeados, como `note.service.test.js`)
- `create`: símbolo deslistado → error; precio dentro de la banda → `near_at`;
  `checked_until` se resetea solo si no hay otras alertas activas; anclaje a
  `section` o `todo` → error.
- `PATCH`: el re-armado resuelve como `rearmed`; el cambio de fecha límite
  resuelve las de fecha límite como `updated`; cambiar el mensaje no toca
  tarjetas.
- `DELETE` de alerta y de recordatorio → tarjetas `dismissed`.

## Criterios de aceptación
- Crear, editar y borrar alertas y recordatorios con curl, siempre sobre datos
  del usuario autenticado (los de otro usuario → 404).
- Crear una alerta no genera peticiones de velas ni de `exchangeInfo`.
- `GET /api/notes/:id` trae `price_alerts` y `date_reminders` por bloque y en
  la nota, y la vista de pendientes (`TodoItem.jsx`, que usa el mismo GET)
  sigue funcionando.
- `npm test` y `npm run lint` pasan.
