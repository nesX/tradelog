# Feature: Notificaciones push de los recordatorios (Web Push)

## 1. Resumen

Enviar una **notificación del sistema** (Web Push) a los dispositivos del usuario cada vez que el job de recordatorios crea una tarjeta en la bandeja `/recordatorios`. Llega aunque la app esté cerrada: en el móvil con la PWA instalada y en el navegador de escritorio.

Es un **canal adicional**, no un sistema nuevo. Las tarjetas siguen siendo la fuente de verdad. El push solo avisa de que hay una tarjeta nueva y lleva a ella. Todo lo que ya existe (evaluación de velas, tipos de tarjeta, acciones, resolución) queda igual. Ver [`alertas-de-precio-en-notas.md`](alertas-de-precio-en-notas.md).

### Motivación

La spec de recordatorios eligió "solo in-app" porque la app de notas se usa todo el día. Pero los avisos más útiles llegan cuando no se está mirando la app: un toque a las 3:00, un aviso de cercanía durante el fin de semana, o un recordatorio por fecha a las 08:00. Hoy esos avisos esperan hasta la próxima vez que alguien abre `/recordatorios` y mira la campana.

La app ya es instalable como PWA (`vite-plugin-pwa`, `display: 'standalone'`), y desde iOS 16.4 las PWA instaladas pueden recibir Web Push. El canal funciona en todas las plataformas que se usan, sin app nativa y sin servicios de pago.

### Casos de uso

1. **Toque de madrugada**: `BTCUSDT` toca 60,000 a las 03:40. En el siguiente tick llega al móvil la notificación "BTCUSDT tocó 60.000 · Análisis macro BTC 2026". Al tocarla se abre `/recordatorios` con la tarjeta resaltada.
2. **Aviso previo y toque**: "BTCUSDT a 2.1% de 60.000" llega en la oficina, con tiempo para releer el análisis. Horas después, el toque **reemplaza** esa notificación en el centro de notificaciones, y vuelve a sonar.
3. **Recordatorio por fecha**: el día programado, a las 08:00, llega "Revisar tras el cierre trimestral".
4. **Recuperación tras una caída**: el server estuvo 8 h caído y el primer tick crea 6 tarjetas. Llega **una** notificación, "6 recordatorios nuevos · BTCUSDT, ETHUSDT, XAUUSDT y 3 más", en vez de seis seguidas.
5. **Varios dispositivos**: el aviso llega al móvil y al portátil donde se activó. En un dispositivo donde no se activó, no llega.
6. **Vincular un dispositivo**: en `/recordatorios`, la sección "Avisos en este dispositivo" dice si el dispositivo en el que estás está vinculado a tu cuenta. Al activarla, se vincula y desde ese momento recibe los avisos. Los recordatorios no dependen de los dispositivos: se crean, se disparan y se resuelven igual aunque no haya ninguno vinculado.
7. **Dos cuentas en el mismo navegador**: cada cuenta configura sus avisos por separado, y un dispositivo nunca recibe avisos de una cuenta distinta a la que lo está usando. Si en un navegador vinculado a A se entra con B, el dispositivo deja de recibir los avisos de A. B solo los recibe si activa los suyos.

### Decisiones tomadas

| Tema | Decisión |
|------|----------|
| Canal | **Web Push estándar** (protocolo con claves VAPID), con la librería `web-push` en el backend. Sin Firebase SDK, sin OneSignal ni otros servicios de terceros: el navegador elige su servicio de push (FCM, Apple, Mozilla, WNS) y el backend le habla directamente. |
| Qué genera push | **Cinco de los seis tipos** de tarjeta: todos menos la **tesis invalidada**, que solo queda en la bandeja. La cercanía es justamente el aviso que más se aprovecha si llega a tiempo. Las invalidaciones se van a replantear más adelante (§7). |
| Qué tarjetas avisar | Las que tienen `id` mayor que una **marca de agua** guardada en `reminder_job_state`. Así se cubre cualquier ruta que cree tarjetas, sin cambiar las funciones del job (§3.5). |
| Agrupación | Por usuario y por tick: primero, un solo mensaje por alerta (gana la tarjeta más importante); después, **hasta 3 → una notificación por tarjeta** y **más de 3 → un resumen**. |
| Reemplazo | Una notificación nueva de la misma alerta **reemplaza** a la anterior (`tag`) y **vuelve a sonar** (`renotify`). |
| Destino al tocar | Tarjeta suelta → `/recordatorios?card=<id>` (pestaña Pendientes, tarjeta resaltada). Resumen → `/recordatorios`. No se salta directo a la nota: las acciones (re-armar, archivar…) están en la tarjeta, y "Ver análisis" queda a un toque. |
| Texto | Lo arma el **service worker** con el mismo módulo que las tarjetas (`utils/notificationText.js`). Así no se duplican textos en el backend, y las fechas salen en la hora local del dispositivo. Si algo falla al armarlo, se muestra un aviso genérico. |
| Activación | **Manual y por dispositivo**, con la sección "Avisos en este dispositivo" en `/recordatorios`. Ahí se ve si **este** dispositivo está vinculado a la cuenta, y se activa (vincula) o desactiva. **Solo esa acción vincula un dispositivo**: la sincronización al abrir la app únicamente renueva el que ya está vinculado (§5.4). **Un dispositivo, una cuenta**: recibe solo los avisos de la cuenta con la que se usa. Al usarlo con otra cuenta, se desvincula de la anterior, y cada cuenta lo activa por separado. Sin preferencias por tipo de aviso (§7). |
| Entrega | Sin cola ni reintentos por mensaje: si el servicio de push falla, ese aviso se pierde, pero la tarjeta sigue en la bandeja y en la campana. Un reinicio entre crear la tarjeta y avisar **no** pierde el aviso: lo envía el siguiente tick. |
| Horario | Sin horas de silencio: se delega en el "No molestar" del sistema operativo (§7). |
| Sin claves VAPID (o inválidas) | El push queda **desactivado** y el resto funciona igual. Una clave mal pegada nunca tumba el arranque. Dev no necesita claves. |
| Cerrar sesión | **No cambia nada por ahora**: el dispositivo sigue vinculado y recibiendo los avisos de la cuenta hasta que se desactive desde `/recordatorios` o se use con otra cuenta (§5.7). |

### Qué tarjetas generan aviso

Son los seis tipos de tarjeta que ya crea el job de recordatorios (§3.6 de la spec de recordatorios). Cinco generan una notificación con el mismo titular que la tarjeta. La tesis invalidada **no genera aviso**: su tarjeta aparece en `/recordatorios` como hoy.

| Tarjeta | Cuándo se crea | Ejemplo de notificación |
|---------|----------------|-------------------------|
| **Nivel tocado** (`price_alert_hit`) | El precio tocó el nivel de una alerta | "BTCUSDT tocó 60.000" |
| **Cerca del nivel** (`price_alert_near`) | El precio entró en la banda del aviso previo (3% por defecto) | "BTCUSDT a 2.1% de 60.000" |
| ~~Tesis invalidada~~ (`price_alert_invalidation`) | Una alerta marcada como invalidación cerró el día más allá del nivel | **Sin aviso** (solo tarjeta en la bandeja) |
| **Fecha límite** (`price_alert_deadline`) | Venció la fecha límite de una alerta sin que se tocara el nivel | "BTCUSDT ↓ 60.000 no se tocó antes del 31/03/2027" |
| **Perpetuo deslistado** (`price_alert_delisted`) | Binance dejó de cotizar el símbolo de una alerta | "XYZUSDT dejó de cotizar en Binance Futures" |
| **Recordatorio** (`date_reminder_due`) | Llegó la fecha de un recordatorio por fecha | El mensaje del recordatorio, o "Revisar este análisis" |

El cuerpo de la notificación lleva el detalle de la tarjeta y el título de la nota (§4.2).

### Objetivos de diseño

