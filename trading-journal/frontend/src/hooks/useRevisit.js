import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { getBlocksRevisit, getTagReviewBlocks } from '../api/endpoints.js';

// Todo lo de Repaso cuelga de ['revisit']: invalidar revisitKeys.all (lo hace
// useToggleRevisit) refresca los marcados y el repaso por tag.
export const revisitKeys = {
  all: ['revisit'],
  byParams: (pendingHours) => ['revisit', pendingHours],
  tags: ['revisit', 'tags'],
  byTags: (tagIds) => ['revisit', 'tags', { tagIds }],
};

export function useRevisit(pendingHours = null) {
  return useQuery({
    queryKey: revisitKeys.byParams(pendingHours),
    queryFn: () => getBlocksRevisit(pendingHours),
    select: (response) => response.data,
    staleTime: 30_000,
  });
}

/**
 * Bloques que cumplen una combinación de tags (OR dentro de un grupo, AND entre
 * grupos): `{ items, total, truncated }`. Sin tags no consulta. Los ids van
 * ordenados para que la key no cambie con el orden de selección.
 */
export function useTagReviewBlocks(tagIds = []) {
  const ids = [...tagIds].sort((a, b) => a - b);
  return useQuery({
    queryKey: revisitKeys.byTags(ids),
    queryFn: () => getTagReviewBlocks(ids),
    enabled: ids.length > 0,
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
