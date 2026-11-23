# Task: backend — envío de los avisos desde el job de recordatorios
2026-11-23 · Backend · Notificaciones push 2/5 · Depende de: 028

Spec: §3.3, §3.4 (`notifyNew`, reglas de la marca de agua e invariante) y §3.5
de [notificaciones-push-pwa.md](../../features/specs/notificaciones-push-pwa.md).

## Objetivo
Que cada tarjeta nueva de `/recordatorios` llegue como notificación a los
dispositivos vinculados de su cuenta, sin tocar la lógica de las tarjetas, sin
perder avisos si el proceso se reinicia y sin que un fallo de envío rompa el tick.

## Alcance

### 1. `src/services/pushMessage.js` — funciones puras
`buildPushMessages(cards, nowMs)`. Pasos:
1. **Filtrar por tipo**: `PUSH_TYPES` = `price_alert_hit`, `price_alert_near`,
   `price_alert_deadline`, `price_alert_delisted` y `date_reminder_due`. La
   **tesis invalidada no genera aviso**.
2. **Descartar las viejas**: las de más de 24 h desde `created_at`.
3. **Tag**:
   - `pa-<price_alert_id>` o `dr-<date_reminder_id>`.
   - `card-<id>` si la FK quedó en NULL.
4. **Colapsar por tag**: toque > deslistado > cercanía > fecha límite.
5. **Umbral**: hasta 3 mensajes por usuario → uno por tarjeta (`kind: 'card'`).
   Más de 3 → un resumen (`kind: 'summary'`, `count` y hasta 3 `symbols`).
6. **Recorte del payload**: sin `sibling_alerts` ni `block_excerpt`, y con
   `message` y `note_title` cortados a 200 caracteres.

Funciones auxiliares:
- `ttlFor`: 4 h para cercanía, 24 h para el resto.
- `topicFor`: el `tag`. El resumen devuelve `null` (sin tag ni topic).

Exportar `PUSH_TYPES` y la lista de campos recortados: la task 030 los replica
en su test de paridad.

### 2. Repositories
- `notification.repository.js`:
  - `findCreatedAfter(id)`: `id, user_id, type, price_alert_id, date_reminder_id,
    payload, created_at`, `ORDER BY id`.
  - `maxId()`.
- `reminderJobState.repository.js`: `setPushNotifiedId(id)`.

### 3. `push.service.js` → `notifyNew()`
Con la estructura de §3.4, que **nunca lanza**:
- Marca `NULL` → la pone en `maxId()` sin enviar.
- Sin tarjetas nuevas o con el push desactivado → no envía. Si se leyeron
  filas, la marca avanza igual.
- `sendAll` envía con `Promise.allSettled` a cada suscripción de cada usuario.
  Los 404/410 se acumulan y al final `deleteByEndpoints`. El resto, `warn` con
  el status y el **host** del endpoint.
- **El `UPDATE` de la marca va en el `finally`**: avanza hasta el id más alto de
  las filas leídas en todos los caminos (push desactivado, sin suscripciones,
  todos los envíos fallan, `buildPushMessages` lanza). Nunca un `MAX(id)`
  consultado después.
- Devuelve `{ sent, failed, removed }`.

### 4. `reminderJob.service.js`
- `tick()` envuelve su cuerpo en `try/finally` y en el `finally` hace
  `summary.push = await pushService.notifyNew()`.
- **Dentro de `tick()`, no de `runTick()`**: así corre solo con el advisory lock
  tomado.
- El log del tick pasa a `info` si `push.sent` o `push.failed` > 0.
- Comentario del invariante (§3.4) junto a `notifyNew` y junto al bucle de
  símbolos: no paralelizar el tick sin revisar la marca de agua.

## Criterios de aceptación
- Al aplicar la 029 y desplegar, el primer tick **no** avisa del histórico.
- Una tarjeta nueva de cada uno de los cinco tipos genera un mensaje. Una
  `price_alert_invalidation` no genera ninguno, y la marca la deja atrás.
- Fecha límite + toque de la misma alerta en el mismo tick → un solo mensaje,
  el del toque.
- 5 tarjetas del mismo usuario en un tick → un resumen.
- Sin claves VAPID, la marca avanza y no se envía nada. Al configurarlas no sale
  lo acumulado.
- Un error en `notifyNew` no rompe el tick ni impide programar el siguiente.

## Tests (Jest)
- `pushMessage`:
  - Filtro de tipos.
  - Descarte por antigüedad.
  - Tags y fallback `card-<id>`.
  - Colapso con prioridad.
  - Umbral ≤3/>3 y símbolos del resumen.
  - Recorte y tamaño en el peor caso (`message` de 500 emojis): JSON < 3 KB.
  - TTL y topic (`null` en el resumen).
- `notifyNew`: marca `NULL`; la marca avanza en los cuatro caminos de §3.4
  (regla 2); 404/410 borran y 403 no; nunca lanza.
- `reminderJob.service.test.js`: `notifyNew` se llama en el `finally`, también
  cuando el tick corta por backoff de Binance, y no se llama sin el lock.

## Notas
- No correr `npm run format`; `npm run lint:fix` y `npm test`.
- Verificación manual en dev: una vez hecha la 030, con la UI de la 031, o antes
  con una suscripción creada a mano desde la consola del navegador.

## Implementación (2026-11-23)
Hecha. `tick()` llama a `runSteps()` (el cuerpo de antes, sin cambios) dentro del
`try/finally`, para no reindentar todo el tick. 57 tests nuevos (`pushMessage`,
`notifyNew` y los del job). Contra la BD temporal: dos recordatorios y una
invalidación → dos envíos, y la marca avanza hasta la invalidación aunque los
envíos fallen; marca `NULL` → se siembra sin enviar.

De punta a punta (con la 030 y la 031): una tarjeta insertada en
`notifications` → `notifyNew` → FCM → notificación en Chrome con su titular, tag
`card-<id>` y URL.
