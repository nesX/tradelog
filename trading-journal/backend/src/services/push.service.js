import * as webPush from '../clients/webPush.js';
import * as subscriptionRepo from '../repositories/pushSubscription.repository.js';
import * as notificationRepo from '../repositories/notification.repository.js';
import * as jobStateRepo from '../repositories/reminderJobState.repository.js';
import { AppError, NotFoundError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { buildPushMessages, ttlFor, topicFor } from './pushMessage.js';

// Notificaciones push de los recordatorios: vinculación de dispositivos desde
// /recordatorios ("Avisos en este dispositivo") y envío de avisos.
// Spec: docs/features/specs/notificaciones-push-pwa.md (§3.4).

// Servicios de push admitidos (SSRF: el backend hace un POST a la URL que manda el
// cliente). Se compara el hostname, nunca un regex sobre la URL entera.
const ALLOWED_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com'];
const ALLOWED_HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com'];

const TEST_TTL_SECONDS = 5 * 60; // una prueba que llega horas después confunde

const pushDisabled = () =>
  new AppError('Las notificaciones push no están configuradas en el servidor', 409, 'PUSH_DISABLED');

export const isAllowedEndpoint = (endpoint) => {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '') return false;
  return ALLOWED_HOSTS.includes(url.hostname) || ALLOWED_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
};

const assertAllowedEndpoint = (endpoint) => {
  if (isAllowedEndpoint(endpoint)) return;
  // Con el host, para detectar navegadores legítimos que falten en la lista
  logger.warn(`Push: endpoint rechazado (host ${webPush.endpointHost(endpoint)})`);
  throw new AppError('Servicio de notificaciones no soportado', 400, 'PUSH_ENDPOINT_NOT_ALLOWED');
};

export const getConfig = () => ({ enabled: webPush.isEnabled(), public_key: webPush.getPublicKey() });

/** Vincula este dispositivo a la cuenta (acción manual del usuario). */
export const link = async (userId, { endpoint, keys, user_agent: userAgent = null }) => {
  if (!webPush.isEnabled()) throw pushDisabled();
  assertAllowedEndpoint(endpoint);
  await subscriptionRepo.link({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent });
};

/**
 * Comprobación al abrir la app: ¿este dispositivo está vinculado a la cuenta?
 * Si lo estaba a otra, la desvincula (un dispositivo nunca recibe avisos de una
 * cuenta distinta a la que lo usa). Nunca vincula.
 */
export const status = async (userId, { endpoint, keys, user_agent: userAgent = null }) => {
  const { linked, unlinkedUserIds } = await subscriptionRepo.checkIn({
    userId,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent,
  });
  if (unlinkedUserIds.length > 0) {
    logger.info(
      `Push: dispositivo desvinculado de la cuenta ${unlinkedUserIds.join(', ')} al usarse con la cuenta ${userId}`
    );
  }
  return { linked };
};

export const unlink = async (userId, endpoint) => {
  await subscriptionRepo.deleteByEndpoint(userId, endpoint);
};

/**
 * Envía una notificación de prueba a este dispositivo y espera la respuesta del
 * servicio de push: es la única herramienta de diagnóstico en el iPhone.
 */
export const sendTest = async (userId, endpoint) => {
  if (!webPush.isEnabled()) throw pushDisabled();
  const subscription = await subscriptionRepo.findByEndpoint(userId, endpoint);
  if (!subscription) throw new NotFoundError('Este dispositivo no está vinculado a tu cuenta');

  const message = { v: 1, kind: 'test', created_at: new Date().toISOString() };
  try {
    await webPush.send(subscription, message, { ttl: TEST_TTL_SECONDS, topic: null });
  } catch (err) {
    const host = webPush.endpointHost(endpoint);
    if (err instanceof webPush.PushGoneError) {
      logger.info(`Push: prueba hacia ${host}: ${err.message}; se borra la suscripción`);
      await subscriptionRepo.deleteByEndpoint(userId, endpoint);
      throw new AppError('Este dispositivo ya no está suscrito', 410, 'PUSH_SUBSCRIPTION_GONE');
    }
    if (err instanceof webPush.PushRejectedError) {
      logger.warn(`Push: prueba rechazada por ${host}: ${err.message}`);
      const rejected = new AppError(
        `El servicio de notificaciones rechazó el mensaje (${err.status})`,
        502,
        'PUSH_REJECTED'
      );
      rejected.details = { status: err.status };
      throw rejected;
    }
    logger.warn(`Push: falló la prueba hacia ${host}: ${err.message}`);
    throw new AppError('No se pudo enviar la notificación de prueba', 502, 'PUSH_SEND_FAILED');
  }
  return { delivered: true };
};

