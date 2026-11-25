import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import * as api from '../api/endpoints.js';
import { applyOptimisticNoteMoveFlat, applyOptimisticBlockMove } from '../utils/treeManipulation.js';
import { sortTags, moveTagGroup, moveTagInGroup } from '../utils/tagGroups.js';
import { revisitKeys } from './useRevisit.js';

export const noteKeys = {
  all: ['notes'],
  tree: () => [...noteKeys.all, 'tree'],
  detail: (id) => [...noteKeys.all, 'detail', id],
  tags: () => [...noteKeys.all, 'tags'],
  // Grupos de tags del usuario, en orden (Libre no viene: son los tags sin grupo).
  tagGroups: () => [...noteKeys.all, 'tag-groups'],
  // Un bloque suelto (visor de repaso), con el mismo shape que en detail.
  block: (id) => [...noteKeys.all, 'block', id],
  // Todas las búsquedas de /buscar (se invalidan juntas al cambiar tags de un bloque).
  search: () => [...noteKeys.all, 'search'],
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

// Un bloque suelto con `tags` y `note: { id, title }`. Sin reintentos: un 404
// ("Este bloque ya no existe") tiene que verse enseguida.
export const noteBlockQuery = (blockId) => ({
  queryKey: noteKeys.block(blockId),
  queryFn: () => api.getNoteBlock(blockId),
  retry: (failureCount, error) => error?.status !== 404 && failureCount < 1,
});

export const useNoteBlock = (blockId) =>
  useQuery({
    ...noteBlockQuery(blockId),
    enabled: !!blockId,
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
    onSuccess: (res, { id }) => {
      qc.invalidateQueries({ queryKey: noteKeys.tree() });
      qc.invalidateQueries({ queryKey: noteKeys.detail(id) });
      // El bloque de la sub-nota en el padre muestra el título vía JOIN
      // (linked_note_title): sin esto, el padre cacheado seguía con el viejo.
      const parentId = res?.data?.parent_note_id;
      if (parentId) qc.invalidateQueries({ queryKey: noteKeys.detail(parentId) });
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
    mutationFn: ({ blockId, content }) => api.updateBlock(blockId, content),
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
    onSuccess: (res, { noteId }) => {
      qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) });
      // Borrar el bloque de una sub-nota borra también la sub-nota (y su subtree):
      // refrescar el árbol (alimenta Recientes y el panel lateral).
      const deletedNoteIds = res?.data?.deleted_note_ids || [];
      if (deletedNoteIds.length > 0) {
        deletedNoteIds.forEach((id) => qc.removeQueries({ queryKey: noteKeys.detail(id) }));
        qc.invalidateQueries({ queryKey: noteKeys.tree() });
      }
    },
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

// Grupos del caché, para ordenar tags en los optimistic (undefined si no cargaron).
export const getCachedTagGroups = (qc) => qc.getQueryData(noteKeys.tagGroups())?.data;

// `silenceError`: el llamador muestra el error en línea (la página de tags) y no
// hace falta el toast global de mutaciones.
const errorMeta = (silenceError) => (silenceError ? { meta: { silenceError: true } } : {});

export const useCreateTag = ({ silenceError = false } = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'createTag'],
    mutationFn: (data) => api.createNoteTag(data),
    ...errorMeta(silenceError),
    onSuccess: (res) => {
      // El tag nuevo entra a la caché con la respuesta: el TagPicker lo asigna en
      // el mismo flujo y tiene que verse ya en la lista.
      const created = res?.data;
      if (created) {
        qc.setQueryData(noteKeys.tags(), (old) =>
          old?.data && !old.data.some((t) => t.id === created.id)
            ? { ...old, data: [...old.data, created].sort((a, b) => a.name.localeCompare(b.name, 'es')) }
            : old
        );
      }
      qc.invalidateQueries({ queryKey: noteKeys.tags() });
      // El tag_count del grupo cambió.
      qc.invalidateQueries({ queryKey: noteKeys.tagGroups() });
    },
  });
};

// Renombrar, recolorear, cambiar de grupo o borrar un tag se ve en el editor, en
// cada bloque, en el visor, en el repaso por tag y en la búsqueda: se refresca
// todo lo de notas (los grupos incluidos, por su tag_count).
const invalidateTagViews = (qc) => {
  qc.invalidateQueries({ queryKey: noteKeys.all });
  qc.invalidateQueries({ queryKey: revisitKeys.tags });
};

