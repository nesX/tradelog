import { useCallback } from 'react';
import { AlignLeft, Image, Link, Link2, StickyNote, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCreateBlock, useCreateNote } from './useNotes.js';

export const BLOCK_OPTIONS = [
  { type: 'text',            label: 'Texto',          icon: AlignLeft,  color: 'text-gray-500'    },
  { type: 'image_gallery',   label: 'Imágenes',       icon: Image,      color: 'text-green-500'   },
  { type: 'trade_reference', label: 'Trades',         icon: TrendingUp, color: 'text-emerald-500' },
  { type: 'sub_note',        label: 'Sub-nota',       icon: Link,       color: 'text-blue-500'    },
  { type: 'reference',       label: 'Enlace interno', icon: Link2,      color: 'text-indigo-500'  },
  { type: 'callout',         label: 'Destacado',      icon: StickyNote, color: 'text-yellow-500'  },
];

/**
 * Lógica compartida para insertar un bloque nuevo en una nota.
 * `insert(block_type, position)` crea el bloque (con los casos especiales
 * de sub-nota, referencia, trade_reference y callout) en la posición dada.
 */
export function useBlockInserter(noteId) {
  const createBlock = useCreateBlock();
  const createNote = useCreateNote();
  const navigate = useNavigate();

  const insert = useCallback(
    async (block_type, position) => {
      if (block_type === 'sub_note') {
        const noteRes = await createNote.mutateAsync({ parent_note_id: noteId });
        const subNote = noteRes.data;
        await createBlock.mutateAsync({
          noteId,
          data: {
            block_type: 'reference',
            linked_note_id: subNote.id,
            position,
            metadata: {
              target_note_id: subNote.id,
              target_block_id: null,
              label: subNote.title || 'Sub-nota',
            },
          },
        });
        navigate(`/notes/${subNote.id}`);
      } else if (block_type === 'reference') {
        await createBlock.mutateAsync({
          noteId,
          data: { block_type: 'reference', position, metadata: { label: 'Referencia' } },
        });
      } else if (block_type === 'trade_reference') {
        await createBlock.mutateAsync({
          noteId,
          data: { block_type: 'trade_reference', position, metadata: {} },
        });
      } else if (block_type === 'callout') {
        await createBlock.mutateAsync({
          noteId,
          data: { block_type: 'callout', content: '', metadata: { style: 'info' }, position },
        });
      } else {
        await createBlock.mutateAsync({ noteId, data: { block_type, position } });
      }
    },
    [noteId, createBlock, createNote, navigate]
  );

  const loading = createBlock.isPending || createNote.isPending;

  return { insert, loading };
}
