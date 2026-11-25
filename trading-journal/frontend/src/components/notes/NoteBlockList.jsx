import { useState, useCallback, useEffect, useRef } from 'react';
import { Trash2, GripVertical, FileOutput, Tag } from 'lucide-react';
import { BlockFollowUpToggle } from './BlockFollowUpToggle.jsx';
import { BlockRevisitToggle } from './BlockRevisitToggle.jsx';
import { BlockReminderToggle } from './BlockReminderToggle.jsx';
import { ReminderChips } from './ReminderChip.jsx';
import ReminderModal from './ReminderModal.jsx';
import BlockTags from './BlockTags.jsx';
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
import BlockContent from './BlockContent.jsx';
import CopyReferenceButton from './CopyReferenceButton.jsx';
import NoteBlockInsert from './NoteBlockInsert.jsx';
import NoteBlockAddButton from './NoteBlockAddButton.jsx';
import BlockTouchMenu from './BlockTouchMenu.jsx';
import MoveBlockToNoteModal from './MoveBlockToNoteModal.jsx';
import ConfirmDialog from '../common/ConfirmDialog.jsx';
import { useDeleteBlock, useUpdateBlock, useUpdateBlockMetadata, useMoveBlockDnd, useNoteTree } from '../../hooks/useNotes.js';
import { BLOCK_OPTIONS } from '../../hooks/useBlockInserter.js';
import { subtreeIds } from '../../utils/notesGrouping.js';

