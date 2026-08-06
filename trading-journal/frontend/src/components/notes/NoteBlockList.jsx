import { useState, useCallback, useEffect, useRef } from 'react';
import { Trash2, GripVertical, FileOutput } from 'lucide-react';
import { BlockFollowUpToggle } from './BlockFollowUpToggle.jsx';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
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
import NoteReferenceBlock from './NoteReferenceBlock.jsx';
import NoteTradeReferenceBlock from './NoteTradeReferenceBlock.jsx';
import CopyReferenceButton from './CopyReferenceButton.jsx';
import NoteBlockInsert from './NoteBlockInsert.jsx';
import NoteBlockAddButton from './NoteBlockAddButton.jsx';
import MoveBlockToNoteModal from './MoveBlockToNoteModal.jsx';
import ConfirmDialog from '../common/ConfirmDialog.jsx';
import { useDeleteBlock, useUpdateBlock, useUpdateBlockMetadata, useMoveBlockDnd } from '../../hooks/useNotes.js';

function BlockContent({ block, noteId, onUpdate, onUpdateMetadata, saveStatus }) {
  return (
    <div className={`rounded-xl overflow-hidden${block.block_type === 'callout' ? ' my-3' : ''}`}>
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
      {block.block_type === 'reference' && (
        <div className="px-3 py-1.5">
          <NoteReferenceBlock
            block={block}
            onUpdateMetadata={(metadata) => onUpdateMetadata(block.id, metadata)}
          />
        </div>
      )}
      {block.block_type === 'trade_reference' && (
        <div className="px-3 py-1.5">
          <NoteTradeReferenceBlock block={block} noteId={noteId} />
        </div>
      )}
    </div>
  );
}

function SortableBlockItem({ block, noteId, idx, onDelete, onUpdate, onUpdateMetadata, onOpenMove, saveStatus }) {
  const { attributes, isDragging, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // El bloque de imágenes lleva un footer de metadatos que baja el centro
  // geométrico del bloque; alineamos los controles sobre las miniaturas (h-24).
  const actionTop = block.block_type === 'image_gallery' ? 'top-16' : 'top-1/2';
  // Variante md del anterior, en literal (no `md:${actionTop}`) para que el scanner
  // de Tailwind detecte la clase y la genere.
  const mdActionTop = block.block_type === 'image_gallery' ? 'md:top-16' : 'md:top-1/2';

  return (
    <div ref={setNodeRef} style={style}>
      <div
        id={`block-${block.id}`}
        className={`group relative${block.requires_follow_up ? ' border-l-2 border-amber-400 pl-3' : ''}`}
      >
        {/* Botón "+" en el margen izquierdo: inserta un bloque debajo */}
        <NoteBlockAddButton noteId={noteId} position={idx + 1} topClass={actionTop} />

        {/* Floating actions (grid 2x2). En desktop flotan en el margen derecho
            (`-right-14`), fuera de la columna de contenido; en < md ese margen queda
            fuera de pantalla, así que se anclan dentro del bloque (esquina superior
            derecha). Visibles con hover en desktop y siempre en táctil. */}
        <div
          className={`absolute z-10 grid grid-cols-2 gap-0.5 transition-opacity
                     opacity-0 group-hover:opacity-100 touch:opacity-100
                     right-1 -top-3 md:-right-14 ${mdActionTop} md:-translate-y-1/2`}
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
                       cursor-grab active:cursor-grabbing touch-none
                       shadow-sm transition-colors"
            title="Arrastrar bloque"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>

          {/* Toggle seguimiento */}
          <BlockFollowUpToggle block={block} noteId={noteId} />

          {/* Copiar referencia al bloque (no aplica a bloques que ya son referencias) */}
          {block.block_type !== 'reference' && (
            <CopyReferenceButton noteId={noteId} blockId={block.id} />
          )}

          {/* Mover el bloque a otra nota (todos los tipos; si es una sub-nota,
              el backend reparenta también la nota vinculada) */}
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onOpenMove(block.id); }}
            className="w-6 h-6 flex items-center justify-center rounded
                       bg-white dark:bg-gray-800
                       border border-gray-200 dark:border-gray-700
                       text-gray-400 hover:text-purple-600 dark:hover:text-purple-400
                       hover:border-purple-300 dark:hover:border-purple-700
                       shadow-sm transition-colors"
            title="Mover a otra nota"
          >
            <FileOutput className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => onDelete(block)}
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
    </div>
  );
}

