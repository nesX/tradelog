import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints.js';

export const systemKeys = {
  all: ['systems'],
  lists: () => [...systemKeys.all, 'list'],
  detail: (id) => [...systemKeys.all, 'detail', id],
};

export const useSystems = () =>
  useQuery({
    queryKey: systemKeys.lists(),
    queryFn: api.getSystems,
    select: (r) => r.data.systems,
    staleTime: 60000,
  });

export const useSystem = (id) =>
  useQuery({
    queryKey: systemKeys.detail(id),
    queryFn: () => api.getSystemById(id),
    enabled: !!id,
    select: (r) => r.data,
  });

export const useCreateSystem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.createSystem(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: systemKeys.lists() }),
  });
};

export const useUpdateSystemName = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }) => api.updateSystemName(id, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: systemKeys.all }),
  });
};

export const useDeleteSystem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteSystem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: systemKeys.lists() }),
  });
};
