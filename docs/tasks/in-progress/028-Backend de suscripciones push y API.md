# Task: backend — suscripciones Web Push y API `/api/push`
2026-11-23 · Backend · Notificaciones push 1/5 · Depende de: —

Spec: §2, §3.1, §3.2, §3.4 (salvo `notifyNew`), §3.6, §3.7 y §3.8 de
[notificaciones-push-pwa.md](../../features/specs/notificaciones-push-pwa.md).

## Objetivo
La base del canal: la tabla de dispositivos vinculados, el cliente de Web Push y
los endpoints con los que el frontend vincula, comprueba y desvincula **este**
dispositivo. Todavía no se envía ningún aviso de tarjetas (eso es la 029). Se
puede desplegar sola: sin claves VAPID el push queda desactivado y nada cambia.

## Alcance

### 1. Migración `database/029_migration_push_subscriptions.sql`
Tal cual §2: tabla `push_subscriptions` (endpoint `UNIQUE`, `ON DELETE CASCADE`
a `users`) y columna `reminder_job_state.push_notified_id`, **sembrada en
`MAX(id)` de `notifications`** con un `UPDATE … WHERE push_notified_id IS NULL`.
Idempotente. Aplicarla en dev.

### 2. Configuración
- `npm i web-push` (dependencia de producción).
- `config/env.js`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`
  como strings opcionales, **sin formato ni `.and()`**. `env.js` lanza al
  arrancar, y una clave mal pegada no puede tumbar un deploy. Exponerlas en
  `config.push`.
- `backend/.env.example`. Generar un par de claves de dev con
  `npx web-push generate-vapid-keys` y ponerlo en `backend/.env`, que no se
  commitea (el contenedor de dev monta `./backend` y `dotenv` lo lee: no hace
  falta tocar `docker-compose.yml`).

### 3. `src/clients/webPush.js` (§3.1)
- Inicialización perezosa, dentro de un único `try/catch`:
  1. Están las dos claves.
  2. Tienen el formato correcto (base64url, 87 y 43 caracteres).
  3. `setVapidDetails` (valida también el subject; el default es `mailto:` +
     `SUPER_ADMIN_EMAIL`).
- Si algo falla: `isEnabled() === false` y un único log con el motivo: `error`
  en producción, `info` en dev.
- `send(subscription, message, { ttl, topic })` con `urgency: 'high'` y
  `timeout: 10_000`. Si `topic` es `null`, no se manda la cabecera.
- Errores tipados: `PushGoneError` (404/410), `PushRejectedError` (400, 401,
  403 y 413, conservando `status`). El resto se propaga.

### 4. Repositories
- `pushSubscription.repository.js`:
  - `link`: `INSERT … ON CONFLICT (endpoint) DO UPDATE`, que reasigna el endpoint
    a la cuenta actual.
  - `checkIn`: en una transacción, borra la fila del mismo endpoint de **otra**
    cuenta, renueva la propia (claves, `user_agent`, `last_seen_at`) y devuelve
    `linked`. Nunca inserta.
  - `deleteByEndpoint(userId, endpoint)`, `findByEndpoint`, `findByUserIds` y
    `deleteByEndpoints`.
- Todo el SQL parametrizado.

### 5. `src/services/push.service.js` (parte de API)
- `getConfig()`, `link()` (con la allowlist), `status()` (→ `checkIn`; si
  desvinculó otra cuenta, log `info` con los ids de usuario, nunca el endpoint),
  `unlink()` y `sendTest()`.
- `sendTest` **espera** la respuesta del servicio de push: 404/410 → borra la
  fila y lanza el error de "suscripción caducada"; `PushRejectedError` → el de
  "rechazado", con `details.status`; resto → el de "falló el envío".
- Allowlist (§3.7): `new URL(endpoint)` con `protocol === 'https:'` y
  `hostname` exacto (`fcm.googleapis.com`, `updates.push.services.mozilla.com`)
  o con sufijo con punto inicial (`.push.apple.com`, `.notify.windows.com`).
  Nunca un regex sobre la URL entera.
- Errores con subclases de `AppError` (`middleware/errorHandler.js`) y mensajes
  en español. Los códigos y status de la tabla de §3.6 (409 `PUSH_DISABLED`, 400
  `PUSH_ENDPOINT_NOT_ALLOWED`, 410 `PUSH_SUBSCRIPTION_GONE`, 502 `PUSH_REJECTED`
  / `PUSH_SEND_FAILED`) se crean con `new AppError(msg, status, code)` o con
  subclases nuevas en el mismo archivo.

### 6. API — `routes/push.routes.js` en `/api/push`
Patrón de 6 pasos de `docs/development/workflow.md`: validator, controller y
routes, todos con `router.use(authenticate)`. Montaje en `server.js` junto a
`/api/notifications`. Los cinco endpoints de §3.6:

| Endpoint | Qué hace |
|----------|----------|
| `GET /config` | Configuración del push |
| `POST /subscriptions` | Vincular |
| `POST /subscriptions/status` | Comprobar, desvinculando otras cuentas |
| `DELETE /subscriptions` | Desvincular (con body) |
| `POST /test` | Enviar una prueba |

Validator:
- `endpoint`: URI `https` de hasta 2048 caracteres.
- `keys.p256dh` y `keys.auth`: base64url de hasta 256.
- `user_agent`: `.max(300).truncate()`.

## Criterios de aceptación
- Sin claves VAPID, el backend arranca y loguea el motivo, `GET /config` da
  `enabled: false` y `POST /subscriptions` da 409. Con una sola clave o con una
  mal formada, igual: arranca y queda desactivado.
- `POST /subscriptions` con un endpoint `https://fcm.googleapis.com.evil.com/…`
  → 400.