- **No tocar la lógica de las tarjetas**: el push lee lo que el job ya guardó.
- **Vincular es siempre manual**: ningún proceso automático vincula un dispositivo a una cuenta que no lo activó en él.
- **Un dispositivo nunca recibe avisos de otra cuenta**: en cuanto se usa con una cuenta, deja de estar vinculado a cualquier otra.
- **Un push nunca rompe un tick**: los errores de envío se loguean y el tick sigue.
- **Nunca avisar de algo que no existe**: solo se leen tarjetas que ya hicieron commit.
- **Una notificación rota nunca rompe la suscripción**: el SW siempre muestra algo, aunque reciba un mensaje que no entiende.
- **Un SW roto nunca congela la app**: el código del SW no toca `window` ni `document`, y eso se prueba (§5.1).
- **Suscripciones que se limpian solas**: si el servicio de push responde que el dispositivo ya no existe (404/410), se borra la fila.

### Soporte por plataforma

| Plataforma | Soporte |
|------------|---------|
| Android (Chrome, Edge, Samsung Internet, Firefox) | Sí, instalada o no. |
| Escritorio (Chrome, Edge, Firefox, Safari 16+) | Sí, con el navegador abierto (en segundo plano basta). |
| iPhone / iPad | **Solo iOS/iPadOS 16.4+ y con la app instalada en la pantalla de inicio**. En Safari sin instalar, `PushManager` no existe. Safari ignora `renotify`: un reemplazo puede llegar sin sonido (verificar, §6). |

En todas, el permiso se pide **desde un toque del usuario** (el interruptor), nunca al cargar la página: iOS lo exige, y Chrome silencia los sitios que piden el permiso de entrada.

---

## 2. Modelo de datos

Migración `029_migration_push_subscriptions.sql`, idempotente:

```sql
-- 1. Suscripciones Web Push: una fila por navegador/dispositivo en el que el usuario
--    activó los avisos. El endpoint identifica al dispositivo (lo genera el servicio
--    de push del navegador) y es único: si otro usuario inicia sesión en el mismo
--    navegador y activa los avisos, la fila pasa a ser suya.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,                 -- clave pública del navegador (base64url)
  auth          TEXT NOT NULL,                 -- secreto de autenticación (base64url)
  user_agent    VARCHAR(300),                  -- solo para depurar ("iPhone", "Chrome Linux"…)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()  -- última sincronización desde la app (§5.4)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);

-- 2. Marca de agua: id de la última tarjeta de la que ya se intentó avisar por push.
--    Se siembra en MAX(id) para no avisar del histórico al desplegar. El WHERE la
--    hace idempotente: re-aplicar la migración no la mueve.
ALTER TABLE reminder_job_state ADD COLUMN IF NOT EXISTS push_notified_id INTEGER;
UPDATE reminder_job_state
   SET push_notified_id = (SELECT COALESCE(MAX(id), 0) FROM notifications)
 WHERE id = 1 AND push_notified_id IS NULL;
```

- **`notifications` no cambia**: no hay columna `pushed_at`. Lo enviado se deduce de la marca de agua.
- **`ON DELETE CASCADE`**: al borrar un usuario se borran sus suscripciones.
- **`p256dh` y `auth`** no sirven para leer nada del usuario: solo permiten cifrar mensajes hacia ese navegador. No son secretos del lado del servidor, pero tampoco se devuelven nunca por la API.

---

## 3. Backend

### 3.1 Cliente — `src/clients/webPush.js`

Envuelve la librería `web-push` (dependencia nueva, **3.6.7**: la 4.0.0 es una versión mayor de noviembre de 2026 que pasa a ESM y no se ha probado), igual que `binanceFutures.js` envuelve Binance:

- **Inicialización perezosa** (en la primera llamada, no al importar). Todo va dentro de un único `try/catch`:
  1. Comprueba que estén **las dos** claves (la regla "o las dos o ninguna" vive aquí, no en `env.js`).
  2. Comprueba el formato: `VAPID_PUBLIC_KEY` es base64url de 87 caracteres y `VAPID_PRIVATE_KEY` de 43.
  3. Llama a `webpush.setVapidDetails(subject, public, private)`, que además valida el `subject`.

  Si falta algo, el formato no cuadra o `setVapidDetails` lanza, `isEnabled()` devuelve `false` y se loguea **una sola vez** el motivo ("Web Push desactivado: falta VAPID_PRIVATE_KEY", "…: VAPID_PUBLIC_KEY con formato inválido", "…: subject inválido"). El arranque nunca falla por esto. `env.js` lanza al arrancar, así que ahí no se valida nada de esto.
- **Nivel del log**: `error` en producción (`NODE_ENV=production`) y `info` en dev. En prod, el push desactivado no tiene otra señal: el interruptor desaparece y los dispositivos ya suscritos dejan de recibir en silencio. En dev, sin claves es lo normal.
- `send(subscription, message, { ttl, topic })` → `webpush.sendNotification(sub, JSON.stringify(message), { TTL: ttl, urgency: 'high', topic, timeout: 10_000 })`.
- Traduce los errores a tres casos:
  - `PushGoneError`: status 404 o 410, el dispositivo ya no existe.
  - `PushRejectedError`: status 400, 401, 403 o 413, el servicio rechazó el mensaje (claves VAPID distintas, payload demasiado grande…). Conserva el `status`.
  - Resto (red, 5xx, timeout): se propaga tal cual.

### 3.2 Repositories

`src/repositories/pushSubscription.repository.js`:

- `link({ userId, endpoint, p256dh, auth, userAgent })`: vinculación **manual**. `INSERT … ON CONFLICT (endpoint) DO UPDATE SET user_id, p256dh, auth, user_agent, last_seen_at = NOW()`. Si el dispositivo estaba vinculado a otra cuenta, pasa a esta.
- `checkIn({ userId, endpoint, p256dh, auth, userAgent })`: lo usa la comprobación **automática** al abrir la app (§5.4). En una transacción:
  1. `DELETE … WHERE endpoint = $1 AND user_id <> $2`: si el dispositivo estaba vinculado a otra cuenta, se desvincula de ella.
  2. `UPDATE … SET p256dh, auth, user_agent, last_seen_at = NOW() WHERE endpoint = $1 AND user_id = $2`.
  3. Devuelve si actualizó alguna fila (`linked`).

  Nunca inserta: vincular sigue siendo manual (`link`).
- `deleteByEndpoint(userId, endpoint)`: solo si la fila es del usuario.
- `findByEndpoint(userId, endpoint)`.
- `findByUserIds(userIds)`: `WHERE user_id = ANY($1)`.
- `deleteByEndpoints(endpoints)`: limpieza tras un 404/410.

En repositories existentes:

- `notification.repository.js` → `findCreatedAfter(id)`: `SELECT id, user_id, type, price_alert_id, date_reminder_id, payload, created_at FROM notifications WHERE id > $1 ORDER BY id`, y `maxId()`.
- `reminderJobState.repository.js` → `setPushNotifiedId(id)`.

### 3.3 Mensaje — `src/services/pushMessage.js` (funciones puras, con tests)

`buildPushMessages(cards, nowMs)` recibe las tarjetas nuevas (filas de `findCreatedAfter`) y devuelve `Map<userId, message[]>`.

**1. Descartar las viejas**: las tarjetas con `created_at` de hace más de 24 h no se avisan. Solo ocurre si el envío estuvo parado mucho tiempo, y un aviso de hace días es ruido.

**Antes de todo, filtrar por tipo**: solo generan aviso los tipos de `PUSH_TYPES` (constante en `pushMessage.js`): `price_alert_hit`, `price_alert_near`, `price_alert_deadline`, `price_alert_delisted` y `date_reminder_due`. Las `price_alert_invalidation` se descartan aquí. La marca de agua avanza igual sobre ellas (§3.4): se leen, pero no se avisan.

**2. Tag por tarjeta**:

| Tarjeta | Tag |
|---------|-----|
| Con `price_alert_id` | `pa-<price_alert_id>` |
| Con `date_reminder_id` | `dr-<date_reminder_id>` |
| Si la FK quedó en NULL (la alerta se borró entre medias) | `card-<id>` |

Se calcula en el backend y viaja en el mensaje: el `payload` de la tarjeta no trae esos ids.

**3. Colapsar por tag**. Si un usuario tiene varias tarjetas con el mismo tag en el mismo lote, se queda solo la más importante: `price_alert_hit` > `price_alert_delisted` > `price_alert_near` > `price_alert_deadline`. Las invalidaciones ya se descartaron en el filtro por tipo.

