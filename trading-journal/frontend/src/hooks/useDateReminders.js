import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints.js';
import { dateReminderKeys, invalidateReminderQueries } from './reminderKeys.js';

export { dateReminderKeys };

export function useDateReminders(status, { enabled = true } = {}) {
  return useQuery({
    queryKey: dateReminderKeys.list(status),
    queryFn: () => api.getDateReminders(status ? { status } : {}),
    select: (response) => response.data,
    enabled,
  });
}

export function useCreateDateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.createDateReminder(data),
    meta: { silenceError: true },
    onSuccess: () => invalidateReminderQueries(qc),
  });
}

export function useUpdateDateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.updateDateReminder(id, data),
    meta: { silenceError: true },
    onSuccess: () => invalidateReminderQueries(qc),
  });
}

export function useDeleteDateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteDateReminder(id),
    onSuccess: () => invalidateReminderQueries(qc),
  });
}
