/**
 * Utilidades de las notificaciones push en el navegador (detección, claves e
 * intención guardada). Sin React. Spec: docs/features/specs/notificaciones-push-pwa.md (§5.2).
 *
 * Nunca se usa `Notification` sin comprobar antes `'Notification' in window`:
 * en iOS < 16.4 no existe y lanza ReferenceError.
 */

/** iPhone/iPad. El iPad en Safari se presenta como Mac: se reconoce por la pantalla táctil. */
export const isIos = () => {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
};

/** ¿Abierta como app instalada? (en iOS, requisito para recibir push) */
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

export const hasPushSupport = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const notificationPermission = () => ('Notification' in window ? Notification.permission : 'default');

// ---------- Intención ----------
// "Este usuario activó los avisos en este navegador". Distingue "lo apagué" de "el
// navegador soltó la suscripción", y va por usuario: otra cuenta que inicie sesión
// en el mismo navegador no la hereda. localStorage puede fallar (ventana privada).

const wantedKey = (userId) => `tradelog.push.wanted.${userId}`;

export const getWanted = (userId) => {
  try {
    return userId != null && window.localStorage.getItem(wantedKey(userId)) === '1';
  } catch {
    return false;
  }
};

export const setWanted = (userId, wanted) => {
  try {
    if (wanted) window.localStorage.setItem(wantedKey(userId), '1');
    else window.localStorage.removeItem(wantedKey(userId));
  } catch {
    // sin persistencia: la sincronización al abrir la app no podrá resuscribir sola
  }
};

// ---------- Claves ----------

/** Clave pública VAPID (base64url) → bytes para `pushManager.subscribe`. */
export const base64UrlToUint8Array = (base64Url) => {
  const padded = `${base64Url}${'='.repeat((4 - (base64Url.length % 4)) % 4)}`;
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

export const arrayBufferToBase64Url = (buffer) => {
  let binary = '';
  new Uint8Array(buffer).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * ¿La suscripción se creó con esta clave pública? Si el navegador no expone la
 * clave (`applicationServerKey` null), cuenta como coincidente: si no, se
 * resuscribiría en cada carga.
 */
export const keyMatches = (subscription, publicKey) => {
  const key = subscription.options?.applicationServerKey;
  if (!key) return true;
  return arrayBufferToBase64Url(key) === publicKey;
};

/** Body de /api/push/subscriptions (sin expirationTime). */
export const subscriptionBody = (subscription) => {
  const { endpoint, keys = {} } = subscription.toJSON();
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, user_agent: navigator.userAgent };
};
