import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api/endpoints.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../components/common/Toast.jsx';
import {
  isIos,
  isStandalone,
  hasPushSupport,
  notificationPermission,
  getWanted,
  setWanted,
  base64UrlToUint8Array,
  keyMatches,
  subscriptionBody,
} from '../utils/push.js';

/**
 * Avisos push en ESTE dispositivo (§5.2 y §5.4 de la spec de notificaciones push).
 *
 * Vincular es siempre manual (el interruptor de /recordatorios). Al abrir la app,
 * la sincronización solo mantiene vivo el dispositivo que esta cuenta ya vinculó y
 * lo desvincula de cualquier otra: un dispositivo nunca recibe avisos de una cuenta
 * distinta a la que lo está usando.
 */

const READY_TIMEOUT_MS = 10_000;

/**
 * Registro del SW con un worker activo (`subscribe` falla sin él). En dev no hay
 * SW (devOptions desactivado) y no se espera a `ready`, que no resolvería nunca.
 * En el build, en la primera visita el SW puede no estar registrado todavía (se
 * registra en el `load` de la página) o estar instalándose (precache).
 */
const getRegistration = async () => {
  const registration = await navigator.serviceWorker.getRegistration();
  if (registration?.active) return registration;
  if (!registration && import.meta.env.DEV) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((resolve) => setTimeout(() => resolve(null), READY_TIMEOUT_MS)),
  ]);
};

/** Lo que se sabe sin preguntar al servidor: un estado final o el registro del SW. */
const detectDevice = async () => {
  const ios = isIos();
  if (ios && !isStandalone()) return { state: 'ios-install' };
  if (!hasPushSupport()) return { state: ios ? 'ios-update' : 'unsupported' };
  const registration = await getRegistration();
  return registration ? { registration } : { state: 'no-sw' };
};

/** Suscripción nueva (soltando la anterior) vinculada a la cuenta. Si el POST falla, la deshace. */
const resubscribeAndLink = async (registration, publicKey, previous) => {
  if (previous) await previous.unsubscribe().catch(() => {});
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(publicKey),
  });
  try {
    await api.linkPushSubscription(subscriptionBody(subscription));
  } catch (err) {
    await subscription.unsubscribe().catch(() => {});
    throw err;
  }
  return subscription;
};

/** Sincronización al abrir la app (§5.4). Nunca vincula un dispositivo que esta cuenta no activó. */
const syncDevice = async (userId) => {
  const { registration } = await detectDevice();
  if (!registration || notificationPermission() !== 'granted') return;
  const { data: config } = await api.getPushConfig();
  if (!config.enabled) return;
  const wanted = getWanted(userId);
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    // El navegador la soltó (caducidad, revocación…). Si falla, el interruptor muestra "lost".
    if (wanted) await resubscribeAndLink(registration, config.public_key, null);
    return;
  }

  // También desvincula el dispositivo de cualquier otra cuenta
  const { data } = await api.getPushSubscriptionStatus(subscriptionBody(subscription));
  if (data.linked) {
    // Cambiaron las claves VAPID: la suscripción vieja ya no sirve
    if (!keyMatches(subscription, config.public_key)) {
      await resubscribeAndLink(registration, config.public_key, subscription);
    }
  } else if (wanted) {
    // El servidor la borró (un 410, o el navegador se usó con otra cuenta) y este usuario la quiere
    await resubscribeAndLink(registration, config.public_key, subscription);
  }
};

// Una sincronización por carga de la app y por usuario: si otra cuenta inicia
// sesión sin recargar, el dispositivo se desvincula de la anterior en ese momento.
let sync = { userId: null, promise: Promise.resolve() };

const ensureSynced = (userId) => {
  if (userId != null && sync.userId !== userId) {
    sync = { userId, promise: syncDevice(userId).catch(() => {}) };
  }
  return sync.promise;
};

/** Se monta una sola vez para toda la app, con la sesión iniciada (PushBridge en App.jsx). */
export function usePushSync(userId) {
  useEffect(() => {
    ensureSynced(userId);
  }, [userId]);
}

