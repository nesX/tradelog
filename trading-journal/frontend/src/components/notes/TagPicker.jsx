import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Plus } from 'lucide-react';
import GroupedTagList from './GroupedTagList.jsx';
import { useNoteTags, useCreateTag } from '../../hooks/useNotes.js';
import { TAG_GROUPS, DEFAULT_TAG_GROUP, groupTags, filterTags } from '../../constants/tagGroups.js';

/**
 * Popover para elegir tags (de una nota o de un bloque): buscar, alternar y crear.
 *
 * - "Buscar o crear tag…" filtra en cliente sobre los tags del usuario.
 * - Si el texto no coincide con ningún tag (sin distinguir mayúsculas), ofrece
 *   "Crear «texto» en:" con un botón por grupo; crear lo asigna en el mismo flujo.
 *   Un nombre repetido lo informa el toast global de mutaciones.
 * - Teclado: ↑/↓ recorren tags y opciones de crear, Enter alterna o crea, Esc cierra.
 * - Click fuera cierra, salvo sobre `anchorRef` o sobre un elemento con
 *   `data-tag-picker-toggle`: los botones que lo abren lo cierran ellos mismos
 *   (si no, el click fuera lo cerraría y el mismo click lo volvería a abrir).
 *
 * Se posiciona absoluto respecto del contenedor `relative` del llamador
 * (`className` decide el anclaje).
 *
 * @param {number[]} props.selectedIds
 * @param {(tag) => void} props.onToggle - recibe el tag completo
 * @param {() => void} props.onClose
 * @param {React.RefObject} [props.anchorRef]
 * @param {string} [props.className]
 */
const TagPicker = ({ selectedIds = [], onToggle, onClose, anchorRef = null, className = 'left-0 top-full mt-1' }) => {
  const { data: allTags = [], isLoading } = useNoteTags();
  const createTag = useCreateTag();
  const [text, setText] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef(null);
  const inputRef = useRef(null);

  const trimmed = text.trim();
  const visibleTags = useMemo(() => groupTags(filterTags(allTags, text)).flatMap((g) => g.tags), [allTags, text]);
  const showCreate = trimmed !== '' && !allTags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase());
  const options = useMemo(
    () => [
      ...visibleTags.map((tag) => ({ type: 'tag', tag })),
      ...(showCreate ? TAG_GROUPS.map((group) => ({ type: 'create', group })) : []),
    ],
    [visibleTags, showCreate]
  );
  const active = options[Math.min(activeIndex, options.length - 1)] ?? null;

  // Al cambiar el texto: primer tag, o "crear en Libre" si no queda ninguno.
  useEffect(() => {
    const libre = TAG_GROUPS.findIndex((g) => g.key === DEFAULT_TAG_GROUP);
    setActiveIndex(visibleTags.length === 0 && showCreate ? libre : 0);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  // Foco solo con mouse/teclado: en táctil abriría el teclado en pantalla.
  useEffect(() => {
    if (window.matchMedia?.('(hover: hover)').matches) inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current?.contains(e.target) || anchorRef?.current?.contains(e.target)) return;
      if (e.target.closest?.('[data-tag-picker-toggle]')) return;
      onClose();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [onClose, anchorRef]);

  useEffect(() => {
    if (!active || !ref.current) return;
    const selector =
      active.type === 'tag' ? `[data-tag-id="${active.tag.id}"]` : `[data-create-group="${active.group.key}"]`;
    ref.current.querySelector(selector)?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const handleCreate = async (group) => {
    if (!trimmed || createTag.isPending) return;
    try {
      const res = await createTag.mutateAsync({ name: trimmed, color: group.defaultColor, group_key: group.key });
      onToggle(res.data);
      setText('');
    } catch {
      // El toast global de mutaciones informa (p. ej. "Ya existe un tag con ese nombre").
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (options.length === 0) return;
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((i) => (Math.min(i, options.length - 1) + delta + options.length) % options.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!active) return;
      if (active.type === 'tag') {
        onToggle(active.tag);
        setText('');
      } else {
        handleCreate(active.group);
      }
    }
  };

  return (
    <div
      ref={ref}
      className={`absolute z-30 w-72 max-w-[calc(100vw-2rem)] p-2
                  bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                  rounded-xl shadow-lg ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 px-2 py-1.5 mb-2 rounded-lg bg-gray-100 dark:bg-gray-700">
        <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={100}
          placeholder="Buscar o crear tag…"
          aria-label="Buscar o crear tag"
          className="flex-1 min-w-0 bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none"
        />
      </div>

      <div className="max-h-60 overflow-y-auto px-1">
        {isLoading ? (
          <p className="py-1 text-xs text-gray-400">Cargando tags…</p>
        ) : (
          <GroupedTagList
            tags={allTags}
            selectedIds={selectedIds}
            onToggle={onToggle}
            filterText={text}
            activeId={active?.type === 'tag' ? active.tag.id : null}
            emptyText={
              allTags.length === 0
                ? 'Todavía no hay tags. Escribe un nombre para crear uno.'
                : showCreate
                  ? null
                  : 'Ningún tag coincide.'
            }
          />
        )}
      </div>

      {showCreate && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          <p className="mb-1.5 px-1 text-xs text-gray-500 dark:text-gray-400 break-words">
            Crear «<span className="font-medium text-gray-700 dark:text-gray-200">{trimmed}</span>» en:
          </p>
          <div className="flex flex-wrap gap-1">
            {TAG_GROUPS.map((group) => {
              const isActive = active?.type === 'create' && active.group.key === group.key;
              const isDefault = group.key === DEFAULT_TAG_GROUP;
              return (
                <button
                  key={group.key}
                  type="button"
                  data-create-group={group.key}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleCreate(group)}
                  disabled={createTag.isPending}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-colors
                    disabled:opacity-50
                    ${
                      isDefault
                        ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                        : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
                    }
                    ${isActive ? 'ring-2 ring-blue-400 ring-offset-1 dark:ring-offset-gray-800' : ''}`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: group.defaultColor }} />
                  {group.label}
                  {isDefault && <Plus className="w-3 h-3" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default TagPicker;
