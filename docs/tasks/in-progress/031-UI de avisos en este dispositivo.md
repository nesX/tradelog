# Task: frontend — "Avisos en este dispositivo" en `/recordatorios`
2026-11-23 · Frontend · Notificaciones push 4/5 · Depende de: 028, 030

Spec: §5.2–§5.6 de
[notificaciones-push-pwa.md](../../features/specs/notificaciones-push-pwa.md).

## Objetivo
Que cada cuenta vincule a mano el dispositivo en el que está y vea si recibe
avisos, que el dispositivo se mantenga vinculado sin intervención y que nunca
reciba avisos de otra cuenta. Tocar un aviso lleva a su tarjeta.

## Alcance

### 1. `api/endpoints.js`
Las cinco llamadas de `/api/push`. El `DELETE` lleva el body en
`apiClient.delete(url, { data })`.

### 2. `utils/push.js` + `hooks/usePushSubscription.js` (§5.2)
- **Estados**, en orden: `no-sw`, `ios-install`, `ios-update`, `unsupported`,
  `server-disabled`, `denied`, `lost`, `off` y `on`.
  - Si el dispositivo está vinculado (`on` / `off`) lo dice
    `POST /subscriptions/status`, no el navegador.
  - La UI **nunca menciona otras cuentas**.
- **Detección**:
  - iPad en Safari: UA `Macintosh` + `navigator.maxTouchPoints > 1`.
  - Nunca usar `Notification` sin comprobar antes `'Notification' in window`.
  - Si `getRegistration()` devuelve `undefined` → `no-sw`, sin esperar a
    `serviceWorker.ready`.
- **Intención por usuario**: `localStorage['tradelog.push.wanted.<userId>']`,
  siempre con `try/catch`.
- **`enable()`**:
  - `public_key` y registro cargados al montar. **Ningún `await` antes de
    `requestPermission()`** en el `onClick`.
  - Si ya hay una suscripción local, la reutiliza.
  - `POST /subscriptions` con `{ endpoint, keys }` y `user_agent`, y guarda la
    intención.
  - Si el POST falla y la suscripción era nueva, la deshace.
- **`disable()`**: quita la intención, hace `unsubscribe()` **siempre** y lanza
  `DELETE`, ignorando si falla.
- **`sendTest()`**: muestra el resultado (200 / 410 → resuscribir / 502 con su
  status).

### 3. `components/notifications/PushToggle.jsx` (§5.3)
En `Reminders.jsx`, sobre las pestañas:
- La sección "Avisos en este dispositivo".
- El texto del estado ("Este dispositivo recibe los avisos de tu cuenta" / "no
  recibe avisos" / el de cada estado de §5.2).
- El interruptor, "Enviar prueba" en `on` y **Reactivar** en `lost`.
- Debe verse bien a 375 px y en modo táctil.

### 4. `usePushSync()` (§5.4) y `useServiceWorkerMessages()` (§5.5)
- Montarlos **una sola vez** con la sesión iniciada. Un componente `PushBridge`
  en `App.jsx`, dentro del router, renderizado solo si `isAuthenticated`. No
  van en `Layout.jsx`: cada ruta tiene su propio `<Layout>`.
- `usePushSync`, una vez por carga:
  - Con suscripción local → `status`:
    - `linked: true`: comparar la clave. El `ArrayBuffer` se pasa a base64url; si
      el navegador devuelve `null`, cuenta como coincidente. Si no coincide,
      resuscribir.
    - `linked: false` con intención → resuscribir y vincular.
    - `linked: false` sin intención → nada.
  - Sin suscripción pero con intención → `subscribe` + `POST`. Si falla → `lost`.
- `useServiceWorkerMessages`:
  - `notifications-changed` → `invalidateQueries({ queryKey: notificationKeys.all })`.
  - `navigate` → `navigate(url)`.

### 5. `/recordatorios?card=<id>` y `?next=` (§5.6)
- `Reminders.jsx`: con `?card=`, scroll a la tarjeta de Pendientes y
  resaltarla (como `?highlight=` en `NoteEditor`). Después quitar el parámetro
  (`replace: true`). Si la tarjeta ya no está, no hacer nada.
- `api/client.js` (interceptor de 401):
  `'/login?next=' + encodeURIComponent(pathname + search)`.
- `Login.jsx`: usar `state.from.pathname + search` y `?next=`, pasados por
  `safeNext`.
- `utils/safeNext.js`:
  - Solo acepta valores que empiezan por `/`, y no por `//` ni por `/\`.
  - El origin tiene que coincidir.
  - Si no pasa, `/`.
  - Con test `node --test`.

### 6. Cerrar sesión
**No se toca** (§5.7). `AuthContext.logout` y el interceptor de 401 quedan
como están, salvo el `?next=`.

## Criterios de aceptación
- En un navegador sin vincular, la sección dice "no recibe avisos". Activar →
  pide permiso → "recibe los avisos de tu cuenta". "Enviar prueba" muestra la
  notificación.
- Desactivar → "no recibe avisos". Recargar no lo reactiva.
- Con la cuenta A vinculada, entrar con B en el mismo navegador:
  - B ve "no recibe avisos".
  - Una tarjeta nueva de A ya no llega a este dispositivo.
  - Si B activa, recibe las suyas.
  - Al volver con A, el dispositivo vuelve a A sin tocar nada (A lo había
    activado) y deja de recibir las de B.
- Desuscribir desde la consola y recargar → se resuscribe solo (intención).
- En `npm run dev` sin SW, la sección muestra `no-sw` y no se cuelga.
- Tocar un aviso con el JWT caducado → login → `/recordatorios?card=<id>` con la
  tarjeta resaltada.
- `safeNext('//evil.com')`, `safeNext('/\\evil.com')` y
  `safeNext('https://evil.com')` → `/`.
- `npm run lint`, `npm test` y `npm run build` limpios.

## Implementación (2026-11-23)
Hecha. Todos los criterios de aceptación verificados en Chrome headless contra el
backend real (salvo el JWT caducado → login con Google, probado con `?next=`).

Desviaciones:
- `useServiceWorkerMessages` se monta siempre en `PushBridge`, también sin
  sesión: así, tocar una notificación con la app en `/login` navega, y el login
  vuelve a la tarjeta. `usePushSync` solo con sesión.
- En el build, el estado espera a que el SW esté **activo** (máximo 10 s): en la
  primera visita `subscribe` fallaba con "no active Service Worker".
- `lost` tiene también "Desactivar" (si no, se quedaría en `lost` para siempre).
- Estados extra `loading` y `error`.
- `safeNext` tampoco devuelve a `/login`.
