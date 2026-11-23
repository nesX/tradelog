# Task: frontend — service worker propio con `push` y `notificationclick`
2026-11-23 · Frontend · Notificaciones push 3/5 · Depende de: — (en paralelo con 028/029)

Spec: §4 y §5.1 de
[notificaciones-push-pwa.md](../../features/specs/notificaciones-push-pwa.md).

## Objetivo
Que la PWA pueda mostrar los avisos: pasar el service worker generado a uno
propio sin perder nada de lo que hace hoy (instalación, shell offline,
autoactualización) y que muestre cada push con el mismo texto que la tarjeta.

**Es la task más delicada**: el SW afecta a todos los dispositivos con la app
instalada. Si el SW nuevo falla al instalarse, esos dispositivos se quedan con
el frontend viejo del precache y dejan de recibir deploys.

## Alcance

### 1. `utils/notificationText.js` (extraído de `NotificationCard.jsx`)
- Mover `describe(card)` con sus helpers (`hourRange`, `utcDay`) y los textos de
  las variantes (`VARIANT_LABELS`), sin React ni lucide.
- `describe` **lanza** con un `type` desconocido. `NotificationCard` lo captura
  y mantiene su comportamiento actual (mostrar el `type` crudo).
- Sin cambios visibles en las tarjetas.
- Regla: nada de `window`, `document` ni `localStorage` **al cargar** ningún
  módulo de la cadena de imports del SW.

### 2. Tests con `node --test` (como los existentes en `src/utils/`)
- `notificationText.test.js` importa el módulo en Node, sin jsdom: si algo de
  la cadena toca `window` al cargar, falla.
- **Paridad**: para los cinco tipos con aviso, `describe()` sobre el payload
  recortado da el mismo `{ headline, detail }` que sobre el completo. El
  recorte se replica a mano en el test con la lista de campos de
  `pushMessage.js` (task 029), y se deja un comentario en los dos sitios.

### 3. `vite.config.js` → `injectManifest`
- `strategies: 'injectManifest'`, `srcDir: 'src'`, `filename: 'sw.js'`.
- Mantener `registerType: 'autoUpdate'` y el `manifest` sin cambios.
- Migrar a mano las cuatro opciones del bloque `workbox` actual, que con
  `injectManifest` se ignoran sin avisar (tabla de §4.1):
  - `globPatterns`.
  - `navigateFallback`.
  - `navigateFallbackDenylist`.
  - `cleanupOutdatedCaches`.
- `devOptions: { enabled: false, type: 'module' }`.
- Dependencias de desarrollo `workbox-precaching`, `workbox-routing` y
  `workbox-core`, **fijadas a `7.4.1`** (la versión de `workbox-build` que trae
  `vite-plugin-pwa`), sin `^`.

### 4. `src/sw.js` (§4.2)
- Paridad con el SW actual:
  - `cleanupOutdatedCaches()` y `precacheAndRoute(self.__WB_MANIFEST)`.
  - `NavigationRoute` a `/index.html` con `denylist: [/^\/api/]`.
  - `self.skipWaiting()` y `clientsClaim()`.
- `push`, todo dentro de `event.waitUntil(...)`:
  1. Construir título y opciones dentro de un **único `try/catch`**. Si algo
     lanza, o llega un `v`, `kind` o `type` desconocido → aviso genérico:
     "Tienes recordatorios nuevos" → `/recordatorios`.
  2. `card` / `summary` / `test`, con los textos de la tabla de §4.2.
  3. `showNotification` con `tag`, `renotify: Boolean(tag)`,
     `timestamp: Date.parse(created_at)`, `data: { url }`, `icon` y `badge`.
     Siempre se muestra una.
  4. `postMessage({ type: 'notifications-changed' })` a las ventanas, vía
     `clients.matchAll({ type: 'window', includeUncontrolled: true })`.
- `notificationclick`:
  1. `close()`.
  2. Si hay una ventana abierta: `focus()` + `postMessage({ type: 'navigate', url })`.
  3. Si no: `clients.openWindow(url)`.
- URL de destino: `/recordatorios?card=<id>` para `card`, `/recordatorios` para
  el resto.

### 5. `public/pwa-badge-96.png`
Silueta monocroma (blanco sobre transparente, 96×96) del logo, para la barra
de estado de Android. Se puede sacar de `public/favicon.svg`.

## Criterios de aceptación
- `npm run build` genera `dist/sw.js` con el precache inyectado.
- Paridad (con `npm run build && npm run preview`):
  - La app se instala.
  - Abre sin conexión con el shell.
  - `/api/*` no lo sirve el SW.
  - Un build nuevo se aplica solo (autoUpdate).
- Un push enviado a mano desde DevTools (Application → Service Workers → Push)
  con `{"v":1,"kind":"card",…}` muestra el titular correcto.
- Con `{"type":"foo"}` o un texto no JSON, se ve el aviso genérico.
- Tocar la notificación con la app abierta navega sin recargar. Con la app
  cerrada, la abre en la URL.
- Las tarjetas de `/recordatorios` se ven igual que antes.
- `npm run lint`, `npm test` y `npm run build` limpios.

## Notas
- La navegación por `postMessage` necesita el listener de la 031. Hasta
  entonces, comprobar solo que el mensaje llega (consola).
- Ojo: el contenedor de dev en `:5179` puede servir
  versiones viejas de archivos editados. Para probar el SW, usar el build con
  `preview`.

## Implementación (2026-11-23)
Hecha. El título y las opciones de cada push los arma `utils/pushNotification.js`
(puro, nunca lanza, con su test); `sw.js` solo lo llama, y si `showNotification`
lanza muestra el genérico. Tests de `node --test`: carga sin `window`, paridad de
los cinco tipos y los mensajes del SW.

Verificado en Chrome headless (Playwright) con `npm run build` + `preview`:
- Push real por FCM y push entregados por CDP (`ServiceWorker.deliverPushMessage`):
  tarjeta, cercanía con tag, resumen sin tag, `type: 'foo'` y texto no JSON →
  genérico.
- `/api/*` no lo sirve el SW; el shell abre sin conexión.
- **Migración de un dispositivo con el SW viejo**: build de `HEAD`
  (`generateSW`) instalado → deploy del nuevo → la primera carga sirve el
  precache viejo, el SW nuevo se instala, y la siguiente carga ya es el build
  nuevo con la caché limpia. Igual que antes del cambio: no recarga sola en el
  momento (`registerSW.js` solo registra).
- No se pudo probar `notificationclick` (headless no permite tocar una
  notificación): queda para la verificación en dispositivos de la 032. El
  mensaje `navigate` sí está probado del lado de la página.
