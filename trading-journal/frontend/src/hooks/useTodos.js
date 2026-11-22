import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints.js';
import { applyOptimisticBlockMove } from '../utils/treeManipulation.js';
import { noteKeys } from './useNotes.js';

export const todoKeys = {
  all: ['todos'],
  lists: () => [...todoKeys.all, 'lists'],
  items: (listId) => [...todoKeys.all, 'items', listId],
};

// ============================================================
// LISTAS
// ============================================================

export const useTodoLists = () =>
  useQuery({
    queryKey: todoKeys.lists(),
    queryFn: () => api.getTodoLists(),
    select: (response) => response.data,
  });

export const useCreateTodoList = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name) => api.createTodoList({ name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: todoKeys.lists() }),
  });
};

export const useUpdateTodoList = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, name }) => api.updateTodoList(listId, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: todoKeys.lists() }),
  });
};

export const useDeleteTodoList = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (listId) => api.deleteTodoList(listId),
    onSuccess: (_, listId) => {
      // Sacarla ya de la caché: la página redirige a otra lista sin esperar el refetch.
      qc.setQueryData(todoKeys.lists(), (old) =>
        old?.data ? { ...old, data: old.data.filter((l) => l.id !== listId) } : old
      );
      qc.removeQueries({ queryKey: todoKeys.items(listId) });
      qc.invalidateQueries({ queryKey: todoKeys.lists() });
    },
  });
};

// ============================================================
// ITEMS
// ============================================================

export const useTodoItems = (listId) =>
  useQuery({
    queryKey: todoKeys.items(listId),
    queryFn: () => api.getTodoItems(listId),
    enabled: !!listId,
    select: (response) => response.data,
  });

// Actualiza un item en la caché de su lista (forma { data: [...] } de la API).
const patchCachedItem = (qc, listId, itemId, patch) =>
  qc.setQueryData(todoKeys.items(listId), (old) => {
    if (!old?.data) return old;
    return { ...old, data: old.data.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) };
  });

export const useCreateTodoItem = (listId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title) => api.createTodoItem(listId, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: todoKeys.items(listId) });
      qc.invalidateQueries({ queryKey: todoKeys.lists() });
    },
  });
};

export const useUpdateTodoItem = (listId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, title, completed }) => api.updateTodoItem(itemId, { title, completed }),
    // Optimista: marcar/desmarcar o renombrar se refleja al instante.
    onMutate: async ({ itemId, title, completed }) => {
      await qc.cancelQueries({ queryKey: todoKeys.items(listId) });
      const previous = qc.getQueryData(todoKeys.items(listId));
      patchCachedItem(qc, listId, itemId, {
        ...(title !== undefined && { title }),
        ...(completed !== undefined && { completed_at: completed ? new Date().toISOString() : null }),
      });
      return { previous };
    },
    onError: (_, __, context) => {
      if (context?.previous) qc.setQueryData(todoKeys.items(listId), context.previous);
    },
    onSettled: (_, __, { completed }) => {
      qc.invalidateQueries({ queryKey: todoKeys.items(listId) });
      if (completed !== undefined) qc.invalidateQueries({ queryKey: todoKeys.lists() });
    },
  });
};

export const useMoveTodoItem = (listId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, targetId, dropType }) => api.moveTodoItem(itemId, { targetId, dropType }),
    onMutate: async ({ itemId, targetId, dropType }) => {
      await qc.cancelQueries({ queryKey: todoKeys.items(listId) });
      const previous = qc.getQueryData(todoKeys.items(listId));
      qc.setQueryData(todoKeys.items(listId), (old) => {
        if (!old?.data) return old;
        return { ...old, data: applyOptimisticBlockMove(old.data, itemId, targetId, dropType) };
      });
      return { previous };
    },
    onError: (_, __, context) => {
      if (context?.previous) qc.setQueryData(todoKeys.items(listId), context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: todoKeys.items(listId) }),
  });
};

export const useDeleteTodoItem = (listId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId }) => api.deleteTodoItem(itemId),
    onSuccess: (_, { noteId }) => {
      qc.removeQueries({ queryKey: noteKeys.detail(noteId) });
      qc.invalidateQueries({ queryKey: todoKeys.items(listId) });
      qc.invalidateQueries({ queryKey: todoKeys.lists() });
    },
  });
};
