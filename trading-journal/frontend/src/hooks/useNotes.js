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
    mutationFn: (data) => api.createNote(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.tree() }),
  });
};

export const useUpdateNoteTitle = () => {
  const qc = useQueryClient();
  return useMutation({
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
    mutationFn: (id) => api.deleteNote(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.tree() }),
  });
};

export const useMoveNote = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, parent_note_id }) => api.moveNote(id, parent_note_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.tree() }),
  });
};

export const useReorderNotes = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (note_ids) => api.reorderNotes(note_ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.tree() }),
  });
};

export const useCreateBlock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId, data }) => api.createBlock(noteId, data),
    onSuccess: (_, { noteId }) => qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) }),
  });
};

export const useUpdateBlock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ blockId, content, noteId }) => api.updateBlock(blockId, content),
    onSuccess: (_, { noteId }) => {
      if (noteId) qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) });
    },
  });
};

export const useUpdateBlockMetadata = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ blockId, metadata }) => api.updateBlockMetadata(blockId, metadata),
    onSuccess: (_, { noteId }) => {
      if (noteId) qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) });
    },
  });
};

export const useDeleteBlock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ blockId }) => api.deleteBlock(blockId),
    onSuccess: (_, { noteId }) => qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) }),
  });
};

export const useReorderBlocks = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId, block_ids }) => api.reorderBlocks(noteId, block_ids),
    onSuccess: (_, { noteId }) => qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) }),
  });
};

export const useAddImage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ blockId, formData }) => api.addBlockImage(blockId, formData),
    onSuccess: (_, { noteId }) => qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) }),
  });
};

export const useDeleteImage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ imageId }) => api.deleteBlockImage(imageId),
    onSuccess: (_, { noteId }) => qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) }),
  });
};

export const useUpdateImageCaption = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ imageId, caption }) => api.updateImageCaption(imageId, caption),
    onSuccess: (_, { noteId }) => {
      if (noteId) qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) });
    },
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
    mutationFn: (data) => api.createNoteTag(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.tags() }),
  });
};

export const useUpdateTag = () => {
  const qc = useQueryClient();
  return useMutation({
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

export const useRemoveTags = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId, tag_ids }) => api.removeNoteTags(noteId, tag_ids),
    onSuccess: (_, { noteId }) => {
      qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) });
      qc.invalidateQueries({ queryKey: noteKeys.tree() });
    },
  });
};

export const useMoveNoteDnd = () => {
  const qc = useQueryClient();
  return useMutation({
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

export const useMoveBlockDnd = (noteId) => {
  const qc = useQueryClient();
  return useMutation({
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
