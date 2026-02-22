import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints.js';

export const timeframeKeys = {
  all: ['timeframes'],
  lists: () => [...timeframeKeys.all, 'list'],
};

export const useTimeframes = () =>
  useQuery({
    queryKey: timeframeKeys.lists(),
    queryFn: api.getTimeframes,
    select: (r) => r.data.timeframes,
    staleTime: 60000,
  });

export const useCreateTimeframe = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.createTimeframe(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: timeframeKeys.lists() }),
  });
};

export const useDeleteTimeframe = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteTimeframe(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: timeframeKeys.lists() }),
  });
};
