import { describe } from './notificationText.js';

/**
 * Título y opciones de `showNotification` para un mensaje push del backend
 * (services/pushMessage.js). Lo usa el service worker (src/sw.js): nada de
 * `window`, `document` ni `localStorage` al cargarse.
 *
 * Nunca lanza: ante cualquier cosa que no entienda (JSON roto, otra versión, un
 * tipo nuevo que este SW todavía no conoce) devuelve un aviso genérico. Un push
 * sin notificación hace que iOS revoque la suscripción.
 */

export const REMINDERS_URL = '/recordatorios';
const ICON = '/pwa-192x192.png';
const BADGE = '/pwa-badge-96.png';

export const cardUrl = (id) => `${REMINDERS_URL}?card=${encodeURIComponent(id)}`;

const baseOptions = (createdAt) => {
  const timestamp = Date.parse(createdAt);
  // La hora de la tarjeta, no la de llegada: importa si el aviso llega horas tarde
  return { icon: ICON, badge: BADGE, lang: 'es', ...(Number.isFinite(timestamp) ? { timestamp } : {}) };
};

export const genericNotification = () => ({
  title: 'Tienes recordatorios nuevos',
  options: { ...baseOptions(), body: 'Ábrelos en Recordatorios', data: { url: REMINDERS_URL } },
});

const listSymbols = (symbols, count) => {
  const rest = count - symbols.length;
  if (rest > 0) return `${symbols.join(', ')} y ${rest} más`;
  if (symbols.length === 1) return symbols[0];
  return `${symbols.slice(0, -1).join(', ')} y ${symbols.at(-1)}`;
};

const cardNotification = (message) => {
  const { headline, detail } = describe({ type: message.type, payload: message.payload });
  const noteTitle = message.payload?.note_title;
  const tag = message.tag || undefined;
  return {
    title: headline,
    options: {
      ...baseOptions(message.created_at),
      body: [detail, noteTitle ? `📝 ${noteTitle}` : null].filter(Boolean).join('\n'),
      // Una nueva de la misma alerta reemplaza a la anterior y vuelve a sonar
      // (renotify solo es válido con tag)
      ...(tag ? { tag, renotify: true } : {}),
      data: { url: cardUrl(message.id) },
    },
  };
};

// Sin tag: dos resúmenes seguidos se apilan en vez de esconderse
const summaryNotification = (message) => {
  const count = Number(message.count);
  if (!Number.isInteger(count) || count < 1) throw new Error('Resumen sin count');
  const symbols = Array.isArray(message.symbols) ? message.symbols.filter(Boolean) : [];
  return {
    title: `${count} recordatorios nuevos`,
    options: {
      ...baseOptions(message.created_at),
      body: symbols.length > 0 ? listSymbols(symbols, count) : 'Ábrelos en Recordatorios',
      data: { url: REMINDERS_URL },
    },
  };
};

const testNotification = (message) => ({
  title: 'Notificaciones activadas',
  options: {
    ...baseOptions(message.created_at),
    body: 'Así se verán los avisos en este dispositivo',
    data: { url: REMINDERS_URL },
  },
});

const BUILDERS = { card: cardNotification, summary: summaryNotification, test: testNotification };

/**
 * @param {string|null} text el cuerpo del push (`event.data.text()`)
 * @returns {{ title: string, options: NotificationOptions }}
 */
export const buildPushNotification = (text) => {
  try {
    const message = JSON.parse(text);
    if (message?.v !== 1) throw new Error('Versión de mensaje desconocida');
    const build = Object.hasOwn(BUILDERS, message.kind) ? BUILDERS[message.kind] : null;
    if (!build) throw new Error(`Mensaje desconocido: ${message.kind}`);
    return build(message);
  } catch {
    return genericNotification();
  }
};