- Vincular con la cuenta A y llamar a `status` con la cuenta B y el mismo
  endpoint → la fila de A desaparece, B recibe `linked: false` y no se crea
  ninguna fila de B.
- `status` con la fila propia → `linked: true` y `last_seen_at` actualizado.
- `DELETE` de la cuenta B nunca borra la fila de A.
- `POST /test` sobre una suscripción caducada → 410 y la fila desaparece.

## Tests (Jest)
- `clients/webPush`: sin claves, una sola, formato inválido y subject inválido
  → desactivado sin lanzar. Traducción de 404/410/403/5xx.
- `push.service`: allowlist (incluido `fcm.googleapis.com.evil.com` y `http:`),
  `status` (propia / ajena / inexistente) y `sendTest` (200, 410, 403, timeout).

## Notas
- Seguir `CLAUDE.md`. **No correr `npm run format`**: solo `npm run lint:fix`.
- **Despliegue**: aplicar la 029 en prod **antes** del push a `main`. Cada push
  despliega, y el job de la 029 (task siguiente) lee `push_notified_id`.

## Implementación (2026-11-23)
Hecha. `web-push` 3.6.7 (la 4.0.0 es una mayor nueva, ESM). 50 tests nuevos
(`clients/__tests__/webPush.test.js`, `services/__tests__/push.service.test.js`).

Verificado contra una BD temporal (Postgres 12 con las migraciones 005–029) y el
servidor real con `curl`: siembra e idempotencia de la 029, vincular, `status`
con dos cuentas (borra la fila de A sin crear la de B), `DELETE` de B no toca la
de A, `user_agent` de 400 caracteres truncado, `expirationTime` descartado, host
`fcm.googleapis.com.evil.com` → 400, sin claves → arranca con "Web Push
desactivado" y responde 409.

Desviaciones:
- Variables VAPID con `.allow('')` y sin tocar `docker-compose.yml` (ver arriba).
- `DELETE` responde 200 (`sendDeleted`), como el resto de la API.
- `errorHandler` pasa `details` de cualquier `AppError` (para `PUSH_REJECTED`).
- `server.js` comprueba las claves al arrancar y loguea "Web Push activado" o el
  motivo de que esté desactivado.
- La 029 **no está aplicada en la BD de dev**: el contenedor `tradelog-db` está
  parado. Aplicarla al levantarlo.