- Hoy esto solo pasa cuando, en el mismo tick, una alerta vence su fecha límite y además toca o se acerca: las dos cosas se evalúan con las velas, en el paso 8 del job. Cercanía y toque de la misma alerta nunca salen en el mismo tick: `processSymbol` emite una u otra.
- **Cercanía va antes que fecha límite**: al vencer, la alerta **sigue armada** (solo se pone `deadline_at = NULL`; ver "Ciclo de vida" en la spec de recordatorios). El "cerca de" dice que el precio se acerca ahora mismo; la fecha límite pregunta si el análisis sigue vigente y puede esperar.
- Fecha límite + toque en el mismo tick solo ocurre cuando el toque es posterior a la fecha límite: las dos tarjetas son ciertas y el colapso deja la del toque. Antes también salía con un toque anterior a la fecha, por un bug del job que evaluaba la fecha límite antes de recuperar las velas (ver [bug](../../tasks/done/027-Fecha%20l%C3%ADmite%20evaluada%20antes%20de%20recuperar%20las%20velas.md)); ya está arreglado.
- Sin colapsar, los dos mensajes saldrían en paralelo con el mismo topic. En el servicio de push y en el centro de notificaciones gana el último que llega, que podría ser el menos importante.
- Las tarjetas descartadas siguen en la bandeja.

**4. Umbral**:

- **≤ 3 mensajes** → uno por tarjeta:

```json
{
  "v": 1,
  "kind": "card",
  "id": 812,
  "type": "price_alert_hit",
  "tag": "pa-77",
  "created_at": "2027-03-04T03:41:12.000Z",
  "payload": { "symbol": "BTCUSDT", "direction": "below", "target_price": 60000, "candle_value": 59870.5,
               "candle_open_time": "2027-03-04T03:00:00.000Z", "is_invalidation": false,
               "note_title": "Análisis macro BTC 2026", "message": null }
}
```

- **> 3** → un único resumen, **sin tag**: dos resúmenes seguidos se apilan, en vez de que el segundo esconda al primero.

```json
{ "v": 1, "kind": "summary", "count": 6, "symbols": ["BTCUSDT", "ETHUSDT", "XAUUSDT"], "created_at": "…" }
```

`symbols`: hasta 3 símbolos distintos, por orden de importancia de la tarjeta. Los recordatorios por fecha no tienen símbolo; cuentan en `count`.

**5. Recorte del payload**: se envía el de la tarjeta **sin** `sibling_alerts` ni `block_excerpt` (no se usan en el texto), y con `message` y `note_title` recortados a 200 caracteres. El validador limita `message` a 500 *caracteres*, no bytes (un emoji son 4), y `note_title` no tiene límite. Con el recorte, el mensaje queda siempre muy por debajo de los ~4 KB de Web Push. Un test lo comprueba con el peor caso.

**6. TTL por mensaje** (`ttlFor`). Es cuánto guarda el servicio de push el mensaje si el dispositivo está offline:

| Mensaje | TTL |
|---------|-----|
| `price_alert_near` | 4 h (un "cerca de" que llega 20 h tarde es ruido) |
| Resto y resumen | 24 h |

El `topic` de Web Push es el mismo `tag`: si el dispositivo está offline, el servicio reemplaza el mensaje pendiente por el siguiente de la misma alerta. **El resumen va sin topic** (`topicFor` devuelve `null` y no se manda la cabecera `Topic`). Si lo llevara, un dispositivo offline solo recibiría el último resumen.

### 3.4 Service — `src/services/push.service.js`

- `getConfig()` → `{ enabled, public_key }`.
- `link(userId, { endpoint, keys, user_agent })` → comprueba la allowlist (§3.7) y llama a `link` del repository.
- `status(userId, { endpoint, keys, user_agent })` → llama a `checkIn` y devuelve `{ linked }`. Si desvinculó otra cuenta, lo loguea a nivel `info` (ids de usuario, nunca el endpoint).
- `unsubscribe(userId, endpoint)`.
- `sendTest(userId, endpoint)`: busca la fila (`findByEndpoint`, `NotFoundError` si no es del usuario), envía `{ v: 1, kind: 'test', created_at }` y **espera la respuesta** del servicio de push. Es la única herramienta de diagnóstico en el iPhone, así que devuelve lo que pasó (§3.6). Con un 404/410 borra la fila.
- `notifyNew()`. Lo llama el job y **nunca lanza excepciones**. Estructura:

```js
export const notifyNew = async () => {
  let cards = [];
  try {
    let mark = (await jobStateRepo.get()).push_notified_id;
    if (mark == null) {                       // red de seguridad: la migración ya la siembra
      await jobStateRepo.setPushNotifiedId(await notificationRepo.maxId());
      return { sent: 0, failed: 0, removed: 0 };
    }
    cards = await notificationRepo.findCreatedAfter(mark);
    if (cards.length === 0 || !webPush.isEnabled()) return { sent: 0, failed: 0, removed: 0 };
    return await sendAll(cards);              // buildPushMessages + envíos + limpieza de 404/410
  } catch (err) {
    logger.error(`Push: falló el envío de avisos: ${err.message}`);
    return { sent: 0, failed: cards.length, removed: 0 };
  } finally {
    if (cards.length > 0) {
      const last = cards[cards.length - 1].id; // el mayor de las filas leídas (ORDER BY id)
      await jobStateRepo.setPushNotifiedId(last).catch((err) =>
        logger.error(`Push: no se pudo guardar la marca ${last}: ${err.message}`));
    }
  }
};
```

`sendAll(cards)`:

1. Llama a `buildPushMessages(cards)` y a `findByUserIds([...usuarios])`.
2. Envía cada mensaje a cada suscripción de su usuario, en paralelo (`Promise.allSettled`; el volumen es de decenas como mucho).
3. Si hay `PushGoneError`, acumula el endpoint y al final llama a `deleteByEndpoints`. Si hay `PushRejectedError` u otros errores, `logger.warn` con el status y el host del endpoint (nunca el endpoint completo).
4. Devuelve `{ sent, failed, removed }` para el log del tick.

#### Reglas de la marca de agua

1. **Se siembra en `MAX(id)`**: en la migración (§2) y, como red de seguridad, en la primera lectura si es `NULL`. Si arrancara en 0, el primer tick en prod avisaría de todo el histórico.
2. **Avanza siempre que se leyeron filas**, pase lo que pase después. Por eso el `UPDATE` está en el `finally` y no detrás de ningún `return`:
   - Con el push desactivado o sin suscripciones: si no avanzara, el día que se configuren las claves (en dev, al añadirlas) saldría de golpe todo lo acumulado.
   - Si fallan los envíos, por ejemplo un dispositivo que devuelve 403 en cada intento: si no avanzara, cada tick reenviaría todo a todos.
   - Si lanza `buildPushMessages`: si no avanzara, una tarjeta con un payload raro bloquearía el push para siempre.
3. **La marca nueva es el id más alto de las filas leídas**, nunca un `MAX(id)` consultado después: una tarjeta creada entre la lectura y el `UPDATE` quedaría saltada.
4. **Se guarda después de enviar, no antes**. Si el proceso se cae a mitad del envío, el siguiente tick repite esos avisos y, con `renotify`, suenan dos veces. Guardarla antes los perdería; es el lado correcto del trade-off.
5. **Corre con el advisory lock del job tomado** (§3.5). Un proceso sin el lock nunca llega a `notifyNew`, así que dos procesos no pueden leer la misma marca y duplicar avisos.

#### Invariante

Una transacción con un id menor puede hacer commit **después** de que se leyera uno mayor, porque los ids de `notifications` salen de una secuencia. Entonces su tarjeta queda por debajo de la marca y se salta para siempre. Para que no pase, cuando corre `findCreatedAfter` no puede quedar **ninguna transacción que inserte tarjetas sin terminar**.

