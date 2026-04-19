import { useState, useCallback } from 'react';
import { Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import NoteTextBlock from './NoteTextBlock.jsx';
import NoteCalloutBlock from './NoteCalloutBlock.jsx';
import NoteImageGalleryBlock from './NoteImageGalleryBlock.jsx';
import NoteLinkBlock from './NoteLinkBlock.jsx';
import NoteBlockInsert from './NoteBlockInsert.jsx';
import { useDeleteBlock, useUpdateBlock, useUpdateBlockMetadata, useReorderBlocks } from '../../hooks/useNotes.js';

const NoteBlockList = ({ blocks = [], noteId }) => {
  const deleteBlock = useDeleteBlock();
  const updateBlock = useUpdateBlock();
  const updateBlockMetadata = useUpdateBlockMetadata();
  const reorderBlocks = useReorderBlocks();
  const [saveStatus, setSaveStatus] = useState({});

  const handleUpdate = useCallback(async (blockId, content) => {
    setSaveStatus((s) => ({ ...s, [blockId]: 'Guardando...' }));
    try {
      await updateBlock.mutateAsync({ blockId, content, noteId });
      setSaveStatus((s) => ({ ...s, [blockId]: 'Guardado ✓' }));
      setTimeout(() => {
        setSaveStatus((s) => {
          const n = { ...s };
          delete n[blockId];
          return n;
        });
      }, 2000);
    } catch {
      setSaveStatus((s) => ({ ...s, [blockId]: 'Error al guardar' }));
    }
  }, [updateBlock, noteId]);

  const handleUpdateMetadata = useCallback((blockId, metadata) => {
    updateBlockMetadata.mutate({ blockId, metadata, noteId });
  }, [updateBlockMetadata, noteId]);

  const moveBlock = (index, direction) => {
    const newBlocks = [...blocks];
    const target = index + direction;
    if (target < 0 || target >= newBlocks.length) return;
    [newBlocks[index], newBlocks[target]] = [newBlocks[target], newBlocks[index]];
    reorderBlocks.mutate({ noteId, block_ids: newBlocks.map((b) => b.id) });
  };

  if (blocks.length === 0) {
    return (
      <div>
        <NoteBlockInsert noteId={noteId} position={0} />
        <p className="text-center text-sm text-gray-300 dark:text-gray-600 italic py-8 select-none">
          Esta nota está vacía — usa el&nbsp;<strong>+</strong>&nbsp;para agregar contenido.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Insertar antes del primer bloque */}
      <NoteBlockInsert noteId={noteId} position={0} />

      {blocks.map((block, idx) => (
        <div key={block.id}>
          {/* Contenedor del bloque */}
          <div className="group relative">

            {/* Acciones flotantes a la derecha */}
            <div
              className="absolute -right-8 top-1/2 -translate-y-1/2
                         flex flex-col gap-0.5
                         opacity-0 group-hover:opacity-100 transition-opacity z-10"
            >
              <button
                onClick={() => moveBlock(idx, -1)}
                disabled={idx === 0}
                className="w-6 h-6 flex items-center justify-center rounded
                           bg-white dark:bg-gray-800
                           border border-gray-200 dark:border-gray-700
                           text-gray-400 hover:text-gray-700 dark:hover:text-gray-200
                           hover:border-gray-300 dark:hover:border-gray-500
                           disabled:opacity-25 disabled:cursor-not-allowed
                           shadow-sm transition-colors"
                title="Subir bloque"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => moveBlock(idx, 1)}
                disabled={idx === blocks.length - 1}
                className="w-6 h-6 flex items-center justify-center rounded
                           bg-white dark:bg-gray-800
                           border border-gray-200 dark:border-gray-700
                           text-gray-400 hover:text-gray-700 dark:hover:text-gray-200
                           hover:border-gray-300 dark:hover:border-gray-500
                           disabled:opacity-25 disabled:cursor-not-allowed
                           shadow-sm transition-colors"
                title="Bajar bloque"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => deleteBlock.mutate({ blockId: block.id, noteId })}
                className="w-6 h-6 flex items-center justify-center rounded
                           bg-white dark:bg-gray-800
                           border border-red-200 dark:border-red-900/60
                           text-red-400 hover:text-red-600
                           hover:bg-red-50 dark:hover:bg-red-900/30
                           hover:border-red-300 dark:hover:border-red-800
                           shadow-sm transition-colors"
                title="Eliminar bloque"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Contenido según tipo */}
            <div className="rounded-xl overflow-hidden">
              {block.block_type === 'text' && (
                <NoteTextBlock
                  block={block}
                  onUpdate={(content) => handleUpdate(block.id, content)}
                  saveStatus={saveStatus[block.id]}
                />
              )}

              {block.block_type === 'callout' && (
                <NoteCalloutBlock
                  block={block}
                  onUpdate={(content) => handleUpdate(block.id, content)}
                  onUpdateMetadata={(metadata) => handleUpdateMetadata(block.id, metadata)}
                  saveStatus={saveStatus[block.id]}
                />
              )}

              {block.block_type === 'image_gallery' && (
                <NoteImageGalleryBlock block={block} noteId={noteId} />
              )}

              {block.block_type === 'note_link' && (
                <div className="px-3 py-1.5">
                  <NoteLinkBlock block={block} />
                </div>
              )}
            </div>
          </div>

          {/* Insertar después de cada bloque */}
          <NoteBlockInsert noteId={noteId} position={idx + 1} />
        </div>
      ))}
    </div>
  );
};

export default NoteBlockList;