// ¿El bloque tiene contenido que se perdería al eliminarlo? Se usa para pedir
// confirmación solo cuando hay algo que perder (el botón de eliminar está pegado
// a otros controles y se puede accionar por accidente).
const blockHasContent = (block) => {
  switch (block.block_type) {
    case 'text':
    case 'callout':
      return Boolean((block.content || '').trim());
    case 'image_gallery':
      return (block.images || []).length > 0;
    case 'trade_reference':
      return (block.trades || []).length > 0;
    case 'reference':
      return Boolean(block.linked_note_id);
    default:
      // Tipos desconocidos: pedir confirmación por seguridad.
      return true;
  }
};

const NoteBlockList = ({ blocks = [], noteId }) => {
  const deleteBlock = useDeleteBlock();
  const updateBlock = useUpdateBlock();
  const updateBlockMetadata = useUpdateBlockMetadata();
  const moveBlockDnd = useMoveBlockDnd(noteId);
  const [saveStatus, setSaveStatus] = useState({});
  const [activeBlockId, setActiveBlockId] = useState(null);
  const [moveBlockId, setMoveBlockId] = useState(null);
  const [pendingDeleteBlock, setPendingDeleteBlock] = useState(null);
  // Timers de limpieza del label "Guardado ✓"; se cancelan al desmontar.
  const statusTimersRef = useRef([]);
  useEffect(() => () => statusTimersRef.current.forEach(clearTimeout), []);

  // Devuelve true/false para que el hook de autosave sepa si conservar el
  // borrador (en error) o descartarlo (en éxito).
  const handleUpdate = useCallback(async (blockId, content) => {
    setSaveStatus((s) => ({ ...s, [blockId]: 'Guardando...' }));
    try {
      await updateBlock.mutateAsync({ blockId, content, noteId });
      setSaveStatus((s) => ({ ...s, [blockId]: 'Guardado ✓' }));
      const timer = setTimeout(() => {
        setSaveStatus((s) => {
          const n = { ...s };
          delete n[blockId];
          return n;
        });
        statusTimersRef.current = statusTimersRef.current.filter((t) => t !== timer);
      }, 2000);
      statusTimersRef.current.push(timer);
      return true;
    } catch {
      setSaveStatus((s) => ({ ...s, [blockId]: 'Error al guardar' }));
      return false;
    }
  }, [updateBlock, noteId]);

  const handleUpdateMetadata = useCallback((blockId, metadata) => {
    updateBlockMetadata.mutate({ blockId, metadata, noteId });
  }, [updateBlockMetadata, noteId]);

  const handleDelete = useCallback((block) => {
    // Bloques vacíos se borran sin fricción; los que tienen contenido piden
    // confirmación (el botón de eliminar está pegado a otros controles y se
    // puede accionar por accidente).
    if (blockHasContent(block)) {
      setPendingDeleteBlock(block);
      return;
    }
    deleteBlock.mutate({ blockId: block.id, noteId });
  }, [deleteBlock, noteId]);

  const confirmDelete = () => {
    if (!pendingDeleteBlock) return;
    deleteBlock.mutate(
      { blockId: pendingDeleteBlock.id, noteId },
      { onSettled: () => setPendingDeleteBlock(null) }
    );
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // Táctil: delay corto para distinguir arrastre de scroll (ver NoteTree).
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
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
                onDelete={handleDelete}
                onUpdate={handleUpdate}
                onUpdateMetadata={handleUpdateMetadata}
                onOpenMove={setMoveBlockId}
                saveStatus={saveStatus[block.id]}
              />
            ))}
            <NoteBlockInsert noteId={noteId} position={blocks.length} />
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

      {moveBlockId !== null && (
        <MoveBlockToNoteModal
          block={blocks.find((b) => b.id === moveBlockId)}
          sourceNoteId={noteId}
          onClose={() => setMoveBlockId(null)}
        />
      )}

      <ConfirmDialog
        isOpen={pendingDeleteBlock !== null}
        onClose={() => setPendingDeleteBlock(null)}
        onConfirm={confirmDelete}
        title="Eliminar bloque"
        message="Este bloque tiene contenido que se perderá y no se puede deshacer. ¿Quieres eliminarlo?"
        confirmLabel="Eliminar"
        isLoading={deleteBlock.isPending}
      />
    </>
  );
};

export default NoteBlockList;
