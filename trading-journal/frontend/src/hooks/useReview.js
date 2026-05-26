import { useQuery } from '@tanstack/react-query';
import { getBlocksReview } from '../api/endpoints.js';

export const reviewKeys = {
  all: ['review'],
  byParams: (hours, pendingHours) => ['review', hours, pendingHours],
};

export function useReview(hours = 24, pendingHours = null) {
  return useQuery({
    queryKey: reviewKeys.byParams(hours, pendingHours),
    queryFn: () => getBlocksReview(hours, pendingHours),
    select: (response) => response.data,
    staleTime: 30_000,
  });
}
