import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import * as api from '../api/endpoints.js';
import { applyOptimisticNoteMoveFlat, applyOptimisticBlockMove } from '../utils/treeManipulation.js';

export const noteKeys = {
  all: ['notes'],
  tree: () => [...noteKeys.all, 'tree'],
  detail: (id) => [...noteKeys.all, 'detail', id],
  tags: () => [...noteKeys.all, 'tags'],
};

// Construye árbol a partir del array plano
const buildTree = (flatNotes) => {
  if (!flatNotes) return [];
  const map = {};
  const roots = [];
  for (const n of flatNotes) {
    map[n.id] = { ...n, children: [] };
  }
  for (const n of flatNotes) {
    if (n.parent_note_id && map[n.parent_note_id]) {
      map[n.parent_note_id].children.push(map[n.id]);
    } else {
      roots.push(map[n.id]);
    }
  }
  return roots;
};

export const useNoteTree = () =>
  useQuery({
    queryKey: noteKeys.tree(),
    queryFn: () => api.getNoteTree(),
    select: (response) => ({
      flat: response.data,
      tree: buildTree(response.data),
    }),
    staleTime: 30000,
  });

export const useNote = (id) =>
  useQuery({
    queryKey: noteKeys.detail(id),
    queryFn: () => api.getNote(id),
    enabled: !!id,
    select: (response) => response.data,
  });

export const useCreateNote = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'createNote'],
    mutationFn: (data) => api.createNote(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.tree() }),
  });
};

export const useUpdateNoteTitle = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'updateNoteTitle'],
    mutationFn: ({ id, title }) => api.updateNoteTitle(id, title),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: noteKeys.tree() });
      qc.invalidateQueries({ queryKey: noteKeys.detail(id) });
    },
  });
};

export const useDeleteNote = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'deleteNote'],
    mutationFn: (id) => api.deleteNote(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.tree() }),
  });
};

export const useRestoreNote = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'restoreNote'],
    mutationFn: (id) => api.restoreNote(id),
    // Refrescar todo el dominio de notas: el árbol (nota + subtree reaparecen) y
    // cualquier detalle abierto (p. ej. un bloque `reference` que apuntaba a una
    // sub-nota restaurada vuelve a resolver su título al invalidarse el detail).
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.all }),
  });
};

export const useMoveNote = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'moveNote'],
    mutationFn: ({ id, parent_note_id }) => api.moveNote(id, parent_note_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.tree() }),
  });
};

export const useCreateBlock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'createBlock'],
    mutationFn: ({ noteId, data }) => api.createBlock(noteId, data),
    onSuccess: (_, { noteId }) => qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) }),
  });
};

export const useUpdateBlock = () => {
  const qc = useQueryClient();
  return useMutation({
    // El autosave tiene su propio feedback inline ("Error al guardar") y conserva
    // el borrador para reintento (ver useAutosaveTextarea), así que se silencia el
    // toast global para no spamear en cada debounce fallido.
    mutationKey: [...noteKeys.all, 'updateBlock'],
    meta: { silenceError: true },
    mutationFn: ({ blockId, content, noteId }) => api.updateBlock(blockId, content),
    onSuccess: (_, { noteId }) => {
      if (noteId) qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) });
    },
  });
};

export const useUpdateBlockMetadata = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'updateBlockMetadata'],
    mutationFn: ({ blockId, metadata }) => api.updateBlockMetadata(blockId, metadata),
    onSuccess: (_, { noteId }) => {
      if (noteId) qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) });
    },
  });
};

export const useDeleteBlock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'deleteBlock'],
    mutationFn: ({ blockId }) => api.deleteBlock(blockId),
    onSuccess: (_, { noteId }) => qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) }),
  });
};

export const useAddImage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'addImage'],
    mutationFn: ({ blockId, formData }) => api.addBlockImage(blockId, formData),
    onSuccess: (_, { noteId }) => qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) }),
  });
};

export const useDeleteImage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'deleteImage'],
    mutationFn: ({ imageId }) => api.deleteBlockImage(imageId),
    onSuccess: (_, { noteId }) => qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) }),
  });
};

export const useNoteTags = () =>
  useQuery({
    queryKey: noteKeys.tags(),
    queryFn: () => api.getNoteTags(),
    select: (response) => response.data,
    staleTime: 60000,
  });

export const useCreateTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'createTag'],
    mutationFn: (data) => api.createNoteTag(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.tags() }),
  });
};

export const useUpdateTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'updateTag'],
    mutationFn: ({ tagId, data }) => api.updateNoteTag(tagId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: noteKeys.tags() });
      qc.invalidateQueries({ queryKey: noteKeys.tree() });
    },
  });
};