export const useUpdateTag = ({ silenceError = false } = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'updateTag'],
    mutationFn: ({ tagId, data }) => api.updateNoteTag(tagId, data),
    ...errorMeta(silenceError),
    onSuccess: () => invalidateTagViews(qc),
  });
};

export const useDeleteTag = ({ silenceError = false } = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'deleteTag'],
    mutationFn: (tagId) => api.deleteNoteTag(tagId),
    ...errorMeta(silenceError),
    onSuccess: () => invalidateTagViews(qc),
  });
};

/** Grupos de tags del usuario, en orden: [{ id, name, color, position, tag_count }]. */
export const useTagGroups = () =>
  useQuery({
    queryKey: noteKeys.tagGroups(),
    queryFn: () => api.getTagGroups(),
    select: (response) => response.data,
    staleTime: 60000,
  });

// Crear, renombrar y recolorear solo cambian la lista de grupos: los tags apuntan
// al grupo por id y el nombre y el color salen de ahí. Errores en línea en /tags.
export const useCreateTagGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'createTagGroup'],
    mutationFn: (data) => api.createTagGroup(data),
    meta: { silenceError: true },
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.tagGroups() }),
  });
};

export const useUpdateTagGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'updateTagGroup'],
    mutationFn: ({ groupId, data }) => api.updateTagGroup(groupId, data),
    meta: { silenceError: true },
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.tagGroups() }),
  });
};

// Borrar un grupo pasa sus tags a Libre: cambia el group_id de esos tags en todas
// las respuestas (tags, notas, bloques, repaso y búsqueda).
export const useDeleteTagGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'deleteTagGroup'],
    mutationFn: (groupId) => api.deleteTagGroup(groupId),
    meta: { silenceError: true },
    onSuccess: () => invalidateTagViews(qc),
  });
};

/**
 * Reordena los grupos al soltar uno arrastrado: `move(activeId, overId)`. El
 * endpoint recibe la lista entera, así que, como en useToggleNoteTag:
 *  - la lista nueva se arma desde la caché en el click, con optimistic update;
 *  - los cambios van en serie (`scope`): en paralelo podían confirmarse en otro
 *    orden y dejar en el servidor un orden distinto del de la pantalla;
 *  - el rollback y el refresco, solo cuando no queda ninguno en curso. Al
 *    terminar se refresca todo: el orden de los tags cambia en las respuestas.
 */
export const useMoveTagGroup = () => {
  const qc = useQueryClient();
  const key = noteKeys.tagGroups();
  const mutationKey = [...noteKeys.all, 'reorderTagGroups'];

  const mutation = useMutation({
    mutationKey,
    scope: { id: 'tag-groups-order' },
    mutationFn: ({ groups }) => api.reorderTagGroups(groups.map((g) => g.id)),
    onMutate: ({ groups }) => {
      qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData(key);
      qc.setQueryData(key, (old) => (old?.data ? { ...old, data: groups } : old));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (qc.isMutating({ mutationKey }) === 1 && context?.previous) qc.setQueryData(key, context.previous);
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey }) === 1) invalidateTagViews(qc);
    },
  });

  const move = (activeId, overId) => {
    const current = getCachedTagGroups(qc);
    if (!current) return;
    const groups = moveTagGroup(current, activeId, overId);
    if (groups !== current) mutation.mutate({ groups });
  };

  return { move, isPending: mutation.isPending };
};

/**
 * Reordena un tag dentro de su grupo al soltarlo sobre otro: `move(activeId,
 * overId)`. Como useMoveTagGroup: el endpoint recibe los tags del grupo enteros,
 * armados desde la caché al soltar (optimistic con las posiciones nuevas); los
 * cambios van en serie, y el rollback y el refresco de todo, solo cuando no queda
 * ninguno en curso.
 */
