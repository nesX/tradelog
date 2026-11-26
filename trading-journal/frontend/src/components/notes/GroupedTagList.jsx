import { useMemo } from 'react';
import NoteTagBadge from './NoteTagBadge.jsx';
import { useTagGroups } from '../../hooks/useNotes.js';
import { groupTags, filterTags } from '../../utils/tagGroups.js';

/**
 * Tags agrupados por los grupos del usuario (Libre al final), con encabezado y
 * sin grupos vacíos. Mientras los grupos cargan, una sola lista por nombre sin
 * encabezado (no todo bajo Libre). Cada tag es un botón que alterna; los
 * seleccionados llevan un check y los demás se ven algo atenuados. Lo usan el
 * TagPicker (`size="lg"`, texto de 0.95rem), el repaso por tag y /buscar.
 *
 * @param {object[]} props.tags         - tags a mostrar ({ id, name, color, group_id })
 * @param {number[]} props.selectedIds  - ids marcados
 * @param {(tag) => void} props.onToggle
 * @param {string}  [props.filterText]  - filtra por nombre (sin mayúsculas ni tildes)
 * @param {boolean} [props.matchGroupNames] - el filtro también busca en el nombre
 *   del grupo (TagPicker)
 * @param {number}  [props.activeId]    - tag resaltado por teclado (TagPicker)
 * @param {string}  [props.emptyText]   - texto cuando no queda ningún tag
 * @param {'sm'|'lg'} [props.size]
 */
const GroupedTagList = ({
  tags,
  selectedIds = [],
  onToggle,
  filterText = '',
  matchGroupNames = false,
  activeId = null,
  emptyText = null,
  size = 'sm',
}) => {
  const { data: tagGroups } = useTagGroups();
  const groups = useMemo(
    () => groupTags(filterTags(tags, filterText, matchGroupNames ? tagGroups : undefined), tagGroups),
    [tags, filterText, matchGroupNames, tagGroups]
  );
  const selected = new Set(selectedIds);
  const large = size === 'lg';

  if (groups.length === 0) {
    return emptyText ? (
      <p className={`px-1 py-1 text-gray-600 dark:text-gray-300 ${large ? 'text-[0.95rem]' : 'text-xs'}`}>{emptyText}</p>
    ) : null;
  }

  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <div key={group.id ?? 'libre'}>
          {group.label && (
            <p
              className={`mb-1 font-semibold text-gray-600 dark:text-gray-300 ${
                large ? 'text-[0.95rem]' : 'text-xs uppercase tracking-wide'
              }`}
            >
              {group.label}
            </p>
          )}
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
                  className={`rounded transition-opacity ${
                    isSelected ? 'opacity-100' : 'opacity-80 hover:opacity-100'
                  } ${
                    activeId === tag.id
                      ? 'ring-2 ring-blue-400 ring-offset-1 dark:ring-offset-gray-800'
                      : isSelected
                        ? 'ring-1 ring-gray-900/20 dark:ring-white/30'
                        : ''
                  }`}
                >
                  <NoteTagBadge tag={tag} size={size} checked={isSelected} />
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
