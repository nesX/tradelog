import { useMemo } from 'react';
import NoteTagBadge from './NoteTagBadge.jsx';
import { groupTags, filterTags } from '../../constants/tagGroups.js';

/**
 * Tags agrupados por grupo (Activo, Tipo, …), con encabezado y sin grupos vacíos.
 * Presentacional: cada tag es un botón que alterna; los seleccionados se ven con
 * su color pleno y los demás atenuados. Lo usan el TagPicker y el selector del
 * repaso por tag.
 *
 * @param {object[]} props.tags         - tags a mostrar ({ id, name, color, group_key })
 * @param {number[]} props.selectedIds  - ids marcados
 * @param {(tag) => void} props.onToggle
 * @param {string}  [props.filterText]  - filtra por nombre (sin mayúsculas ni tildes)
 * @param {number}  [props.activeId]    - tag resaltado por teclado (TagPicker)
 * @param {string}  [props.emptyText]   - texto cuando no queda ningún tag
 */
const GroupedTagList = ({ tags, selectedIds = [], onToggle, filterText = '', activeId = null, emptyText = null }) => {
  const groups = useMemo(() => groupTags(filterTags(tags, filterText)), [tags, filterText]);
  const selected = new Set(selectedIds);

  if (groups.length === 0) {
    return emptyText ? <p className="px-1 py-1 text-xs text-gray-400 dark:text-gray-500">{emptyText}</p> : null;
  }

  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <div key={group.key}>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {group.label}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {group.tags.map((tag) => {
              const isSelected = selected.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  data-tag-id={tag.id}
                  // Sin robar el foco al input del picker (el teclado sigue ahí).
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onToggle(tag)}
                  aria-pressed={isSelected}
                  title={isSelected ? `Quitar ${tag.name}` : `Agregar ${tag.name}`}
                  className={`rounded-full transition-opacity ${
                    isSelected ? 'opacity-100' : 'opacity-50 hover:opacity-80'
                  } ${
                    activeId === tag.id
                      ? 'ring-2 ring-blue-400 ring-offset-1 dark:ring-offset-gray-800'
                      : isSelected
                        ? 'ring-1 ring-gray-900/20 dark:ring-white/30'
                        : ''
                  }`}
                >
                  <NoteTagBadge tag={tag} size="sm" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default GroupedTagList;