export const useMoveTag = () => {
  const qc = useQueryClient();
  const key = noteKeys.tags();
  const mutationKey = [...noteKeys.all, 'reorderTags'];

  const mutation = useMutation({
    mutationKey,
    scope: { id: 'tags-order' },
    mutationFn: ({ groupId, tags }) => api.reorderNoteTags(groupId, tags.map((t) => t.id)),
    onMutate: ({ tags }) => {
      qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData(key);
      const moved = new Map(tags.map((t) => [t.id, t]));
      qc.setQueryData(key, (old) => (old?.data ? { ...old, data: old.data.map((t) => moved.get(t.id) ?? t) } : old));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (qc.isMutating({ mutationKey }) === 1 && context?.previous) qc.setQueryData(key, context.previous);
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey }) === 1) invalidateTagViews(qc);
    },
  });

  const move = (activeId, overId) => {
    const current = qc.getQueryData(key)?.data;
    if (!current) return;
    const result = moveTagInGroup(current, activeId, overId);
    if (result) mutation.mutate(result);
  };

  return { move, isPending: mutation.isPending };
};

/**
 * Alterna un tag de la nota. El endpoint reemplaza la lista entera, así que:
 *  - la lista nueva se arma desde la caché en el momento del toggle (no desde lo
 *    renderizado), con optimistic update y rollback;
 *  - las asignaciones de una misma nota van en serie (`scope`): en paralelo podían
 *    confirmarse en otro orden y perder el último tag;
 *  - el detalle se refresca solo cuando no queda ninguna en curso, para que el
 *    refetch de la primera no pise el optimistic de la segunda.
 *
 * Devuelve `toggle(tag)`, que recibe el objeto tag completo (para pintarlo antes
 * de que responda el servidor).
 */
export const useToggleNoteTag = (noteId) => {
  const qc = useQueryClient();
  const detailKey = noteKeys.detail(noteId);
  const mutationKey = [...noteKeys.all, 'assignTags', noteId];

  const mutation = useMutation({
    mutationKey,
    scope: { id: `note-tags-${noteId}` },
    mutationFn: ({ tags }) => api.assignNoteTags(noteId, tags.map((t) => t.id)),
    // Síncrono a propósito: corre dentro del click, así el siguiente toggle ya
    // lee la caché con este cambio.
    onMutate: ({ tags }) => {
      qc.cancelQueries({ queryKey: detailKey });
      const previous = qc.getQueryData(detailKey);
      qc.setQueryData(detailKey, (old) => (old?.data ? { ...old, data: { ...old.data, tags } } : old));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Con otras en curso no se restaura: su lista ya incluye este cambio y el
      // refetch final deja la nota como quedó en el servidor.
      if (qc.isMutating({ mutationKey }) === 1 && context?.previous) {
        qc.setQueryData(detailKey, context.previous);
      }
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey }) === 1) {
        qc.invalidateQueries({ queryKey: detailKey });
        qc.invalidateQueries({ queryKey: noteKeys.tree() });
      }
    },
  });

  const toggle = (tag) => {
    const current = qc.getQueryData(detailKey)?.data?.tags ?? [];
    const tags = current.some((t) => t.id === tag.id)
      ? current.filter((t) => t.id !== tag.id)
      : sortTags([...current, tag], getCachedTagGroups(qc));
    mutation.mutate({ tags });
  };

  return { toggle, isPending: mutation.isPending };
};

// "Aplicar a bloques existentes": agrega los tags de la nota a sus bloques.
export const useApplyNoteTagsToBlocks = (noteId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...noteKeys.all, 'applyNoteTags', noteId],
    mutationFn: () => api.applyNoteTagsToBlocks(noteId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: noteKeys.detail(noteId) });
      qc.invalidateQueries({ queryKey: revisitKeys.tags });
    },
  });
};

/**
 * Búsqueda de /buscar: { notes, total_notes, total_blocks, truncated }, con los
 * bloques agrupados por nota. Los ids van ordenados en la key: la misma selección
 * es la misma consulta.
 */
export const useNoteSearch = ({ q, tagIds = [], limit, enabled = true }) => {
  const ids = [...tagIds].sort((a, b) => a - b);
  return useQuery({
    queryKey: [...noteKeys.search(), { q, tagIds: ids, limit }],
    queryFn: () => api.searchNotes({ q: q || undefined, tag_ids: ids.join(',') || undefined, limit }),
    select: (response) => response.data,
    enabled: enabled && (!!q?.trim() || ids.length > 0),
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
};

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