// ---------- Avisos de las tarjetas nuevas (lo llama el job) ----------

const NOTHING_SENT = Object.freeze({ sent: 0, failed: 0, removed: 0 });

/** Envía cada mensaje a cada dispositivo de su usuario y limpia los que ya no existen. */
const sendAll = async (cards) => {
  const messagesByUser = buildPushMessages(cards);
  if (messagesByUser.size === 0) return { ...NOTHING_SENT };
  const subscriptions = await subscriptionRepo.findByUserIds([...messagesByUser.keys()]);

  const deliveries = subscriptions.flatMap((subscription) =>
    (messagesByUser.get(subscription.user_id) ?? []).map((message) => ({ subscription, message }))
  );
  const results = await Promise.allSettled(
    deliveries.map(({ subscription, message }) =>
      webPush.send(subscription, message, { ttl: ttlFor(message), topic: topicFor(message) })
    )
  );

  let sent = 0;
  let failed = 0;
  const gone = new Set();
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      sent += 1;
      return;
    }
    const { endpoint } = deliveries[i].subscription;
    const err = result.reason;
    if (err instanceof webPush.PushGoneError) {
      gone.add(endpoint);
      return;
    }
    failed += 1;
    logger.warn(`Push: envío fallido a ${webPush.endpointHost(endpoint)}: ${err.message}`);
  });

  let removed = 0;
  if (gone.size > 0) {
    try {
      removed = await subscriptionRepo.deleteByEndpoints([...gone]);
    } catch (err) {
      logger.error(`Push: no se pudieron borrar ${gone.size} suscripciones caducadas: ${err.message}`);
    }
  }
  return { sent, failed, removed };
};

/**
 * Avisa por push de las tarjetas creadas desde la última vez (marca de agua en
 * reminder_job_state.push_notified_id). Lo llama el job al final de cada tick y
 * nunca lanza: un push no puede romper un tick.
 *
 * Reglas de la marca (§3.4 de la spec):
 *   - Avanza siempre que se leyeron filas, pase lo que pase después (push
 *     desactivado, sin suscripciones, envíos fallidos, un payload raro): por eso
 *     el UPDATE va en el finally. Si no, el día que se configuren las claves
 *     saldría todo lo acumulado, o cada tick reenviaría lo mismo.
 *   - La nueva marca es el id más alto de las filas leídas, nunca un MAX(id)
 *     consultado después: se saltaría una tarjeta creada entre medias.
 *   - Se guarda después de enviar: si el proceso se cae a mitad, el siguiente
 *     tick repite esos avisos (suenan dos veces) en vez de perderlos.
 *
 * Invariante: cuando corre findCreatedAfter no puede quedar ninguna transacción
 * que inserte tarjetas sin terminar. Una con un id menor que hiciera commit
 * después quedaría por debajo de la marca y no se avisaría nunca. Hoy se cumple:
 * las tarjetas solo se crean dentro del job, el tick es secuencial y esto corre
 * al final, con el advisory lock tomado. Si se crean tarjetas fuera del job o se
 * paraleliza el tick, revisar este mecanismo antes.
 */
export const notifyNew = async () => {
  let cards = [];
  try {
    const mark = (await jobStateRepo.get())?.push_notified_id;
    if (mark == null) {
      // Red de seguridad: la migración 029 ya la siembra. Nunca avisar del histórico.
      await jobStateRepo.setPushNotifiedId(await notificationRepo.maxId());
      return { ...NOTHING_SENT };
    }
    cards = await notificationRepo.findCreatedAfter(mark);
    if (cards.length === 0 || !webPush.isEnabled()) return { ...NOTHING_SENT };
    return await sendAll(cards);
  } catch (err) {
    logger.error(`Push: falló el envío de avisos: ${err.message}`);
    return { ...NOTHING_SENT, failed: cards.length };
  } finally {
    if (cards.length > 0) {
      const last = cards[cards.length - 1].id; // el mayor de las filas leídas (ORDER BY id)
      await jobStateRepo
        .setPushNotifiedId(last)
        .catch((err) => logger.error(`Push: no se pudo guardar la marca ${last}: ${err.message}`));
    }
  }
};