/**
 * Estado de este dispositivo y acciones del interruptor. Estados, del primero
 * que aplica al último: loading, no-sw, ios-install, ios-update, unsupported,
 * server-disabled, denied, lost, off, on (y error si no se pudo comprobar).
 */
export function usePushSubscription() {
  const { user } = useAuth();
  const userId = user?.id;
  const toast = useToast();
  const [state, setState] = useState('loading');
  const [busy, setBusy] = useState(false);
  // Se cargan al montar: en el onClick no puede haber ningún await antes de pedir permiso
  const ctx = useRef({ registration: null, publicKey: null });

  const detect = useCallback(async () => {
    await ensureSynced(userId);
    const device = await detectDevice();
    if (device.state) return device.state;
    ctx.current.registration = device.registration;

    const { data: config } = await api.getPushConfig();
    if (!config.enabled) return 'server-disabled';
    ctx.current.publicKey = config.public_key;

    const permission = notificationPermission();
    if (permission === 'denied') return 'denied';
    const subscription = await device.registration.pushManager.getSubscription();
    if (!subscription) return getWanted(userId) && permission === 'granted' ? 'lost' : 'off';
    // Que el navegador tenga una suscripción no significa que esté vinculada a esta cuenta
    const { data } = await api.getPushSubscriptionStatus(subscriptionBody(subscription));
    return data.linked ? 'on' : 'off';
  }, [userId]);

  const refresh = useCallback(
    () =>
      detect().then(setState, () => {
        setState('error');
      }),
    [detect]
  );

  useEffect(() => {
    if (userId != null) refresh();
  }, [userId, refresh]);

  /** Solo desde el onClick del interruptor (o de Reactivar). */
  const enable = () => {
    if (!('Notification' in window)) return;
    // Ningún await antes: Safari pierde el gesto del usuario si se espera algo
    const permissionRequest = Notification.requestPermission();
    setBusy(true);
    (async () => {
      const permission = await permissionRequest;
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const { registration, publicKey } = ctx.current;
      const existing = await registration.pushManager.getSubscription();
      if (existing && keyMatches(existing, publicKey)) {
        await api.linkPushSubscription(subscriptionBody(existing));
      } else {
        await resubscribeAndLink(registration, publicKey, existing);
      }
      setWanted(userId, true);
      setState('on');
    })()
      .catch(() => toast.error('No se pudieron activar las notificaciones'))
      .finally(() => setBusy(false));
  };

  const disable = async () => {
    setBusy(true);
    setWanted(userId, false);
    try {
      const subscription = await ctx.current.registration?.pushManager.getSubscription();
      if (subscription) {
        const { endpoint } = subscription;
        // Primero en el navegador: aunque falle la API, el endpoint muere y la fila
        // se borra sola con el siguiente 410. El permiso sigue concedido.
        await subscription.unsubscribe().catch(() => {});
        await api.unlinkPushSubscription(endpoint).catch(() => {});
      }
    } finally {
      setState('off');
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const { registration, publicKey } = ctx.current;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        await refresh();
        return;
      }
      try {
        await api.sendPushTest(subscription.endpoint);
        toast.success('Notificación de prueba enviada');
      } catch (err) {
        if (err.code === 'PUSH_SUBSCRIPTION_GONE') {
          await resubscribeAndLink(registration, publicKey, subscription);
          toast.info('Este dispositivo se volvió a suscribir. Envía la prueba de nuevo.');
        } else if (err.code === 'PUSH_REJECTED') {
          toast.error(`El servicio de notificaciones la rechazó (${err.details?.status ?? 'sin código'})`);
        } else if (err.status === 404) {
          toast.error('Este dispositivo ya no está vinculado a tu cuenta');
          await refresh();
        } else {
          toast.error(err.message || 'No se pudo enviar la notificación de prueba');
        }
      }
    } catch {
      toast.error('No se pudo enviar la notificación de prueba');
    } finally {
      setBusy(false);
    }
  };

  return { state, busy, enable, disable, sendTest };
}