- Hoy se cumple:
  - Las tarjetas solo se crean dentro del job: pasos 3, 4 y 8, y `delistSymbols` vía `syncCatalog` o el paso 8.
  - El tick es secuencial: cada `withTransaction` se espera con `await` antes de seguir, y `notifyNew` corre después de todas, bajo el mismo lock.
- **Se rompe si**:
  - Se crean tarjetas fuera del job (un endpoint, otro proceso).
  - El tick se paraleliza (p. ej. `Promise.all` sobre los símbolos). Un rechazo temprano dejaría transacciones vivas mientras corre el `finally`.
- En ambos casos hay que revisar este mecanismo antes. Por ejemplo, leyendo solo las tarjetas con más de unos segundos de antigüedad, o esperando con `Promise.allSettled` a que terminen todas las transacciones.
- Este invariante va también como comentario junto a `notifyNew` y junto al bucle de símbolos de `tick()`.

### 3.5 Integración con el job — `reminderJob.service.js`

Un único cambio, sin tocar las firmas de las funciones del job ni sus tests: `tick()` envuelve su cuerpo en `try/finally` y en el `finally` llama a `notifyNew()`.

```js
const tick = async (pauseMs) => {
  const summary = { … };
  try {
    … // cuerpo actual, sin cambios
  } finally {
    summary.push = await pushService.notifyNew();
  }
  return summary;
};
```

- **Dentro de `tick()`, no de `runTick()`**: `runTick()` solo llama a `tick()` cuando consiguió el advisory lock. Si el `try/finally` envolviera también la adquisición del lock, un proceso que no lo consiguió ejecutaría igual el `finally`, leería la misma marca y duplicaría los avisos (§3.4, regla 5).
- **Solo lee tarjetas con commit**: todas las transacciones del tick ya terminaron cuando corre el `finally` (§3.4, invariante).
- **En el `finally`**: un backoff de Binance o un error a mitad del tick no se lleva por delante los avisos de lo que ya se guardó.
- **Al final del tick, no tras cada transacción**: así se puede agrupar por usuario (§3.3). El retraso extra es lo que dure el tick, alrededor de 1 s por símbolo vigilado.
- **Un reinicio no pierde avisos**: si el proceso se cae antes del `finally`, las tarjetas quedan por encima de la marca y las avisa el siguiente tick. Si se cae después de enviar y antes de mover la marca, se reenvían. Con el mismo tag, la notificación reemplaza a la anterior: el peor caso es que suene dos veces.
- El log del tick añade `push: { sent, failed, removed }`, y su nivel pasa a `info` si `sent` o `failed` > 0.

### 3.6 API — `src/routes/push.routes.js`, montado en `/api/push`

