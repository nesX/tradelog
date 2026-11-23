import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { notificationKeys } from './reminderKeys.js';
import { safeNext } from '../utils/safeNext.js';

/**
 * Mensajes del service worker (src/sw.js):
 *   - notifications-changed: llegó un push → la campana y la bandeja se refrescan
 *     sin esperar a su intervalo.
 *   - navigate: se tocó una notificación con la app abierta → React Router navega
 *     sin recargar. Sin sesión, ProtectedRoute lleva a /login y vuelve después.
 */
export function useServiceWorkerMessages() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = (event) => {
      const { type, url } = event.data || {};
      if (type === 'notifications-changed') {
        qc.invalidateQueries({ queryKey: notificationKeys.all });
      } else if (type === 'navigate' && typeof url === 'string') {
        navigate(safeNext(url));
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    navigator.serviceWorker.startMessages?.();
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [qc, navigate]);
}
