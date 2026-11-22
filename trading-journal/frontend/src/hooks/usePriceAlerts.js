import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints.js';
import { priceAlertKeys, invalidateReminderQueries } from './reminderKeys.js';

export { priceAlertKeys };

export function usePriceAlerts(status, { enabled = true } = {}) {
  return useQuery({
    queryKey: priceAlertKeys.list(status),
    queryFn: () => api.getPriceAlerts(status ? { status } : {}),
    select: (response) => response.data,
    enabled,
  });
}

// Crear y editar muestran el error dentro del modal (silenceError evita el toast global)
export function useCreatePriceAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.createPriceAlert(data),
    meta: { silenceError: true },
    onSuccess: () => invalidateReminderQueries(qc),
  });
}

export function useUpdatePriceAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.updatePriceAlert(id, data),
    meta: { silenceError: true },
    onSuccess: () => invalidateReminderQueries(qc),
  });
}

export function useDeletePriceAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deletePriceAlert(id),
    onSuccess: () => invalidateReminderQueries(qc),
  });
}
