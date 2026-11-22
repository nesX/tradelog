import { useState, useEffect, useRef } from 'react';
import { Check, ChevronDown, ChevronRight, FileText, GripVertical, Trash2 } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useNote } from '../../hooks/useNotes.js';
import { BLOCK_OPTIONS } from '../../hooks/useBlockInserter.js';
import NoteBlockList from '../notes/NoteBlockList.jsx';

// El contenido de un pendiente admite texto markdown, imagen y galería.
const TODO_BLOCK_OPTIONS = BLOCK_OPTIONS.filter(({ type }) =>
  ['text', 'image', 'image_gallery'].includes(type)
);

/** Contenido del pendiente: la nota oculta que lo respalda, con sus bloques. */
function TodoItemContent({ noteId }) {
  const { data: note, isLoading, error } = useNote(noteId);

  if (isLoading) {
    return <p className="py-4 text-sm text-gray-400 dark:text-gray-500">Cargando…</p>;
  }
  if (error || !note) {
    return (
      <p className="py-4 text-sm text-red-500 dark:text-red-400">
        No se pudo cargar el contenido del pendiente.
      </p>
    );
  }
  return (
    <NoteBlockList
      blocks={note.blocks || []}
      noteId={noteId}
      blockOptions={TODO_BLOCK_OPTIONS}
      noteActions={false}
      emptyMessage="Sin contenido"
    />
  );
}

/**
 * Fila de un pendiente. Click en el título lo despliega en línea con su
 * contenido (bloques de notas). Los pendientes sin completar se arrastran
 * desde el asa; los completados no se reordenan.
 */
const TodoItem = ({ item, expanded, onToggleExpand, onToggleCompleted, onRename, onDelete }) => {
  const completed = Boolean(item.completed_at);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: completed });

  const [titleValue, setTitleValue] = useState(item.title);
  useEffect(() => setTitleValue(item.title), [item.title]);
  // Escape descarta la edición: el blur que sigue no debe guardar.
  const skipSaveRef = useRef(false);

  const saveTitle = () => {
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    const title = titleValue.trim();
    if (!title) {
      setTitleValue(item.title);
      return;
    }
    if (title !== item.title) onRename(item, title);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group/item rounded-lg border border-gray-200 dark:border-gray-700
                 bg-white dark:bg-gray-800"
    >
      <div className="flex items-center gap-1.5 px-2 py-2">
        {completed ? (
          <span className="w-5 flex-shrink-0" />
        ) : (
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className="w-5 h-6 flex-shrink-0 flex items-center justify-center rounded
                       text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400
                       cursor-grab active:cursor-grabbing touch-none
                       opacity-0 group-hover/item:opacity-100 touch:opacity-100 transition-opacity"
            title="Arrastrar pendiente"
            aria-label="Arrastrar pendiente"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={() => onToggleCompleted(item)}
          className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full border-2 transition-colors
            ${completed
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'border-gray-300 dark:border-gray-500 text-transparent hover:border-blue-500 hover:text-blue-500'
            }`}
          title={completed ? 'Marcar como pendiente' : 'Marcar como completado'}
          aria-label={completed ? 'Marcar como pendiente' : 'Marcar como completado'}
        >
          <Check className="w-3 h-3" strokeWidth={3} />
        </button>

        <button
          onClick={() => onToggleExpand(item.id)}
          className="flex-1 min-w-0 flex items-center gap-2 px-1.5 py-0.5 text-left"
        >
          <span
            className={`flex-1 min-w-0 truncate text-sm ${
              completed
                ? 'line-through text-gray-400 dark:text-gray-500'
                : 'text-gray-800 dark:text-gray-100'
            }`}
          >
            {item.title}
          </span>
          {item.has_content && !expanded && (
            <FileText className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" aria-label="Tiene contenido" />
          )}
          {expanded ? (
            <ChevronDown className="w-4 h-4 flex-shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 flex-shrink-0 text-gray-400" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700/60 pl-8 pr-3 md:pr-16 pt-3 pb-3">
          <input
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                skipSaveRef.current = true;
                setTitleValue(item.title);
                e.currentTarget.blur();
              }
            }}
            maxLength={500}
            className="w-full mb-2 px-4 py-1 text-base font-semibold bg-transparent rounded
                       text-gray-900 dark:text-white outline-none
                       focus:ring-1 focus:ring-gray-200 dark:focus:ring-gray-600"
            aria-label="Título del pendiente"
          />

          <TodoItemContent noteId={item.note_id} />

          <div className="flex justify-end mt-2">
            <button
              onClick={() => onDelete(item)}
              className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg
                         text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30
                         transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar pendiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TodoItem;
