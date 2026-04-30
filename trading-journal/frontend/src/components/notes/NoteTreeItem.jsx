import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ChevronRight, Plus, Trash2, GripVertical, FolderInput } from 'lucide-react';

const NoteTreeItem = ({
  note, depth, isExpanded, isSelected, onToggle, onSelect, onCreateChild, onDelete, onMove, children,
  overInfo,
}) => {
  const isOverThis = overInfo?.noteId === note.id;
  const zone = isOverThis ? overInfo.zone : null;

  // Draggable: referencia en el contenedor exterior para opacidad y medición.
  // No se aplica transform — el DragOverlay es el elemento visual móvil.
  const { setNodeRef: setDragRef, attributes, listeners, isDragging } = useDraggable({
    id: note.id,
    data: { type: 'note' },
  });

  // Droppable: SOLO en la fila visible, no en el contenedor con hijos.
  // Así el rect del droppable = solo la altura de la fila,
  // evitando que el rect de un padre incluya el espacio de sus hijos.
  const { setNodeRef: setDropRef } = useDroppable({
    id: `note-drop-${note.id}`,
    data: { noteId: note.id },
  });

  return (
    <div
      ref={setDragRef}
      style={{ opacity: isDragging ? 0.35 : 1 }}
      className="relative"
    >
      {/* Indicador de inserción arriba */}
      {zone === 'sibling-above' && (
        <div className="absolute -top-px inset-x-1 h-0.5 bg-blue-500 rounded-full z-20 pointer-events-none" />
      )}

      {/* Fila visible — es el único droppable */}
      <div
        ref={setDropRef}
        className={`group flex items-center gap-1 rounded-lg cursor-pointer select-none transition-colors
          ${zone === 'child'
            ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/30'
            : isSelected
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
          }`}
        style={{
          paddingLeft: `${8 + depth * 16}px`,
          paddingRight: '6px',
          paddingTop: '5px',
          paddingBottom: '5px',
        }}
      >
        {/* Handle de arrastre */}
        <span
          {...attributes}
          {...listeners}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 transition-opacity"
          aria-label="Arrastrar nota"
        >
          <GripVertical className="w-3 h-3" />
        </span>

        {/* Chevron collapse/expand */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={`flex-shrink-0 w-4 h-4 flex items-center justify-center rounded transition-colors
            ${note.children?.length > 0
              ? 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
              : 'invisible'}`}
        >
          <ChevronRight
            className={`w-3.5 h-3.5 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
          />
        </button>

        {/* Título */}
        <span
          className="flex-1 truncate text-sm"
          onClick={onSelect}
          title={note.title}
        >
          {note.title}
        </span>

        {/* Indicador visual zona child */}
        {zone === 'child' && (
          <span className="flex-shrink-0 text-xs text-blue-500 dark:text-blue-400 font-medium pr-0.5 select-none">
            ↳
          </span>
        )}

        {/* Crear sub-nota */}
        <button
          onClick={(e) => { e.stopPropagation(); onCreateChild(note.id); }}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
          title="Crear sub-nota"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        {/* Eliminar */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(note.id, note.title); }}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400 transition-all"
          title="Eliminar nota"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Indicador de inserción abajo */}
      {zone === 'sibling-below' && (
        <div className="absolute -bottom-px inset-x-1 h-0.5 bg-blue-500 rounded-full z-20 pointer-events-none" />
      )}

      {/* Hijos */}
      {note.children?.length > 0 && isExpanded && (
        <div>{children}</div>
      )}
    </div>
  );
};

export default NoteTreeItem;