export const useDeleteTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'deleteTag'],
    mutationFn: (tagId) => api.deleteNoteTag(tagId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: noteKeys.tags() });
      qc.invalidateQueries({ queryKey: noteKeys.tree() });
    },
  });
};

export const useAssignTags = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'assignTags'],
    mutationFn: ({ noteId, tag_ids }) => api.assignNoteTags(noteId, tag_ids),
    onSuccess: (_, { noteId }) => {
      qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) });
      qc.invalidateQueries({ queryKey: noteKeys.tree() });
    },
  });
};

export const useNoteSearch = ({ q, tagIds, limit, enabled = true }) =>
  useQuery({
    queryKey: [...noteKeys.all, 'search', { q, tagIds, limit }],
    queryFn: () =>
      api.searchNotes({ q, tag_ids: tagIds?.join(',') || undefined, limit }).then((r) => r.data),
    enabled: enabled && (!!q?.trim() || (tagIds?.length ?? 0) > 0),
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });

export const useMoveNoteDnd = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'moveNoteDnd'],
    mutationFn: ({ noteId, targetId, dropType }) =>
      api.moveNoteDnd(noteId, { targetId, dropType }),
    onMutate: async ({ noteId, targetId, dropType }) => {
      await qc.cancelQueries({ queryKey: noteKeys.tree() });
      const previous = qc.getQueryData(noteKeys.tree());
      qc.setQueryData(noteKeys.tree(), (old) => {
        if (!old?.data) return old;
        return { ...old, data: applyOptimisticNoteMoveFlat(old.data, noteId, targetId, dropType) };
      });
      return { previous };
    },
    onError: (_, __, context) => {
      if (context?.previous) qc.setQueryData(noteKeys.tree(), context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: noteKeys.tree() }),
  });
};

export const useAddTradeToBlock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'addTradeToBlock'],
    mutationFn: ({ blockId, tradeId }) => api.addTradeToBlock(blockId, tradeId),
    onSuccess: (_, { noteId }) => {
      if (noteId) qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) });
    },
  });
};

export const useRemoveTradeFromBlock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'removeTradeFromBlock'],
    mutationFn: ({ blockId, tradeId }) => api.removeTradeFromBlock(blockId, tradeId),
    onSuccess: (_, { noteId }) => {
      if (noteId) qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) });
    },
  });
};

// Mover un bloque a OTRA nota. Optimista: el bloque desaparece de la nota origen
// al instante; en error se restaura (y el toast global de mutaciones ya avisa).
export const useMoveBlockToNote = (sourceNoteId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'moveBlockToNote'],
    mutationFn: ({ blockId, targetNoteId }) =>
      api.moveBlockToNote(blockId, { target_note_id: targetNoteId }),
    onMutate: async ({ blockId }) => {
      await qc.cancelQueries({ queryKey: noteKeys.detail(sourceNoteId) });
      const previous = qc.getQueryData(noteKeys.detail(sourceNoteId));
      qc.setQueryData(noteKeys.detail(sourceNoteId), (old) => {
        if (!old?.data?.blocks) return old;
        return {
          ...old,
          data: { ...old.data, blocks: old.data.blocks.filter((b) => b.id !== blockId) },
        };
      });
      return { previous };
    },
    onError: (_, __, context) => {
      if (context?.previous) qc.setQueryData(noteKeys.detail(sourceNoteId), context.previous);
    },
    onSettled: (_, __, { targetNoteId }) => {
      qc.invalidateQueries({ queryKey: noteKeys.detail(sourceNoteId) });
      qc.invalidateQueries({ queryKey: noteKeys.detail(targetNoteId) });
      // El tree muestra block_count por nota, y el caso sub-nota reparenta nodos.
      qc.invalidateQueries({ queryKey: noteKeys.tree() });
    },
  });
};

export const useMoveBlockDnd = (noteId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'moveBlockDnd'],
    mutationFn: ({ blockId, targetBlockId, dropType }) =>
      api.moveBlockDnd(blockId, { targetBlockId, dropType }),
    onMutate: async ({ blockId, targetBlockId, dropType }) => {
      await qc.cancelQueries({ queryKey: noteKeys.detail(noteId) });
      const previous = qc.getQueryData(noteKeys.detail(noteId));
      qc.setQueryData(noteKeys.detail(noteId), (old) => {
        if (!old?.data?.blocks) return old;
        return {
          ...old,
          data: {
            ...old.data,
            blocks: applyOptimisticBlockMove(old.data.blocks, blockId, targetBlockId, dropType),
          },
        };
      });
      return { previous };
    },
    onError: (_, __, context) => {
      if (context?.previous) qc.setQueryData(noteKeys.detail(noteId), context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) }),
  });
};
