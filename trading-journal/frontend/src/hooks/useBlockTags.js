import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints.js';
import { sortTags } from '../constants/tagGroups.js';
import { noteKeys } from './useNotes.js';
import { revisitKeys } from './useRevisit.js';

/**
 * Aplica `update(tags) → tags` a los tags del bloque en las dos cachés donde puede
 * estar: dentro de la nota (`detail(noteId).data.blocks`) y suelto
 * (`block(blockId)`, el visor de repaso). Las que no están en caché no se tocan.
 */
export const updateBlockTagsInCache = (qc, { noteId, blockId }, update) => {
  if (noteId) {
    qc.setQueryData(noteKeys.detail(noteId), (old) => {
      if (!old?.data?.blocks) return old;
      return {
        ...old,
        data: {
          ...old.data,
          blocks: old.data.blocks.map((b) => (b.id === blockId ? { ...b, tags: update(b.tags ?? []) } : b)),
        },
      };
    });
  }
  qc.setQueryData(noteKeys.block(blockId), (old) =>
    old?.data ? { ...old, data: { ...old.data, tags: update(old.data.tags ?? []) } } : old
  );
};

const withTag = (tag) => (tags) => (tags.some((t) => t.id === tag.id) ? tags : sortTags([...tags, tag]));
const withoutTag = (tag) => (tags) => tags.filter((t) => t.id !== tag.id);

/**
 * Agregar o quitar un tag de un bloque (endpoints delta e idempotentes).
 *  - Las dos comparten `mutationKey` (bajo noteKeys.all, para el indicador de
 *    guardado) y `scope`: "agregar A" y "quitar A" seguidos llegan en orden.
 *  - Optimistic sobre la nota y el bloque suelto; en error se deshace solo este
 *    cambio (el inverso del delta), sin pisar los demás en curso.
 *  - La respuesta trae la lista completa: se adopta solo si no quedan otras
 *    mutaciones de tags de ese bloque en curso, para que una respuesta vieja no
 *    pise un optimistic más nuevo.
 *  - No se refresca la nota en cada toggle (trae bloques, imágenes, trades y
 *    recordatorios); sí el repaso por tag.
 */
const useBlockTagMutation = ({ noteId, blockId }, { request, apply, revert }) => {
  const qc = useQueryClient();
  const mutationKey = [...noteKeys.all, 'block-tags', blockId];
  const target = { noteId, blockId };

  return useMutation({
    mutationKey,
    scope: { id: `block-tags-${blockId}` },
    mutationFn: (tag) => request(blockId, tag.id),
    onMutate: (tag) => {
      qc.cancelQueries({ queryKey: noteKeys.block(blockId) });
      updateBlockTagsInCache(qc, target, apply(tag));
    },
    onSuccess: (res) => {
      if (qc.isMutating({ mutationKey }) === 1 && res?.data?.tags) {
        updateBlockTagsInCache(qc, target, () => res.data.tags);
      }
    },
    onError: (_err, tag) => updateBlockTagsInCache(qc, target, revert(tag)),
    onSettled: () => qc.invalidateQueries({ queryKey: revisitKeys.tags }),
  });
};

export const useAddBlockTag = (target) =>
  useBlockTagMutation(target, { request: api.addBlockTag, apply: withTag, revert: withoutTag });

export const useRemoveBlockTag = (target) =>
  useBlockTagMutation(target, { request: api.removeBlockTag, apply: withoutTag, revert: withTag });
