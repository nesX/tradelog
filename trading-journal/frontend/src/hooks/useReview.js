import { useQuery } from '@tanstack/react-query';
import { getBlocksReview } from '../api/endpoints.js';

export const reviewKeys = {
  all: ['review'],
  byHours: (hours) => ['review', hours],
};

export function useReview(hours = 24) {
  return useQuery({
    queryKey: reviewKeys.byHours(hours),
    queryFn: () => getBlocksReview(hours),
    select: (response) => response.data,
    staleTime: 30_000,
  });
}
