import { useState, useCallback } from 'react';
import { Trash2, GripVertical, FolderInput, X } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import NoteTextBlock from './NoteTextBlock.jsx';
import NoteCalloutBlock from './NoteCalloutBlock.jsx';
import NoteImageGalleryBlock from './NoteImageGalleryBlock.jsx';
import NoteLinkBlock from './NoteLinkBlock.jsx';
import NoteBlockInsert from './NoteBlockInsert.jsx';
import { useDeleteBlock, useCreateBlock, useUpdateBlock, useUpdateBlockMetadata, useMoveBlockDnd, useMoveNote } from '../../hooks/useNotes.js';

function BlockContent({ block, noteId, onUpdate, onUpdateMetadata, saveStatus }) {
  return (
    <div className="rounded-xl overflow-hidden">
      {block.block_type === 'text' && (
        <NoteTextBlock
          block={block}
          onUpdate={(content) => onUpdate(block.id, content)}
          saveStatus={saveStatus}
        />
      )}
      {block.block_type === 'callout' && (
        <NoteCalloutBlock
          block={block}
          onUpdate={(content) => onUpdate(block.id, content)}
          onUpdateMetadata={(metadata) => onUpdateMetadata(block.id, metadata)}
          saveStatus={saveStatus}
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
  );
}

function SortableBlockItem({ block, noteId, idx, onDelete, onUpdate, onUpdateMetadata, onOpenMoveSubNote, saveStatus }) {
  const { attributes, isDragging, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="group relative">
        {/* Floating actions to the right */}
        <div
          className="absolute -right-8 top-1/2 -translate-y-1/2
                     flex flex-col gap-0.5
                     opacity-0 group-hover:opacity-100 transition-opacity z-10"
        >
          {/* Drag handle */}
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className="w-6 h-6 flex items-center justify-center rounded
                       bg-white dark:bg-gray-800
                       border border-gray-200 dark:border-gray-700
                       text-gray-400 hover:text-gray-700 dark:hover:text-gray-200
                       hover:border-gray-300 dark:hover:border-gray-500
                       cursor-grab active:cursor-grabbing
                       shadow-sm transition-colors"
            title="Arrastrar bloque"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>

          {/* Mover sub-nota dentro de otra (solo note_link) */}
          {block.block_type === 'note_link' && (
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onOpenMoveSubNote(block.id); }}
              className="w-6 h-6 flex items-center justify-center rounded
                         bg-white dark:bg-gray-800
                         border border-gray-200 dark:border-gray-700
                         text-gray-400 hover:text-purple-600 dark:hover:text-purple-400
                         hover:border-purple-300 dark:hover:border-purple-700
                         shadow-sm transition-colors"
              title="Mover sub-nota dentro de otra"
            >
              <FolderInput className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => onDelete(block.id)}
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

        <BlockContent
          block={block}
          noteId={noteId}
          onUpdate={onUpdate}
          onUpdateMetadata={onUpdateMetadata}
          saveStatus={saveStatus}
        />
      </div>

      <NoteBlockInsert noteId={noteId} position={idx + 1} />
    </div>
  );
}

function MoveSubNoteModal({ blocks, moveSubNoteBlockId, onConfirm, onClose, isPending }) {
  const movingBlock = blocks.find((b) => b.id === moveSubNoteBlockId);
  const targets = blocks.filter(
    (b) => b.block_type === 'note_link' && b.id !== moveSubNoteBlockId && b.linked_note_id
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm flex flex-col max-h-[70vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <FolderInput className="w-4 h-4 text-purple-500" />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Mover sub-nota dentro de otra
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/40 border-b border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Moviendo:</p>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
            {movingBlock?.linked_note_title || 'Sub-nota'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {targets.length === 0 ? (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8 px-4">
              No hay otras sub-notas disponibles como destino.
            </p>
          ) : (
            targets.map((b) => (
              <button
                key={b.id}
                onClick={() => onConfirm(b)}
                disabled={isPending}
                className="w-full flex items-center gap-3 px-4 py-3 text-left
                           hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors
                           disabled:opacity-50"
              >
                <FolderInput className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <span className="text-sm text-gray-800 dark:text-gray-100 truncate">
                  {b.linked_note_title || 'Sub-nota sin título'}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const NoteBlockList = ({ blocks = [], noteId }) => {
  const deleteBlock = useDeleteBlock();
  const createBlock = useCreateBlock();
  const updateBlock = useUpdateBlock();
  const updateBlockMetadata = useUpdateBlockMetadata();
  const moveBlockDnd = useMoveBlockDnd(noteId);
  const moveNote = useMoveNote();
  const [saveStatus, setSaveStatus] = useState({});
  const [activeBlockId, setActiveBlockId] = useState(null);
  const [moveSubNoteBlockId, setMoveSubNoteBlockId] = useState(null);

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

  const handleConfirmMoveSubNote = async (targetBlock) => {
    const movingBlock = blocks.find((b) => b.id === moveSubNoteBlockId);
    if (!movingBlock?.linked_note_id || !targetBlock?.linked_note_id) return;

    // 1. Cambiar parent_note_id de la sub-nota
    await moveNote.mutateAsync({ id: movingBlock.linked_note_id, parent_note_id: targetBlock.linked_note_id });

    // 2. Eliminar el note_link block de la nota actual
    await deleteBlock.mutateAsync({ blockId: movingBlock.id, noteId });

    // 3. Crear un note_link block al final de la nota destino
    await createBlock.mutateAsync({
      noteId: targetBlock.linked_note_id,
      data: { block_type: 'note_link', linked_note_id: movingBlock.linked_note_id, position: 9999 },
    });

    setMoveSubNoteBlockId(null);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = ({ active }) => setActiveBlockId(active.id);

  const handleDragEnd = ({ active, over }) => {
    setActiveBlockId(null);
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    if (oldIndex === newIndex) return;
    const dropType = newIndex > oldIndex ? 'sibling-below' : 'sibling-above';
    moveBlockDnd.mutate({ blockId: active.id, targetBlockId: over.id, dropType });
  };

  const handleDragCancel = () => setActiveBlockId(null);

  const activeBlock = blocks.find((b) => b.id === activeBlockId);

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
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div>
            <NoteBlockInsert noteId={noteId} position={0} />
            {blocks.map((block, idx) => (
              <SortableBlockItem
                key={block.id}
                block={block}
                noteId={noteId}
                idx={idx}
                onDelete={(blockId) => deleteBlock.mutate({ blockId, noteId })}
                onUpdate={handleUpdate}
                onUpdateMetadata={handleUpdateMetadata}
                onOpenMoveSubNote={setMoveSubNoteBlockId}
                saveStatus={saveStatus[block.id]}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeBlock ? (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-xl rounded-xl p-3 text-sm text-gray-500 dark:text-gray-400 opacity-90 cursor-grabbing">
              {activeBlock.block_type === 'text' && activeBlock.content
                ? activeBlock.content.slice(0, 60) + (activeBlock.content.length > 60 ? '…' : '')
                : `Bloque ${activeBlock.block_type}`}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {moveSubNoteBlockId !== null && (
        <MoveSubNoteModal
          blocks={blocks}
          moveSubNoteBlockId={moveSubNoteBlockId}
          onConfirm={handleConfirmMoveSubNote}
          onClose={() => setMoveSubNoteBlockId(null)}
          isPending={moveNote.isPending || deleteBlock.isPending || createBlock.isPending}
        />
      )}
    </>
  );
};

export default NoteBlockList;
