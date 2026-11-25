import { useState } from 'react';
import { Tag } from 'lucide-react';
import NoteTagBadge from './NoteTagBadge.jsx';
import TagPicker from './TagPicker.jsx';
import { useAddBlockTag, useRemoveBlockTag } from '../../hooks/useBlockTags.js';

/**
 * Tags de un bloque: una fila de badges pequeños en orden canónico (solo si el
 * bloque tiene tags); un click en la fila abre el TagPicker. Lo usan el editor
 * y el pie del visor de repaso.
 *
 * El picker puede controlarlo el padre (`open` / `onOpenChange`). En el editor
 * (`showList={false}`) no hay fila: el picker lo abren el botón "Tags" de la
 * grilla de acciones y el menú táctil, y se ancla bajo el bloque. Con `showAdd`,
 * un bloque sin tags muestra un botón "Agregar tag" (el visor no tiene otra forma
 * de abrirlo). Los bloques de referencia no llevan tags.
 *
 * @param {object} props.block   - bloque con `id`, `block_type` y `tags`
 * @param {number} props.noteId  - nota del bloque (para actualizar su caché)
 * @param {string} [props.pickerClassName] - anclaje del picker (en el pie del
 *   visor se abre hacia arriba)
 */
const BlockTags = ({
  block,
  noteId,
  open,
  onOpenChange,
  showList = true,
  showAdd = false,
  className = '',
  pickerClassName,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const target = { noteId, blockId: block.id };
  const addTag = useAddBlockTag(target);
  const removeTag = useRemoveBlockTag(target);

  if (block.block_type === 'reference') return null;

  const tags = block.tags || [];
  const showRow = showList && (tags.length > 0 || showAdd);
  if (!showRow && !isOpen) return null;

  const handleToggle = (tag) => {
    if (tags.some((t) => t.id === tag.id)) removeTag.mutate(tag);
    else addTag.mutate(tag);
  };

  return (
    <div className={`relative ${className}`}>
      {!showList ? null : tags.length > 0 ? (
        <button
          type="button"
          data-tag-picker-toggle
          onClick={() => setOpen(!isOpen)}
          className="flex flex-wrap items-center gap-1 text-left rounded-md
                     hover:opacity-80 transition-opacity"
          title="Editar tags del bloque"
          aria-expanded={isOpen}
        >
          {tags.map((tag) => (
            <NoteTagBadge key={tag.id} tag={tag} size="sm" />
          ))}
        </button>
      ) : (
        showAdd && (
          <button
            type="button"
            data-tag-picker-toggle
            onClick={() => setOpen(!isOpen)}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded
                       border border-dashed border-gray-300 dark:border-gray-600
                       text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-500
                       dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors"
            aria-expanded={isOpen}
          >
            <Tag className="w-3 h-3" />
            Agregar tag
          </button>
        )
      )}

      {isOpen && (
        <TagPicker
          selectedIds={tags.map((t) => t.id)}
          onToggle={handleToggle}
          onClose={() => setOpen(false)}
          className={pickerClassName}
        />
      )}
    </div>
  );
};

export default BlockTags;