Todas con `authenticate`. Siguen el patrón de 6 pasos de [`workflow.md`](../../development/workflow.md#cómo-añadir-un-endpoint-nuevo) (`validators/push.validator.js`, `controllers/push.controller.js`).

| Método y ruta | Body | Respuesta |
|---------------|------|-----------|
| `GET /api/push/config` | — | `{ enabled, public_key }` (`public_key: null` si está desactivado) |
| `POST /api/push/subscriptions` | `{ endpoint, keys: { p256dh, auth }, user_agent? }` | `201`. Vincula el dispositivo a la cuenta (manual; idempotente). |
| `POST /api/push/subscriptions/status` | `{ endpoint, keys: { p256dh, auth }, user_agent? }` | `200 { linked }`. Si el dispositivo es de otra cuenta, lo desvincula de ella. Si es de esta, renueva `last_seen_at` y las claves. Nunca vincula. |
| `DELETE /api/push/subscriptions` | `{ endpoint }` | `200` (`sendDeleted`, como el resto de `DELETE` de la API); no falla si no existía |
| `POST /api/push/test` | `{ endpoint }` | ver abajo |

Validación (Joi):

- `endpoint`: URI `https` de hasta 2048 caracteres.
- `p256dh` y `auth`: base64url de hasta 256.
- `user_agent`: `.max(300).truncate()`. Con `.max()` solo, Joi rechazaría los más largos.
- `subscription.toJSON()` incluye `expirationTime`. El middleware de validación ya usa `stripUnknown: true`, así que se descarta sin error. Aun así, el frontend manda solo `{ endpoint, keys }` (§5.2).

Errores:

| Caso | Respuesta |
|------|-----------|
| Push desactivado (`subscribe` y `test`) | `409 PUSH_DISABLED` ("Las notificaciones push no están configuradas en el servidor") |
| Endpoint fuera de la allowlist | `400 PUSH_ENDPOINT_NOT_ALLOWED` ("Servicio de notificaciones no soportado") |
| Test enviado | `200 { delivered: true }` |
| Test con 404/410 | La fila se borra y se responde `410 PUSH_SUBSCRIPTION_GONE` ("Este dispositivo ya no está suscrito"). El frontend resuscribe (§5.2). |
| Test con `PushRejectedError` | `502 PUSH_REJECTED`, con `details.status` (p. ej. 403 = claves VAPID que no coinciden) |
| Test con otro error | `502 PUSH_SEND_FAILED` |

El `DELETE` lleva body. Desde axios se envía con `api.delete(url, { data })`.

### 3.7 Seguridad

- **SSRF**: con `web-push`, el backend hace un `POST` a la URL que mandó el cliente. Para que un usuario no pueda apuntarla a servicios internos, `subscribe` solo acepta endpoints cuyo `new URL(endpoint)` tenga `protocol === 'https:'` y un `hostname` permitido:
  - **Exactos**: `fcm.googleapis.com` (Chrome, Edge Android, Samsung, Brave, Opera) y `updates.push.services.mozilla.com` (Firefox).
  - **Por sufijo con punto inicial**: `.push.apple.com` (Safari e iOS; hoy `web.push.apple.com`) y `.notify.windows.com` (Edge en Windows).

  Nunca un regex sobre la URL completa: `https://fcm.googleapis.com.evil.com/` tiene que fallar, y hay un test que lo comprueba. Un rechazo se loguea con el host, para detectar navegadores legítimos que falten en la lista.
- **Filas de otras cuentas**: `DELETE` y `test` filtran por `user_id`. Solo dos operaciones tocan la fila de otra cuenta, y siempre la del **mismo** endpoint:
  - `POST /subscriptions` (vinculación manual): la reasigna.
  - `status`: la borra.

  Es correcto: solo puede conocer el endpoint quien tiene ese navegador, y la regla es que el dispositivo recibe solo los avisos de la cuenta con la que se usa.
- **Contenido**: el mensaje va cifrado de extremo a extremo hasta el navegador (RFC 8291), así que el servicio de push no lo puede leer. Aun así, viaja lo mínimo (§3.3). Las notificaciones muestran precios y títulos de notas, y siguen llegando después de cerrar sesión (§5.7).
- La clave privada VAPID se trata igual que `JWT_SECRET`: solo en `.env`, nunca en git.

### 3.8 Variables de entorno (`config/env.js`)

| Variable | Requerida | Default | Descripción |
|----------|-----------|---------|-------------|
| `VAPID_PUBLIC_KEY` | no | — | Clave pública VAPID (base64url, 87 caracteres). Sin ella, push desactivado. |
| `VAPID_PRIVATE_KEY` | no | — | Clave privada VAPID (base64url, 43 caracteres). Secreta. |
| `VAPID_SUBJECT` | no | `mailto:` + `SUPER_ADMIN_EMAIL` | Contacto para los servicios de push (`mailto:` o URL `https`). Si no hay ni esta ni `SUPER_ADMIN_EMAIL` (que es opcional), push desactivado. |

- En Joi son strings opcionales, **sin formato ni `.and()`**: `env.js` lanza al arrancar, y una sola clave definida o mal pegada no puede tumbar un deploy. Todas las comprobaciones están en `webPush.js` (§3.1).
- Se generan **una sola vez** con `npx web-push generate-vapid-keys`.
- **No se rotan**. Cada suscripción queda atada a la clave pública con la que se creó, así que un cambio de claves deja todas inservibles. La app las renueva sola la próxima vez que se abre en cada dispositivo (§5.4).
- Dev: `backend/.env`. El contenedor monta `./backend` y `dotenv` lee ese archivo, así que no hace falta tocar `docker-compose.yml`. Prod: `trading-journal/.env`, que `docker-compose.prod.yml` carga entero con `env_file`.
- Aceptan `''` (`.allow('')`): Joi rechaza un string vacío, y una línea `VAPID_SUBJECT=` en blanco tumbaría el arranque.

---

## 4. Service worker

### 4.1 De `generateSW` a `injectManifest`

Hoy `vite-plugin-pwa` genera el service worker entero y no admite código propio. Pasa a `injectManifest`: el SW es un archivo nuestro, `src/sw.js`, y el plugin solo le inyecta la lista de precache y lo bundlea con Vite, así que puede importar módulos de `src/`.

Con `injectManifest`, el bloque `workbox: {...}` actual **se ignora sin avisar**. Sus cuatro opciones se migran a mano:

| Hoy (`workbox`) | Pasa a |
|-----------------|--------|
| `globPatterns` | `injectManifest.globPatterns` |
| `navigateFallback: '/index.html'` | `NavigationRoute` en `sw.js` |
| `navigateFallbackDenylist: [/^\/api/]` | `denylist` de esa `NavigationRoute` |
| `cleanupOutdatedCaches: true` | `cleanupOutdatedCaches()` en `sw.js` |

No hay `runtimeCaching`. El bundle más grande pesa ~850 KB, por debajo del límite de precache por archivo (2 MiB), así que no hace falta `maximumFileSizeToCacheInBytes`. Si el bundle crece por encima, el build lo avisa.

`vite.config.js`:

```js
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.js',           // sale como /sw.js: nginx ya lo sirve con no-cache
  registerType: 'autoUpdate',
  includeAssets: [...],
  manifest: { ... },           // sin cambios (display: 'standalone' es requisito de iOS)
  injectManifest: {
    globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
  },
  devOptions: { enabled: false, type: 'module' },   // true solo para probar el SW en `npm run dev`
})
```

Dependencias nuevas (dev): `workbox-precaching`, `workbox-routing` y `workbox-core`, **fijadas a la versión de `workbox-build` que trae `vite-plugin-pwa`** (hoy `7.4.1`), sin `^`.

### 4.2 `src/sw.js`

Reproduce lo que hoy hace el SW generado y añade dos listeners:

```js
// Lo que ya hacía el SW generado
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api/] }));
self.skipWaiting();   // registerType: 'autoUpdate'
clientsClaim();

// Nuevo
self.addEventListener('push', (event) => { … });
self.addEventListener('notificationclick', (event) => { … });
```

**`push`**. Todo va dentro de `event.waitUntil(...)`. El título y las opciones los arma `utils/pushNotification.js` (puro, con tests en Node), que nunca lanza; `sw.js` solo lo llama. Si aun así `showNotification` lanza, se muestra el genérico.

1. Construye `{ title, options }` dentro de un **único `try/catch`** que cubre el parseo, `describe()` y el formateo. Si algo lanza, o llega un `v` distinto de 1, un `kind` desconocido o un `type` que `describe()` no conoce, usa el aviso genérico: "Tienes recordatorios nuevos" → `/recordatorios`.
   - Motivo: el navegador solo busca un SW nuevo al navegar, o en un evento push si pasaron 24 h desde la última comprobación. Un push con un tipo nuevo puede llegar a un SW de un build anterior. Si no muestra nada, iOS revoca la suscripción.
2. Contenido según `kind`:

| `kind` | Título | Cuerpo |
|--------|--------|--------|
| `card` | Titular de la tarjeta ("BTCUSDT tocó 60.000") | Detalle + `\n📝 ` + `note_title` |
| `summary` | "N recordatorios nuevos" | "BTCUSDT, ETHUSDT, XAUUSDT y 3 más", o "Ábrelos en Recordatorios" si no hay símbolos |
| `test` | "Notificaciones activadas" | "Así se verán los avisos en este dispositivo" |

3. `self.registration.showNotification(title, { body, icon: '/pwa-192x192.png', badge: '/pwa-badge-96.png', tag, renotify: Boolean(tag), data: { url }, lang: 'es', timestamp: Date.parse(created_at) })`.
   - `tag`: el del mensaje (§3.3). Un segundo aviso de la misma alerta **reemplaza** al anterior en el centro de notificaciones en vez de apilarse.
   - `renotify: true`: sin él, Chrome hace ese reemplazo **sin sonido ni vibración**, justo en el caso cercanía → toque. Solo es válido con `tag`, así que el resumen y el genérico no lo llevan. Safari lo ignora (§1, soporte por plataforma).
   - `timestamp`: la hora de la tarjeta, no la de llegada. Importa cuando el aviso llega horas tarde.
   - **Siempre se muestra una notificación**, también con el aviso genérico.
4. `clients.matchAll({ type: 'window', includeUncontrolled: true })` → `postMessage({ type: 'notifications-changed' })` a cada ventana, para que la campana se actualice sin esperar 5 min.

**`notificationclick`**:

1. `notification.close()`.
2. `clients.matchAll({ type: 'window', includeUncontrolled: true })`. Si hay una ventana de la app: `focus()` y `postMessage({ type: 'navigate', url })`, para que React Router navegue sin recargar la página.
3. Si no hay ninguna: `clients.openWindow(url)`.

### 4.3 Icono de badge

`public/pwa-badge-96.png`: silueta monocroma (blanco sobre transparente) del logo. Android la usa en la barra de estado. Sin ella, Android muestra un icono genérico.

---

## 5. Frontend

### 5.1 `utils/notificationText.js` (extraído de `NotificationCard.jsx`)

Se mueven a un módulo **sin React ni lucide**, para que lo pueda importar el SW:

- `describe(card)` → `{ headline, detail }`, tal cual está hoy en `NotificationCard.jsx`, con sus helpers (`hourRange`, `utcDay`). Para un `type` desconocido **lanza**, en vez de devolver el `type` crudo como hoy. `NotificationCard` captura ese caso y mantiene su comportamiento.
- `VARIANT_LABELS` (`'Nivel tocado'`, `'Cerca del nivel'`, …): solo los textos; los iconos y colores siguen en `NotificationCard`.

`NotificationCard.jsx` pasa a importarlos.

**Regla para todo lo que importa `sw.js`, directa o transitivamente**: nada de `window`, `document` ni `localStorage` al cargar el módulo. Si un import lo hace, el SW nuevo falla al instalarse, y los dispositivos que ya tenían la app se quedan sirviendo el frontend viejo desde el precache, sin recibir más deploys.

- Hoy `notificationText.js` importa `formatPrice` (`utils/reminders.js`) y `formatDate` (`utils/formatters.js`). `reminders.js` solo toca `localStorage` dentro de funciones con `try/catch`, así que cumple.
- Blindaje: `utils/notificationText.test.js` corre con `node --test`, como los tests existentes del frontend, sin jsdom. Si algún import toca `window` al cargar, el test falla.
- **Test de paridad**: para cada uno de los cinco tipos con aviso (`PUSH_TYPES`), `describe()` sobre el payload recortado por `buildPushMessages` (§3.3) da el mismo `{ headline, detail }` que sobre el payload completo. Así se detecta si una tarjeta empieza a usar un campo que el push no envía. El recorte se replica en el test con una lista de campos que se mantiene a mano junto a la del backend.

En el SW, `formatPrice` y `formatDate` formatean con el locale y la zona horaria del dispositivo.

### 5.2 `utils/push.js` + `hooks/usePushSubscription.js`

**Estados del dispositivo**, del primero que aplica al último:

| Estado | Condición | UI |
|--------|-----------|----|
| `no-sw` | `navigator.serviceWorker.getRegistration()` devuelve `undefined` (p. ej. `npm run dev` sin `devOptions`) | Interruptor oculto, solo un texto: "Las notificaciones solo funcionan en la app compilada". En dev nunca se espera a `serviceWorker.ready`, que no resolvería. **En el build sí**, con un máximo de 10 s: en la primera visita el SW aún no está registrado (se registra en el `load`) o se está instalando, y `subscribe` falla sin un worker activo ("no active Service Worker"). |
| `ios-install` | iOS o iPadOS sin `display-mode: standalone` | "Para recibir avisos en el iPhone, instala la app: Compartir → Añadir a pantalla de inicio" |
| `ios-update` | iOS o iPadOS en standalone sin `'Notification' in window` o sin `'PushManager' in window` (iOS < 16.4) | "Actualiza a iOS 16.4 o posterior para recibir avisos" |
| `unsupported` | Resto de navegadores sin `serviceWorker`, `PushManager` o `Notification` | "Este navegador no admite notificaciones" |
| `server-disabled` | `GET /api/push/config` → `enabled: false` | Interruptor oculto |
| `denied` | `Notification.permission === 'denied'` | "Bloqueaste las notificaciones. Actívalas en los ajustes del navegador para Tradelog" |
| `lost` | Hay intención guardada, el permiso es `granted`, no hay suscripción y resuscribir falló (§5.4) | "Los avisos se desactivaron en este dispositivo" + botón **Reactivar** (gesto nuevo) y **Desactivar** (borra la intención; si no, se quedaría en `lost` para siempre) |
| `off` | Sin suscripción, o `status` → `linked: false` | "Este dispositivo no recibe avisos" + interruptor apagado |
| `on` | Hay suscripción local y `status` → `linked: true` | "Este dispositivo recibe los avisos de tu cuenta" + interruptor encendido + "Enviar prueba" |

Además, `loading` ("Comprobando este dispositivo…") mientras se calcula, y `error` si falla la API al comprobarlo.

Notas:

- **Detección de iOS**: UA con `iPhone|iPad|iPod`, **o** UA `Macintosh` con `navigator.maxTouchPoints > 1`: el iPad en Safari se presenta como Mac. Sin esta segunda condición caería en `unsupported` en vez de en `ios-install`.
- **Nunca se usa `Notification` como identificador suelto sin comprobar antes** `'Notification' in window`: en iOS < 16.4 lanza `ReferenceError`.

Si el dispositivo está vinculado (`on` u `off`) **lo dice el servidor** (`POST /subscriptions/status`), no el navegador: que el navegador tenga una suscripción no significa que esté vinculada a esta cuenta. La UI nunca menciona otras cuentas.

**Intención**: `localStorage['tradelog.push.wanted.<userId>'] = '1'`, por usuario y siempre con `try/catch`. `enable()` la pone y `disable()` la quita. Permite distinguir "lo apagué" de "el navegador soltó la suscripción" (§5.4). Al ir por usuario, otra cuenta que inicie sesión en el mismo navegador no hereda la intención.

**Acciones**:

- `enable()`. Solo se llama desde el `onClick` del interruptor.
  - La `public_key` y el registro del SW se cargan **al montar** el componente. En el `onClick` no hay ningún `await` antes de `Notification.requestPermission()`: Safari puede perder el gesto si se espera algo antes.
  - Pasos:
    1. `Notification.requestPermission()`. Si no da `granted`, termina.
    2. Si ya hay suscripción local (estado `off`), la reutiliza. Si no, `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: public_key })`.
    3. `POST /api/push/subscriptions` con `{ endpoint, keys }` sacados de `subscription.toJSON()`, más `navigator.userAgent`.
    4. Guarda la intención.
  - Si falla el POST y la suscripción la acaba de crear, la deshace (`subscription.unsubscribe()`) para no quedar en un estado que el servidor no conoce.
- `disable()`:
  1. Quita la intención.
  2. `subscription.unsubscribe()` **siempre**, aunque falle la API: mata el endpoint en el navegador, y la fila del servidor se borra sola con el siguiente 410.
  3. `DELETE /api/push/subscriptions` como limpieza. Un fallo se ignora.

  El permiso del navegador sigue concedido: volver a activar no pregunta otra vez.
- `sendTest()` → `POST /api/push/test`. Muestra el resultado:
  - `200`: "Enviada".
  - `410`: resuscribe (como en §5.4) y pide probar de nuevo.
  - `502`: "El servicio de notificaciones la rechazó (403)", con el status.

Errores de la API → toasts en español ("No se pudieron activar las notificaciones").

### 5.3 Interruptor — `components/notifications/PushToggle.jsx`

En `/recordatorios`, una sección compacta sobre las pestañas. Al montarse, lee el estado de **este** dispositivo (§5.2) y lo muestra:

```
┌──────────────────────────────────────────────────────────────────┐
│ 🔔 Avisos en este dispositivo                     [ ●━━ ]  Enviar prueba │
│    Este dispositivo recibe los avisos de tu cuenta                │
└──────────────────────────────────────────────────────────────────┘
```

- Activar vincula el dispositivo a la cuenta, y desactivar lo desvincula. Es la única forma de registrar un dispositivo.
- Muestra el texto del estado de §5.2 cuando no hay interruptor, y el botón **Reactivar** en `lost`.
- No hay lista de dispositivos ni ajustes por tipo de aviso (§7).

### 5.4 Sincronización al abrir la app — `usePushSync()`

Se monta una vez en el layout autenticado y corre una vez por carga de la app (no en cada navegación). Solo actúa si el estado no es `no-sw`, `ios-*`, `unsupported` ni `server-disabled`, y si el permiso es `granted`:

**Nunca vincula un dispositivo a una cuenta que no lo activó en él.** Hace dos cosas:

- Mantiene vivo el dispositivo que esta cuenta ya vinculó a mano, con la intención del usuario actual como prueba.
- Lo desvincula de cualquier otra cuenta (vía `status`).

Como se monta con la sesión iniciada, en cuanto se usa el navegador con otra cuenta, deja de recibir los avisos de la anterior.

1. **Hay suscripción local** → `POST /api/push/subscriptions/status`:
   - `linked: true`: renueva `last_seen_at`. Además compara la clave de la suscripción con la del servidor: `subscription.options.applicationServerKey` es un `ArrayBuffer` y se pasa a base64url antes de comparar. Si el navegador devuelve `null`, se toma como coincidente; si no, se resuscribiría en cada carga. Si **no coincide** (cambiaron las claves): `unsubscribe()` + `subscribe()` con la nueva + `POST /subscriptions`.
   - `linked: false` **con** intención del usuario actual: el servidor la borró (tras un 410, o porque se usó el navegador con otra cuenta). `unsubscribe()` + `subscribe()` + `POST /subscriptions`.
   - `linked: false` **sin** intención: no hace nada más. El estado queda en `off`, y vincular es cosa del usuario.

   Por la intención por usuario, si dos cuentas activaron los avisos en el mismo navegador, el dispositivo sigue a la que lo está usando: al abrir la app con A, `status` lo desvincula de B y la intención de A lo vuelve a vincular a A, y viceversa. Nunca recibe los de las dos a la vez.
2. **No hay suscripción, pero sí intención del usuario actual**: el navegador la soltó (caducidad, revocación o rotación sin evento). Intenta `subscribe()` + `POST /subscriptions`. Si falla (iOS puede exigir un gesto), el estado pasa a `lost` (§5.2).
3. **No hay suscripción ni intención**: no hace nada. Apagar el interruptor es definitivo.

La rotación de endpoints también dispara `pushsubscriptionchange` en el SW, pero desde el SW no se puede llamar a la API porque el JWT vive en `localStorage`. Por eso se resuelve aquí.

### 5.5 Mensajes del SW — `useServiceWorkerMessages()`

En `PushBridge` (`App.jsx`), montado **siempre**, también sin sesión: si se toca una notificación con la app abierta en `/login`, `navigate` lleva a la URL, `ProtectedRoute` manda a `/login` con `state.from` y el login vuelve a la tarjeta. `usePushSync` sí se monta solo con sesión. Escucha `navigator.serviceWorker`:

- `notifications-changed` → `invalidateQueries({ queryKey: notificationKeys.all })`.
- `navigate` → `navigate(url)`.

### 5.6 `/recordatorios?card=<id>` y la redirección a `/login`

`Reminders.jsx` lee `card` de los search params. Si la tarjeta está en Pendientes, hace scroll hasta ella y la resalta igual que `?highlight=` resalta bloques en `NoteEditor`. Después quita el parámetro (`replace: true`). Si ya no está (otro dispositivo la archivó), no hace nada.

Si la sesión caducó, el `?card=` tiene que sobrevivir al login. Hoy se pierde por dos caminos:

- **El interceptor de 401** (`api/client.js`) hace `window.location.href = '/login'`. Pasa a `'/login?next=' + encodeURIComponent(pathname + search)`.
- **`Login.jsx`** solo usa `location.state.from.pathname`. Pasa a usar `pathname + search`, y también `?next=`.

**`next` no puede servir como redirección abierta** (`safeNext(next)` en `utils/`, con test):

- Se acepta solo si empieza por `/` y no por `//` ni por `/\`: los navegadores convierten `\` en `/`, así que `/\evil.com` acaba en `//evil.com`.
- Además, `new URL(next, location.origin).origin === location.origin`.
- Si no pasa, se usa `/`.

El login con Google usa Google Identity Services con `renderButton` y `callback` (popup, sin redirección de página). La página `/login?next=…` sigue cargada cuando vuelve la credencial, así que `next` no se pierde. Si algún día se cambia a `ux_mode: 'redirect'`, `next` tendrá que viajar en `sessionStorage` o en el `state` de OAuth.

### 5.7 Cerrar sesión

**Sin cambios por ahora** (decisión del dueño del proyecto, 2026-11-23). `AuthContext.logout` y el interceptor de 401 quedan como están.

- Tras cerrar sesión, o si la sesión caduca, el dispositivo **sigue vinculado y recibiendo los avisos** de la cuenta.
- Para dejar de recibirlos, se desactiva desde `/recordatorios` con la sesión iniciada.
- Si otra cuenta inicia sesión en el mismo navegador, el dispositivo **deja de recibir los avisos de la anterior** en cuanto se abre la app (§5.4), y la nueva ve `off`. Solo recibe sus avisos si los activa, o si ya los había activado antes en ese navegador.
- Desvincular al cerrar sesión queda en §7. Si se retoma, hay dos cosas a tener en cuenta:
  - Desuscribir en el navegador antes de borrar el token, para no depender de la API.
  - Que el interceptor de 401 nunca llame a `logout()`: el `DELETE` saldría con el token caducado y entraría en bucle.

---

## 6. Plan de implementación

1. Migración `029_migration_push_subscriptions.sql` (tabla y marca de agua); aplicarla en dev.
2. Backend:
   - `web-push` y las variables en `env.js` (opcionales, sin formato ni `.and()`).
   - `clients/webPush.js` (inicialización perezosa y tolerante; tests con una sola clave, formato inválido y subject inválido → desactivado, sin lanzar) y los repositories.
   - `pushMessage.js`, con tests: descarte de las de más de 24 h, tags y fallback, colapso por prioridad, umbral ≤3/>3, símbolos del resumen, recorte y tamaño en el peor caso, TTL por tipo.
   - `push.service.js`, con tests:
     - Marca NULL → `MAX(id)` sin enviar.
     - La marca avanza al id más alto leído en **todos** los caminos: push desactivado, sin suscripciones, todos los envíos con 403, y `buildPushMessages` que lanza.
     - 404/410 borran y el resto no.
     - `notifyNew` nunca lanza.
     - Allowlist, incluido `fcm.googleapis.com.evil.com`.
3. Endpoints `/api/push` (validator con `.truncate()`, controller, routes, mount en `server.js`). `test` espera la respuesta del servicio de push. Tests de `status`: nunca inserta; borra la fila del mismo endpoint de otra cuenta y devuelve `linked: false`; con la fila propia, renueva y devuelve `linked: true`.
4. Job: `try/finally` en `tick()` con `notifyNew()`, y el nivel del log.
5. Frontend: extraer `utils/notificationText.js` de `NotificationCard.jsx`, sin cambios visibles en las tarjetas. `notificationText.test.js` con `node --test` (carga sin `window` y paridad de los cinco tipos con aviso).
6. SW:
   - `injectManifest` con las cuatro opciones migradas y `workbox-*` fijados a `7.4.1`.
   - `src/sw.js`: paridad con el SW actual, más `push` (con `try/catch` global, `renotify` y `timestamp`) y `notificationclick`.
   - Icono de badge.
7. `utils/push.js`, `usePushSubscription` (estados e intención), `PushToggle` en `/recordatorios`, `usePushSync`, `useServiceWorkerMessages`, `?card=`, `?next=` en interceptor y `Login` (con `safeNext` y su test: `//x`, `/\x`, `https://x`). El logout no se toca.
8. Docs:
   - `operations/env-vars.md`: las tres variables y cómo generar las claves.
   - `api/reference.md`, `architecture/database.md` y `architecture/backend.md`.
   - `CLAUDE.md`: mount `/api/push`.
   - README de specs y roadmap.
9. Prod: generar las claves, añadirlas al `.env` de la VPS, aplicar la 029, desplegar y verificar (abajo).

**Depende de**: la task 026 (job de recordatorios activo en prod), cerrada el 2026-11-23.

**Tasks**: el plan está dividido en las tasks 028–032 de [`docs/tasks/in-progress/`](../../tasks/in-progress/):

| Task | Contenido |
|------|-----------|
| 028 | Backend de suscripciones y API |
| 029 | Envío desde el job |
| 030 | Service worker |
| 031 | UI en `/recordatorios` |
| 032 | Prod y docs |

La 030 puede ir en paralelo con la 028 y la 029.

**Esfuerzo estimado**: 2–3 días.

### Verificación

- **Dev en escritorio**:
  - `localhost` cuenta como contexto seguro, así que el push funciona sin HTTPS.
  - El SW solo existe en el build: `npm run build && npm run preview`, o `devOptions.enabled: true`. Sin SW, el interruptor muestra `no-sw` y no se cuelga.
  - Con `REMINDERS_TICK_MINUTES=1` y un recordatorio por fecha a 2 minutos, la notificación llega con la pestaña cerrada.
- **Reemplazo con sonido**: una alerta con cercanía; dejar su notificación visible, mover el nivel para que toque en el siguiente tick → la notificación se reemplaza y vuelve a sonar o vibrar. Repetir en el iPhone para ver qué hace Safari.
- **Agrupación**: insertar a mano 5 recordatorios por fecha vencidos → un único resumen "5 recordatorios nuevos". Un segundo lote → un segundo resumen apilado, no reemplazado.
- **Reinicio**: matar el backend justo después de que un tick cree tarjetas (o insertarlas a mano con el job parado) → el siguiente tick las avisa.
- **Mensaje desconocido**: enviar a mano un push con `type: 'foo'` → se ve el aviso genérico.
- **Limpieza**: suscribir, ejecutar `(await (await navigator.serviceWorker.ready).pushManager.getSubscription()).unsubscribe()` en la consola y forzar un tick o "Enviar prueba" → 410 y la fila desaparece. Es más determinista que borrar los datos del sitio.
- **Suscripción perdida**: con la intención guardada, desuscribir desde la consola y recargar → `usePushSync` resuscribe sola.
- **Vinculación manual**:
  - Con la cuenta A vinculada, cerrar sesión **sin** entrar con otra → siguen llegando los avisos de A.
  - Entrar con B → B ve `off`, y una tarjeta nueva de A ya no llega a este dispositivo.
  - B activa → recibe los de B.
  - Volver a entrar con A → el dispositivo vuelve a A (A tenía la intención guardada) y deja de recibir los de B.
  - Una cuenta que nunca activó los avisos en ese navegador no los recibe nunca.
- **Paridad del SW**: tras el cambio a `injectManifest`, la app sigue instalándose, abre offline con el shell, y un deploy nuevo se aplica solo (autoUpdate).
- **Sesión caducada**: tocar una notificación con el JWT caducado → login → aterriza en `/recordatorios?card=<id>` con la tarjeta resaltada.
- **Móvil**: requiere HTTPS, así que se prueba en prod (o con un túnel). En iPhone:
  - Confirmar `display: 'standalone'` en el manifest servido.
  - Instalar → activar → "Enviar prueba".
  - Tocar una notificación **con la app cerrada** y **con la app en segundo plano**. Ahí están las rarezas de iOS, y la prueba no las cubre.
  - En iPad, Safari sin instalar muestra `ios-install`.
- `npm test`, `npm run lint` y `npm run build` limpios en backend y frontend.

---

## 7. Fuera de alcance (posibles extensiones)

- **Preferencias por tipo** de aviso (p. ej. sin push de cercanía) y **horas de silencio** propias: requieren una tabla de preferencias por usuario.
- **Lista de dispositivos** vinculados, con la opción de desactivar uno remoto.
- **Desvincular al cerrar sesión** (ver §5.7).
- **Replantear las invalidaciones**: crear un recordatorio "de invalidación" no termina de tener sentido. Cuando se rediseñe esa parte de la spec de recordatorios, revisar si alguna tarjeta resultante debe generar aviso (hoy la invalidación está fuera de `PUSH_TYPES`).
- **Badge en el icono de la app** (`navigator.setAppBadge`) con el número de tarjetas abiertas: lo admiten iOS 16.4+ y Chrome de escritorio.
- **Acciones en la notificación** ("Archivar" sin abrir la app): el SW no tiene el JWT, haría falta un token de acción firmado por tarjeta. Además iOS no muestra botones de acción.
- **Push para otras features** (TODOs con fecha, por ejemplo): `notifyNew` es específico de las tarjetas, pero el cliente, la tabla y la UI de activación sirven tal cual. Si esas tarjetas se crean fuera del job, revisar el invariante de la marca de agua (§3.4).
- **Reintentos por mensaje** ante 5xx del servicio de push: solo si se ven en los logs.
- Telegram u otros canales externos.

---

## 8. Valores por defecto revisables

- Umbral de agrupación: **más de 3** mensajes por usuario y tick → resumen, con hasta **3 símbolos**.
- Tipos con aviso: todos menos `price_alert_invalidation`.
- Prioridad al colapsar: toque > deslistado > cercanía > fecha límite.
- Antigüedad máxima para avisar: **24 h** desde `created_at`.
- TTL en el servicio de push: **4 h** para cercanía, **24 h** para el resto.
- Recorte de `message` y `note_title`: **200** caracteres.
- Urgencia: **`high`** en todos los tipos.
- Timeout de cada envío: **10 s**.
- Hosts de la allowlist (§3.7).

---

## 9. Cambios respecto a la primera versión

Tras la revisión del 2026-11-23:

- **Qué avisar**: de "las funciones del job devuelven las tarjetas" a una **marca de agua** (`push_notified_id`). No cambia ninguna firma, cubre cualquier ruta que cree tarjetas y no pierde avisos si el proceso se reinicia entre el commit y el envío. Hoy todas las tarjetas se crean dentro del job; el invariante está documentado en §3.4.
- **Mensaje**: lleva `tag` (calculado con `price_alert_id`/`date_reminder_id`, que el payload no trae) y `created_at`. Se colapsa por tag con prioridad antes del umbral. `message` y `note_title` se recortan a 200 caracteres. TTL por tipo; se elimina `PUSH_TTL_SECONDS`.
- **Resumen**: sin tag (se apilan en vez de esconderse) y con los primeros símbolos.
- **SW**:
  - `renotify: true` en los reemplazos.
  - `try/catch` alrededor de todo el armado, con aviso genérico también para tipos desconocidos.
  - `matchAll` con `includeUncontrolled`.
  - Migración explícita de las opciones de `workbox`, versiones fijadas y regla de imports sin `window`, con test en Node.
- **Claves VAPID**: formato comprobado en el cliente, no en `env.js`. Una clave inválida desactiva el push y no tumba el arranque.
- **`POST /test`**: espera el resultado y lo devuelve (410 → resuscribir, 502 con el status).
- **Frontend**:
  - Intención guardada y estado `lost`.
  - Comparación de la clave como `ArrayBuffer`.
  - Estados `no-sw` e `ios-update`, y detección del iPad.
  - Sin `await` antes de `requestPermission`.
  - El logout desuscribe localmente y cierra las notificaciones visibles.
  - `?card=` sobrevive al login (`?next=`).
Segunda ronda (mismo día):

- **Reglas de la marca de agua** (§3.4):
  - Se siembra en la migración.
  - Avanza en el `finally` en todos los caminos, hasta el id más alto leído.
  - Se guarda después de enviar.
  - Corre bajo el lock.
  - Invariante precisado: ninguna transacción de tarjetas abierta cuando corre la consulta.
- **VAPID**: también la regla "las dos claves o ninguna" pasa de `env.js` a `webPush.js`. El log del push desactivado es `error` en prod.
- **`safeNext`**: rechaza `/\` y comprueba el origin.
- **Resumen sin cabecera `Topic`**, explícito.
- **Colapso**: se mantiene cercanía > fecha límite. La revisión proponía lo contrario porque daba por hecho que la alerta deja de estar armada al vencer, pero sigue activa (solo se borra `deadline_at`).
- **Encontrado de paso**: la fecha límite se evalúa antes de recuperar las velas. Es un bug de la feature de recordatorios, no del push, y está registrado aparte (enlace en §3.3).

Tercera ronda (decisiones del dueño del proyecto, 2026-11-23):

- **Vinculación manual**: los dispositivos se registran solo desde la sección "Avisos en este dispositivo" de `/recordatorios`. Esa sección lee del servidor si este dispositivo está vinculado a la cuenta (endpoint nuevo `POST /subscriptions/status`, estado nuevo `other-account`). La sincronización al abrir la app ya no reasigna dispositivos: solo renueva los que la cuenta vinculó a mano. La intención pasa a guardarse por usuario.
- **Cerrar sesión no se toca**: el dispositivo sigue recibiendo avisos. Se retira lo de desuscribir y cerrar las notificaciones visibles al hacer logout; queda en §7.
- **Tabla de los seis tipos de tarjeta** en §1.

Cuarta ronda (decisiones del dueño del proyecto, 2026-11-23):

- **La tesis invalidada no genera push** (filtro `PUSH_TYPES` en §3.3). Las invalidaciones se replantearán más adelante (§7).
- **Un dispositivo, una cuenta**: un dispositivo nunca recibe avisos de otra cuenta. `status` (ahora `checkIn` en el repository) desvincula el dispositivo de cualquier otra cuenta al abrir la app. Se elimina el estado `other-account`. Cada cuenta activa sus avisos por separado.

Implementación (2026-11-23, tasks 028–031):

- **Probado de punta a punta** con un Chrome headless contra una BD temporal: una tarjeta insertada en `notifications` → `notifyNew` → FCM → SW → notificación con titular, tag, URL y cuerpo correctos, y la campana se refresca. También: vinculación con dos cuentas, desactivar, resuscripción sola, `lost`, `?card=`, `?next=`, `/api` fuera del SW, shell offline, y el paso de un dispositivo con el SW viejo (`generateSW`) al nuevo.
- **FCM puede responder 410 justo después de suscribir** ("push subscription has unsubscribed or expired") y 201 unos segundos después. Visto con perfiles de Chrome recién creados en headless. Al job no le afecta (envía minutos u horas después de vincular), pero "Enviar prueba" pulsado al momento puede caer en esa ventana: el frontend resuscribe y pide probar de nuevo. Verificarlo en dispositivos reales (§6, task 032).
- `DELETE /api/push/subscriptions` responde `200` como el resto de la API, no `204`.
- Variables VAPID: sin cambios en `docker-compose.yml` (dev lee `backend/.env`) y con `.allow('')`.
- `no-sw` en el build espera al SW activo (§5.2); `lost` tiene también "Desactivar"; estados `loading` y `error`.
- `useServiceWorkerMessages` se monta también sin sesión (§5.5).
- El `errorHandler` pasa `details` de cualquier `AppError` (lo necesita `PUSH_REJECTED`).
- `PushGoneError` conserva el cuerpo de la respuesta del servicio de push para el log.

Puntos de la primera revisión que no aplican al código actual, anotados para que no se reintroduzcan:
  - `expirationTime` no da 400: el middleware valida con `stripUnknown: true`.
  - El interceptor de 401 no llama a `logout()`, así que no hay bucle. Queda como regla en §5.7.
  - Cercanía y toque de la misma alerta no salen en el mismo tick. La colisión real es fecha límite + toque o cercanía, y el colapso por tag la cubre igual.
