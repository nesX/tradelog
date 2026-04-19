import { useRef } from 'react';
import { ChevronRight, Plus, Trash2, GripVertical } from 'lucide-react';

const NoteTreeItem = ({
  note, depth, isExpanded, isSelected, onToggle, onSelect, onCreateChild, onDelete, children,
  isDragging, isDragOver, dragPosition,
  onDragStart, onDragOver, onDrop, onDragEnd,
}) => {
  const hasChildren = children && children.length > 0;
  const rowRef = useRef(null);
  const lastPosRef = useRef('below');

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!rowRef.current) return;
    const rect = rowRef.current.getBoundingClientRect();
    const pos = e.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
    lastPosRef.current = pos;
    onDragOver(e, pos);
  };

  const handleDrop = (e) => {
    e.stopPropagation();
    onDrop(e, lastPosRef.current);
  };

  return (
    <div className="relative">
      {isDragOver && dragPosition === 'above' && (
        <div className="absolute top-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10 pointer-events-none" />
      )}

      <div
        ref={rowRef}
        draggable
        onDragStart={(e) => { e.stopPropagation(); onDragStart(); }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={(e) => { e.stopPropagation(); onDragEnd(); }}
        className={`group flex items-center gap-1 rounded-lg cursor-pointer select-none transition-colors
          ${isDragging ? 'opacity-30' : ''}
          ${isSelected
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
          }`}
        style={{ paddingLeft: `${8 + depth * 16}px`, paddingRight: '6px', paddingTop: '5px', paddingBottom: '5px' }}
      >
        {/* Drag handle */}
        <span
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 transition-opacity"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-3 h-3" />
        </span>

        {/* Chevron toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={`flex-shrink-0 w-4 h-4 flex items-center justify-center rounded transition-colors
            ${hasChildren ? 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200' : 'invisible'}`}
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

        {/* Botón crear sub-nota */}
        <button
          onClick={(e) => { e.stopPropagation(); onCreateChild(note.id); }}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
          title="Crear sub-nota"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        {/* Botón eliminar nota */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(note.id, note.title); }}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400 transition-all"
          title="Eliminar nota"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {isDragOver && dragPosition === 'below' && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10 pointer-events-none" />
      )}

      {/* Hijos */}
      {hasChildren && isExpanded && (
        <div>
          {children}
        </div>
      )}
    </div>
  );
};

export default NoteTreeItem;
