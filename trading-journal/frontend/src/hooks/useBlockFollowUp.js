import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toggleBlockFollowUp } from '../api/endpoints.js';
import { noteKeys } from './useNotes.js';
import { reviewKeys } from './useReview.js';

export function useToggleFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ blockId, requiresFollowUp }) => toggleBlockFollowUp(blockId, requiresFollowUp),
    onSuccess: (response) => {
      const block = response.data;
      qc.invalidateQueries({ queryKey: noteKeys.detail(block.note_id) });
      qc.invalidateQueries({ queryKey: reviewKeys.all });
    },
  });
}
