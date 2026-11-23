import webpush from 'web-push';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Cliente de Web Push (protocolo con claves VAPID) sobre la librería `web-push`.
 *
 * El navegador elige su servicio de push (FCM, Apple, Mozilla, WNS) y aquí se le
 * habla directamente. Sin claves VAPID válidas el push queda desactivado y el
 * resto de la app funciona igual: nada de esto puede tumbar el arranque.
 *
 * La configuración se comprueba de forma perezosa, en la primera llamada, y el
 * motivo de un push desactivado se loguea una sola vez. No toca la BD.
 */

const TIMEOUT_MS = 10_000;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const PUBLIC_KEY_LENGTH = 87; // 65 bytes en base64url sin relleno
const PRIVATE_KEY_LENGTH = 43; // 32 bytes
const GONE_STATUSES = [404, 410];
const REJECTED_STATUSES = [400, 401, 403, 413];

/** El dispositivo ya no existe (404/410): hay que borrar la suscripción. */
export class PushGoneError extends Error {
  constructor(status, body) {
    super(
      `El servicio de push respondió ${status}: la suscripción ya no existe${body ? ` (${String(body).slice(0, 200)})` : ''}`
    );
    this.name = 'PushGoneError';
    this.status = status;
  }
}

/** El servicio rechazó el mensaje (claves VAPID distintas, payload demasiado grande…). */
export class PushRejectedError extends Error {
  constructor(status, body) {
    super(`El servicio de push rechazó el mensaje (${status})${body ? `: ${String(body).slice(0, 200)}` : ''}`);
    this.name = 'PushRejectedError';
    this.status = status;
  }
}

let state = null; // { enabled, publicKey }, fijado en la primera llamada

const isValidKey = (key, length) => key.length === length && BASE64URL.test(key);

const isValidSubject = (subject) => {
  try {
    return ['mailto:', 'https:'].includes(new URL(subject).protocol);
  } catch {
    return false;
  }
};

/** Motivo por el que el push queda desactivado, o null si está todo bien. */
const configure = () => {
  const { publicKey, privateKey, subject } = config.push;
  if (!publicKey) return 'falta VAPID_PUBLIC_KEY';
  if (!privateKey) return 'falta VAPID_PRIVATE_KEY';
  if (!isValidKey(publicKey, PUBLIC_KEY_LENGTH)) return 'VAPID_PUBLIC_KEY con formato inválido';
  if (!isValidKey(privateKey, PRIVATE_KEY_LENGTH)) return 'VAPID_PRIVATE_KEY con formato inválido';
  if (!subject) return 'falta VAPID_SUBJECT (o SUPER_ADMIN_EMAIL)';
  if (!isValidSubject(subject)) return 'VAPID_SUBJECT inválido (debe ser mailto: o una URL https)';
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return null;
};

const init = () => {
  if (state) return state;
  let reason;
  try {
    reason = configure();
  } catch (err) {
    reason = `claves VAPID inválidas (${err.message})`;
  }
  state = { enabled: !reason, publicKey: reason ? null : config.push.publicKey };
  if (reason) {
    // En prod no hay otra señal: el interruptor desaparece y los dispositivos
    // vinculados dejan de recibir en silencio. En dev, sin claves es lo normal.
    logger[config.env === 'production' ? 'error' : 'info'](`Web Push desactivado: ${reason}`);
  }
  return state;
};

export const isEnabled = () => init().enabled;

/** Clave pública VAPID para `pushManager.subscribe`, o null si está desactivado. */
export const getPublicKey = () => init().publicKey;

/**
 * Envía un mensaje a una suscripción (`{ endpoint, p256dh, auth }`, la fila de
 * push_subscriptions). El mensaje viaja cifrado como JSON.
 *
 * @param {{ ttl: number, topic?: string|null }} options `ttl` en segundos; con
 *   `topic` el servicio reemplaza el mensaje pendiente del mismo topic si el
 *   dispositivo está offline (null = sin cabecera Topic).
 * @throws {PushGoneError|PushRejectedError} o el error original (red, 5xx, timeout)
 */
export const send = async (subscription, message, { ttl, topic = null }) => {
  if (!isEnabled()) throw new Error('Web Push desactivado');
  const options = { TTL: ttl, urgency: 'high', timeout: TIMEOUT_MS };
  if (topic) options.topic = topic;
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(message),
      options
    );
  } catch (err) {
    if (GONE_STATUSES.includes(err.statusCode)) throw new PushGoneError(err.statusCode, err.body);
    if (REJECTED_STATUSES.includes(err.statusCode)) throw new PushRejectedError(err.statusCode, err.body);
    throw err;
  }
};

/** Host del endpoint, para los logs (el endpoint completo identifica al dispositivo). */
export const endpointHost = (endpoint) => {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return 'endpoint inválido';
  }
};