function SortableBlockItem({
  block,
  noteId,
  idx,
  onDelete,
  onUpdate,
  onUpdateMetadata,
  onOpenMove,
  onOpenReminder,
  tagsOpen,
  onOpenTags,
  saveStatus,
  blockOptions,
  noteActions,
}) {
  // Los bloques de referencia no llevan tags (ni botón ni fila).
  const taggable = noteActions && block.block_type !== 'reference';
  const hasTags = (block.tags || []).length > 0;
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
        className={`group relative${
          // El follow-up (ámbar) tiene precedencia en el borde; si no, el repaso
          // (sky) pinta su propio borde. El estado combinado se distingue igual por
          // el icono activo de cada toggle.
          block.requires_follow_up
            ? ' border-l-2 border-amber-400 pl-3'
            : block.marked_for_revisit
              ? ' border-l-2 border-blue-500 pl-3'
              : ''
        }`}
      >
        {/* Botón "+" en el margen izquierdo: inserta un bloque debajo.
            Solo desktop; en táctil la inserción vive en el menú "⋮". */}
        <NoteBlockAddButton noteId={noteId} position={idx + 1} topClass={actionTop} options={blockOptions} />

        {/* Táctil (tablets/móvil): un único botón "⋮" con todas las acciones
            en un menú; mantener pulsado arrastra. Reemplaza al "+" y a la
            grilla de acciones, que saturaban la pantalla al estar siempre
            visibles sin hover. Vive en el margen izquierdo, donde en desktop
            está el "+". */}
        <BlockTouchMenu
          block={block}
          noteId={noteId}
          position={idx + 1}
          onOpenMove={onOpenMove}
          onOpenReminder={onOpenReminder}
          onOpenTags={taggable ? () => onOpenTags(block.id) : null}
          onDelete={onDelete}
          dragListeners={listeners}
          topClass={actionTop}
          options={blockOptions}
          noteActions={noteActions}
        />

        {/* Floating actions (grid de 2 columnas), solo desktop (hover). Flotan en el
            margen derecho (`-right-14`), fuera de la columna de contenido; en
            < md ese margen queda fuera de pantalla, así que se anclan dentro
            del bloque (esquina superior derecha). */}
        <div
          className={`absolute z-10 grid grid-cols-2 gap-0.5 transition-opacity
                     opacity-0 group-hover:opacity-100 touch:hidden
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

          {noteActions && (
            <>
              {/* Toggle seguimiento */}
              <BlockFollowUpToggle block={block} noteId={noteId} />

              {/* Toggle repaso */}
              <BlockRevisitToggle block={block} />

              {/* Recordatorios del bloque (alertas de precio y por fecha) */}
              <BlockReminderToggle block={block} onOpen={onOpenReminder} />

              {/* Tags del bloque: siempre visible (relleno si tiene tags) para que
                  la grilla no cambie de forma. Los tags no se listan bajo el
                  bloque: el title los nombra y el picker los muestra marcados. */}
              {taggable && (
                <button
                  type="button"
                  data-tag-picker-toggle
                  onClick={(e) => { e.stopPropagation(); onOpenTags(tagsOpen ? null : block.id); }}
                  className={`w-6 h-6 flex items-center justify-center rounded
                             bg-white dark:bg-gray-800 border shadow-sm transition-colors
                             ${hasTags
                               ? 'border-teal-500 dark:border-teal-600 text-teal-600 hover:text-teal-700'
                               : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:text-teal-600 hover:border-teal-300 dark:hover:border-teal-700'
                             }`}
                  title={hasTags ? `Tags: ${block.tags.map((t) => t.name).join(', ')}` : 'Tags del bloque'}
                  aria-expanded={tagsOpen}
                >
                  <Tag className="w-3.5 h-3.5" fill={hasTags ? 'currentColor' : 'none'} />
                </button>
              )}

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
            </>
          )}

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

      {/* Picker de tags (sin fila de tags) y chips de recordatorios: fuera del
          contenedor del bloque para no mover sus controles flotantes (centrados
          en vertical). */}
      {taggable && (
        <BlockTags
          block={block}
          noteId={noteId}
          showList={false}
          open={tagsOpen}
          onOpenChange={(open) => onOpenTags(open ? block.id : null)}
        />
      )}
      {noteActions && (
        <ReminderChips
          alerts={block.price_alerts}
          reminders={block.date_reminders}
          onOpen={(item) => onOpenReminder(block.id, item)}
          className="px-4 pb-2 -mt-0.5"
        />
      )}
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
    case 'image':
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

/**
 * Lista editable de bloques de una nota. También la usa el contenido de un
 * pendiente (TODO), que limita los tipos de bloque (`blockOptions`) y oculta las
 * acciones propias de notas (`noteActions`: seguimiento, repaso, recordatorios,
 * referencia, mover).
 */
const NoteBlockList = ({
  blocks = [],
  noteId,
  blockOptions = BLOCK_OPTIONS,
  noteActions = true,
  emptyMessage = 'Esta nota está vacía',
}) => {
  const deleteBlock = useDeleteBlock();
  const { data: treeData } = useNoteTree();
  const updateBlock = useUpdateBlock();
  const updateBlockMetadata = useUpdateBlockMetadata();
  const moveBlockDnd = useMoveBlockDnd(noteId);
  const [saveStatus, setSaveStatus] = useState({});
  const [activeBlockId, setActiveBlockId] = useState(null);
  const [moveBlockId, setMoveBlockId] = useState(null);
  // { blockId, alert?, reminder? }: modal de recordatorios del bloque (desde el
  // toggle, el menú táctil o un chip, que lo abre editando ese elemento)
  const [reminderTarget, setReminderTarget] = useState(null);
  const openReminder = useCallback((blockId, item = {}) => setReminderTarget({ blockId, ...item }), []);
  // Bloque con el TagPicker abierto (uno a la vez); null = ninguno.
  const [tagsBlockId, setTagsBlockId] = useState(null);
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

  // Si el bloque es una sub-nota (hija de esta nota), borrarlo elimina también la
  // nota y su subtree (ver deleteBlock en el backend): el diálogo lo dice explícito.
  const pendingSubNote =
    pendingDeleteBlock?.block_type === 'reference' && pendingDeleteBlock.linked_note_id
      ? treeData?.flat.find(
          (n) => n.id === pendingDeleteBlock.linked_note_id && n.parent_note_id === noteId
        )
      : null;
  const pendingSubNoteCount = pendingSubNote ? subtreeIds(treeData.flat, pendingSubNote.id).size - 1 : 0;

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
        <NoteBlockInsert noteId={noteId} position={0} options={blockOptions} />
        <p className="text-center text-sm text-gray-300 dark:text-gray-600 italic py-8 select-none">
          {emptyMessage} — usa el&nbsp;<strong>+</strong>&nbsp;para agregar contenido.
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
                onOpenReminder={openReminder}
                tagsOpen={tagsBlockId === block.id}
                onOpenTags={setTagsBlockId}
                saveStatus={saveStatus[block.id]}
                blockOptions={blockOptions}
                noteActions={noteActions}
              />
            ))}
            <NoteBlockInsert noteId={noteId} position={blocks.length} options={blockOptions} />
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

      {reminderTarget && (() => {
        // El bloque se lee de la lista en cada render: tras crear o borrar, la nota
        // se refresca y la lista del modal se actualiza sola.
        const block = blocks.find((b) => b.id === reminderTarget.blockId);
        if (!block) return null;
        return (
          <ReminderModal
            onClose={() => setReminderTarget(null)}
            anchor={{ blockId: block.id }}
            alerts={block.price_alerts || []}
            reminders={block.date_reminders || []}
            initialAlert={reminderTarget.alert || null}
            initialReminder={reminderTarget.reminder || null}
          />
        );
      })()}

      <ConfirmDialog
        isOpen={pendingDeleteBlock !== null}
        onClose={() => setPendingDeleteBlock(null)}
        onConfirm={confirmDelete}
        title={pendingSubNote ? 'Eliminar nota' : 'Eliminar bloque'}
        message={
          pendingSubNote
            ? `Se eliminará la nota "${pendingSubNote.title || 'Sin título'}"${
                pendingSubNoteCount > 0
                  ? ` y sus ${pendingSubNoteCount} sub-nota${pendingSubNoteCount !== 1 ? 's' : ''}`
                  : ''
              }. ¿Quieres eliminarla?`
            : 'Este bloque tiene contenido que se perderá y no se puede deshacer. ¿Quieres eliminarlo?'
        }
        confirmLabel="Eliminar"
        isLoading={deleteBlock.isPending}
      />
    </>
  );
};

export default NoteBlockList;
