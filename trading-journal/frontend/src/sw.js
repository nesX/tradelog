import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';
import { buildPushNotification, genericNotification, REMINDERS_URL } from './utils/pushNotification.js';

/**
 * Service worker de la PWA (vite-plugin-pwa con `injectManifest`).
 *
 * Todo lo que se importa aquí se ejecuta en el SW: nada de `window`, `document`
 * ni `localStorage` al cargarse. Si el SW nuevo falla al instalarse, los
 * dispositivos se quedan con el frontend viejo del precache y sin más deploys.
 */

// ---------- Lo que hacía el SW generado (generateSW) ----------

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
// SPA: las navegaciones sirven el index.html del precache; /api nunca pasa por aquí
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api/] }));
// registerType: 'autoUpdate' → el SW nuevo toma el control sin esperar
self.skipWaiting();
clientsClaim();

// ---------- Notificaciones push de los recordatorios ----------

const appWindows = () => self.clients.matchAll({ type: 'window', includeUncontrolled: true });

const readText = (event) => {
  try {
    return event.data ? event.data.text() : null;
  } catch {
    return null;
  }
};

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      const { title, options } = buildPushNotification(readText(event));
      try {
        await self.registration.showNotification(title, options);
      } catch {
        // Siempre se muestra una: si iOS recibe un push sin notificación, revoca la suscripción
        const generic = genericNotification();
        await self.registration.showNotification(generic.title, generic.options);
      }
      // La campana y la bandeja se actualizan sin esperar a su refresco
      const windows = await appWindows();
      windows.forEach((client) => client.postMessage({ type: 'notifications-changed' }));
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || REMINDERS_URL;
  event.waitUntil(
    (async () => {
      const [client] = await appWindows();
      if (client) {
        // La app ya está abierta: React Router navega sin recargar
        await client.focus().catch(() => {});
        client.postMessage({ type: 'navigate', url });
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});
