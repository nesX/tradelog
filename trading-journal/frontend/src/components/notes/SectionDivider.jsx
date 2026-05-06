import { useState, useRef, useEffect } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ChevronDown, ChevronRight, MoreHorizontal, GripVertical, Pencil, Trash2 } from 'lucide-react';
import { useSectionCollapsed } from '../../hooks/useSectionCollapsed.js';

const SectionDivider = ({
  section,
  children,
  itemCount,
  overInfo,
  onRename,
  onDelete,
}) => {
  const [collapsed, toggle] = useSectionCollapsed(section.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(section.title);
  const renameInputRef = useRef(null);
  const menuRef = useRef(null);

  const isOverThis = overInfo?.noteId === section.id;
  const zone = isOverThis ? overInfo.zone : null;

  const { setNodeRef: setDragRef, attributes, listeners, isDragging } = useDraggable({
    id: section.id,
    data: { type: 'section' },
  });

  const { setNodeRef: setDropRef } = useDroppable({
    id: `section-drop-${section.id}`,
    data: { noteId: section.id, type: 'section' },
  });

  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const handleRenameCommit = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== section.title) onRename(section.id, trimmed);
    setRenaming(false);
  };

  const handleRenameKeyDown = (e) => {
    if (e.key === 'Enter') handleRenameCommit();
    if (e.key === 'Escape') {
      setRenameValue(section.title);
      setRenaming(false);
    }
  };

  return (
    <div
      ref={setDragRef}
      style={{ opacity: isDragging ? 0.35 : 1 }}
      className="relative mt-3 border-t border-gray-900 dark:border-gray-900 pt-1"
    >
      {/* Indicador inserción arriba */}
      {zone === 'sibling-above' && (
        <div className="absolute -top-px inset-x-1 h-0.5 bg-blue-500 rounded-full z-20 pointer-events-none" />
      )}

      {/* Header del divisor */}
      <div
        ref={setDropRef}
        className="group flex items-center gap-1 px-2 py-1 cursor-pointer select-none"
        onClick={() => !renaming && toggle()}
      >
        {/* Grip */}
        <span
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 transition-opacity"
          aria-label="Arrastrar sección"
        >
          <GripVertical className="w-3 h-3" />
        </span>

        {/* Chevron */}
        <span className="flex-shrink-0 text-gray-400 dark:text-gray-500">
          {collapsed
            ? <ChevronRight className="w-3 h-3" />
            : <ChevronDown className="w-3 h-3" />}
        </span>

        {/* Título o input de rename */}
        {renaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameCommit}
            onKeyDown={handleRenameKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-transparent text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300 outline-none border-b border-blue-400"
          />
        ) : (
          <span className="flex-1 truncate text-xs font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-200">
            {section.title}
          </span>
        )}

        {/* Menú 3 puntos */}
        {!renaming && (
          <div className="relative flex-shrink-0" ref={menuRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-all text-gray-400 dark:text-gray-500"
              title="Opciones de sección"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-5 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[130px]">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    setRenameValue(section.title);
                    setRenaming(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Pencil className="w-3 h-3" /> Renombrar
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onDelete(section.id, section.title, itemCount);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                >
                  <Trash2 className="w-3 h-3" /> Eliminar
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Indicador inserción abajo */}
      {zone === 'sibling-below' && (
        <div className="absolute -bottom-px inset-x-1 h-0.5 bg-blue-500 rounded-full z-20 pointer-events-none" />
      )}

      {/* Contenido (notas de la sección) */}
      {!collapsed && (
        <div>
          {children}
        </div>
      )}
    </div>
  );
};

export default SectionDivider;
