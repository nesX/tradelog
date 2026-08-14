import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toggleBlockRevisit } from '../api/endpoints.js';
import { noteKeys } from './useNotes.js';
import { revisitKeys } from './useRevisit.js';

export function useToggleRevisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'toggleRevisit'],
    mutationFn: ({ blockId, markedForRevisit }) => toggleBlockRevisit(blockId, markedForRevisit),
    onSuccess: (response) => {
      const block = response.data;
      qc.invalidateQueries({ queryKey: noteKeys.detail(block.note_id) });
      qc.invalidateQueries({ queryKey: revisitKeys.all });
    },
  });
}
