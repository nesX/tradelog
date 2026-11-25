import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toggleBlockRevisit } from '../api/endpoints.js';
import { noteKeys } from './useNotes.js';
import { revisitKeys } from './useRevisit.js';

export function useToggleRevisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'toggleRevisit'],
    mutationFn: ({ blockId, markedForRevisit }) => toggleBlockRevisit(blockId, markedForRevisit),
    // Optimistic solo sobre el bloque suelto (visor de repaso), si está en caché;
    // el resto de vistas se refresca al terminar, como antes.
    onMutate: ({ blockId, markedForRevisit }) => {
      const key = noteKeys.block(blockId);
      const previous = qc.getQueryData(key);
      if (previous?.data) {
        qc.setQueryData(key, { ...previous, data: { ...previous.data, marked_for_revisit: markedForRevisit } });
      }
      return { previous };
    },
    onError: (_err, { blockId }, context) => {
      if (context?.previous) qc.setQueryData(noteKeys.block(blockId), context.previous);
    },
    onSuccess: (response) => {
      const block = response.data;
      qc.invalidateQueries({ queryKey: noteKeys.detail(block.note_id) });
      qc.invalidateQueries({ queryKey: revisitKeys.all });
    },
  });
}
