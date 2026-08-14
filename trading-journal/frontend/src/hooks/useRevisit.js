import { useQuery } from '@tanstack/react-query';
import { getBlocksRevisit } from '../api/endpoints.js';

export const revisitKeys = {
  all: ['revisit'],
  byParams: (pendingHours) => ['revisit', pendingHours],
};

export function useRevisit(pendingHours = null) {
  return useQuery({
    queryKey: revisitKeys.byParams(pendingHours),
    queryFn: () => getBlocksRevisit(pendingHours),
    select: (response) => response.data,
    staleTime: 30_000,
  });
}
