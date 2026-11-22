import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints.js';
import { notificationKeys, invalidateReminderQueries } from './reminderKeys.js';

export { notificationKeys };

/** Tarjetas abiertas (pestaña Pendientes), las más recientes primero. */
export function useNotifications({ enabled = true } = {}) {
  return useQuery({
    queryKey: notificationKeys.open(),
    queryFn: () => api.getNotifications({ status: 'open' }),
    select: (response) => response.data.items,
    enabled,
  });
}

/** Historial paginado por cursor (`before` = id de la última tarjeta de la página). */
export function useNotificationHistory({ enabled = true } = {}) {
  return useInfiniteQuery({
    queryKey: notificationKeys.history(),
    queryFn: ({ pageParam }) =>
      api.getNotifications({ status: 'resolved', ...(pageParam ? { before: pageParam } : {}) }),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.data.next_before ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.data.items),
    enabled,
  });
}

/**
 * Badge de la campana. Única query de la app que refresca sola: al volver a la
 * pestaña y cada 5 min (contra nuestra API, nunca contra Binance).
 */
export function useNotificationCount({ enabled = true } = {}) {
  return useQuery({
    queryKey: notificationKeys.count(),
    queryFn: api.getNotificationCount,
    select: (response) => response.data.open,
    enabled,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Cerrar una tarjeta. Optimista: sale de Pendientes y el badge baja en el acto.
 * @param vars { id, delete_sibling_alerts? }
 */
export function useResolveNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, delete_sibling_alerts = false }) =>
      api.resolveNotification(id, { resolution: 'dismissed', delete_sibling_alerts }),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: notificationKeys.open() });
      await qc.cancelQueries({ queryKey: notificationKeys.count() });
      const prevOpen = qc.getQueryData(notificationKeys.open());
      const prevCount = qc.getQueryData(notificationKeys.count());
      qc.setQueryData(notificationKeys.open(), (old) =>
        old ? { ...old, data: { ...old.data, items: old.data.items.filter((c) => c.id !== id) } } : old
      );
      qc.setQueryData(notificationKeys.count(), (old) =>
        old ? { ...old, data: { open: Math.max(0, old.data.open - 1) } } : old
      );
      return { prevOpen, prevCount };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevOpen) qc.setQueryData(notificationKeys.open(), ctx.prevOpen);
      if (ctx?.prevCount) qc.setQueryData(notificationKeys.count(), ctx.prevCount);
    },
    onSettled: () => invalidateReminderQueries(qc),
  });
}
