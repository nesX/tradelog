import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, X, Play, Tags, ChevronDown, FileText, FileQuestion } from 'lucide-react';
import { useNoteSearch, useNoteTags, useNoteTree, useTagGroups } from '../hooks/useNotes.js';
import { BLOCK_OPTIONS } from '../hooks/useBlockInserter.js';
import NoteTagBadge from '../components/notes/NoteTagBadge.jsx';
import GroupedTagList from '../components/notes/GroupedTagList.jsx';
import BlockReviewViewer from '../components/notes/BlockReviewViewer.jsx';
import { sortTags } from '../utils/tagGroups.js';
import { sanitizeHighlight } from '../utils/sanitizeHighlight.js';
import { buildBreadcrumb } from '../utils/notesGrouping.js';
import { parseTagIdsParam, formatTagIdsParam } from '../utils/tagReview.js';
import { hasSearchText, formatSearchSummary, buildSearchTitle } from '../utils/noteSearch.js';

const BLOCK_TYPE_INFO = Object.fromEntries(BLOCK_OPTIONS.map((o) => [o.type, o]));

const reviewButtonClass = `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
  bg-blue-600 hover:bg-blue-700 text-white transition-colors`;

const Spinner = () => (
  <div className="flex items-center justify-center py-10">
    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

const Hint = ({ children }) => (
  <p className="py-10 text-center text-reading/snug text-gray-500 dark:text-gray-400">{children}</p>
);

// Texto de ts_headline: solo deja pasar los <b> del resaltado (ver sanitizeHighlight).
const HighlightedText = ({ html, fallback }) => {
  if (!html) return <span>{fallback}</span>;
  return (
    <span
      dangerouslySetInnerHTML={{ __html: sanitizeHighlight(html) }}
      className="[&_b]:font-semibold [&_b]:text-blue-600 dark:[&_b]:text-blue-400"
    />
  );
};

/** Tags por grupo con su filtro de texto: columna derecha en lg+, desplegable debajo. */
function TagPanel({ allTags, tagsLoaded, selectedIds, onToggle }) {
  const [filterText, setFilterText] = useState('');
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 space-y-3">
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700">
        <SearchIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <input
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filtrar tags…"
          aria-label="Filtrar tags"
          className="flex-1 min-w-0 bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400 outline-none"
        />
      </div>
      {!tagsLoaded ? (
        <Spinner />
      ) : (
        <GroupedTagList
          tags={allTags}
          selectedIds={selectedIds}
          onToggle={onToggle}
          filterText={filterText}
          size="lg"
          emptyText={allTags.length === 0 ? 'Todavía no hay tags.' : 'Ningún tag coincide.'}
        />
      )}
      <p className="text-xs text-gray-600 dark:text-gray-300">Mismo grupo: cualquiera · Grupos distintos: todos a la vez</p>
    </div>
  );
}

function ResultBlock({ noteId, block }) {
  const info = BLOCK_TYPE_INFO[block.block_type];
  const Icon = info?.icon ?? FileQuestion;
  return (
    <Link
      to={`/notes/${noteId}?highlight=${block.block_id}`}
      className="flex gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
    >
      <Icon className={`w-4 h-4 mt-1 flex-shrink-0 ${info?.color ?? 'text-gray-400'}`} />
      <div className="flex-1 min-w-0 space-y-1">
        {block.snippet && (
          <p className="text-reading/snug text-gray-800 dark:text-gray-100 line-clamp-2 break-words">
            <HighlightedText html={block.snippet} />
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-600 dark:text-gray-300">{info?.label ?? block.block_type}</span>
          {block.tags.map((tag) => (
            <NoteTagBadge key={tag.id} tag={tag} size="sm" />
          ))}
        </div>
      </div>
    </Link>
  );
}

function NoteResult({ note, flat, onReviewNote }) {
  const breadcrumb = buildBreadcrumb(note.parent_note_id, flat);
  const moreCount = note.block_count - note.blocks.length;
  return (
    <article className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <Link to={`/notes/${note.id}`} className="group flex items-start gap-2 px-3 pt-3 pb-2">
        <FileText className="w-4 h-4 mt-1 flex-shrink-0 text-gray-400 group-hover:text-blue-500 transition-colors" />
        <div className="min-w-0">
          <p className="text-reading/snug font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 break-words">
            <HighlightedText html={note.title_headline} fallback={note.title || 'Sin título'} />
          </p>
          {breadcrumb && <p className="text-xs text-gray-600 dark:text-gray-300 truncate">{breadcrumb}</p>}
        </div>
      </Link>
      {note.blocks.length > 0 && (
        <div className="px-1 pb-1">
          {note.blocks.map((block) => (
            <ResultBlock key={block.block_id} noteId={note.id} block={block} />
          ))}
        </div>
      )}
      {moreCount > 0 && note.block_ids.length > 0 && (
        <button
          onClick={() => onReviewNote(note)}
          className="w-full flex items-center gap-1.5 px-4 py-2 border-t border-gray-100 dark:border-gray-700 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-b-xl transition-colors"
        >
          <Play className="w-3.5 h-3.5" />+{moreCount} bloque{moreCount !== 1 ? 's' : ''} más
        </button>
      )}
    </article>
  );
}

/**
 * Búsqueda en notas: texto (títulos y contenido, con prefijo mientras se escribe)
 * y tags de bloque (OR dentro de un grupo, AND entre grupos). Resultados por bloque,
 * agrupados por nota.
 *
 * La consulta vive en la URL (/buscar?q=…&tags=1,4,7): Atrás desde una nota vuelve
 * a la misma búsqueda y un enlace guardado la repite. El input tiene estado local y
 * llega a la URL con 400 ms de debounce.
 */
export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQ = searchParams.get('q') ?? '';
  const urlTagIds = useMemo(() => parseTagIdsParam(searchParams.get('tags')), [searchParams]);
  const [input, setInput] = useState(urlQ);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [viewer, setViewer] = useState(null); // { blockIds, initialIndex, title }
  const inputRef = useRef(null);

  const { data: allTags = [], isSuccess: tagsLoaded } = useNoteTags();
  const { data: tagGroups } = useTagGroups();
  const { data: treeData } = useNoteTree();

  const updateParams = (patch) =>
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value == null || value === '') params.delete(key);
          else params.set(key, value);
        }
        return params;
      },
      { replace: true }
    );

  // Input → URL, 400 ms después de dejar de escribir.
  useEffect(() => {
    const value = input.trim();
    if (value === urlQ) return undefined;
    const timer = setTimeout(() => updateParams({ q: value }), 400);
    return () => clearTimeout(timer);
  }, [input, urlQ]); // eslint-disable-line react-hooks/exhaustive-deps

  // URL → input cuando cambia por fuera (Atrás/Adelante, la lupa del header).
  useEffect(() => {
    setInput((current) => (current.trim() === urlQ ? current : urlQ));
  }, [urlQ]);

  // Los ids de la URL que ya no existen se descartan, pero solo cuando cargaron los
  // tags: antes no se consulta (si no, al recargar se perdería la selección).
  const selectedIds = useMemo(() => {
    if (!tagsLoaded) return urlTagIds;
    const known = new Set(allTags.map((t) => t.id));
    return urlTagIds.filter((id) => known.has(id));
  }, [urlTagIds, allTags, tagsLoaded]);
  const selectedTags = useMemo(
    () => sortTags(allTags.filter((t) => selectedIds.includes(t.id)), tagGroups),
    [allTags, selectedIds, tagGroups]
  );
  const waitingTags = !tagsLoaded && urlTagIds.length > 0;

  const q = hasSearchText(urlQ) ? urlQ : '';
  const hasQuery = Boolean(q) || selectedIds.length > 0;
  const { data, isLoading, isFetching, isPlaceholderData, error } = useNoteSearch({
    q,
    tagIds: selectedIds,
    enabled: !waitingTags,
  });

  const toggleTag = (tag) =>
    updateParams({
      tags: formatTagIdsParam(
        selectedIds.includes(tag.id) ? selectedIds.filter((id) => id !== tag.id) : [...selectedIds, tag.id]
      ),
    });

  const clearAll = () => {
    setInput('');
    updateParams({ q: null, tags: null });
    inputRef.current?.focus();
  };

  const reviewIds = useMemo(() => data?.notes.flatMap((n) => n.block_ids) ?? [], [data]);
  const title = buildSearchTitle(q, selectedTags, tagGroups);

  let results;
  if (!hasQuery) {
    results = <Hint>Escribe para buscar en títulos y contenido, o elige tags</Hint>;
  } else if (waitingTags || isLoading) {
    results = <Spinner />;
  } else if (error) {
    results = <p className="py-4 text-sm text-red-600 dark:text-red-400">{error.message || 'No se pudo buscar.'}</p>;
  } else if (data && data.notes.length === 0) {
    results = <Hint>Nada coincide con esta búsqueda.</Hint>;
  } else if (data) {
    results = (
      <div className={`space-y-3 transition-opacity ${isPlaceholderData && isFetching ? 'opacity-60' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">{formatSearchSummary(data)}</p>
          {reviewIds.length > 0 && (
            <button
              onClick={() => setViewer({ blockIds: reviewIds, initialIndex: 0, title })}
              className={reviewButtonClass}
            >
              <Play className="w-4 h-4" />
              Repasar ({reviewIds.length})
            </button>
          )}
        </div>
        {data.truncated && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Hay más bloques: Repasar recorre los primeros {reviewIds.length}.
          </p>
        )}
        {data.notes.map((note) => (
          <NoteResult
            key={note.id}
            note={note}
            flat={treeData?.flat}
            onReviewNote={(n) => setViewer({ blockIds: n.block_ids, initialIndex: 0, title: n.title || 'Sin título' })}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      {/* Buscador */}
      <div>
        <div className="relative">
          <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            // Enter busca sin esperar el debounce y, en el celular, cierra el teclado.
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              updateParams({ q: input.trim() });
              e.currentTarget.blur();
            }}
            // Al entrar desde la lupa; al volver con Atrás a una búsqueda, no (en el
            // celular el teclado taparía los resultados).
            autoFocus={!urlQ && urlTagIds.length === 0}
            placeholder="Buscar en notas…"
            aria-label="Buscar en notas"
            className="w-full pl-11 pr-11 py-3 text-lg rounded-xl
                       bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600
                       text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       [&::-webkit-search-cancel-button]:hidden"
          />
          {(input || selectedIds.length > 0) && (
            <button
              onClick={clearAll}
              title="Limpiar texto y tags"
              aria-label="Limpiar texto y tags"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <p className="mt-1.5 px-1 text-xs text-gray-600 dark:text-gray-300">
          <code>"frase exacta"</code> · <code>-palabra</code> para excluir · <code>or</code> entre alternativas
        </p>
      </div>

      {/* Los chips van en la columna de resultados: al elegir un tag, el panel de
          la derecha no se mueve (si no, el segundo click caía en otro tag). */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-6 lg:items-start">
        <div className="min-w-0 space-y-3">
          {/* Tags elegidos; el botón despliega el panel por debajo de lg */}
          <div className={`flex flex-wrap items-center gap-1.5 ${selectedTags.length === 0 ? 'lg:hidden' : ''}`}>
            <button
              onClick={() => setTagsOpen((v) => !v)}
              aria-expanded={tagsOpen}
              className="lg:hidden inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm border
                         border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200
                         hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Tags className="w-4 h-4" />
              Tags ({selectedIds.length})
              <ChevronDown className={`w-4 h-4 transition-transform ${tagsOpen ? 'rotate-180' : ''}`} />
            </button>
            {selectedTags.map((tag) => (
              <NoteTagBadge key={tag.id} tag={tag} onRemove={() => toggleTag(tag)} />
            ))}
          </div>
          {tagsOpen && (
            <div className="lg:hidden">
              <TagPanel allTags={allTags} tagsLoaded={tagsLoaded} selectedIds={selectedIds} onToggle={toggleTag} />
            </div>
          )}
          <section>{results}</section>
        </div>
        <aside className="hidden lg:block lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <TagPanel allTags={allTags} tagsLoaded={tagsLoaded} selectedIds={selectedIds} onToggle={toggleTag} />
        </aside>
      </div>

      {viewer && (
        <BlockReviewViewer
          blockIds={viewer.blockIds}
          initialIndex={viewer.initialIndex}
          title={viewer.title}
          onExit={() => setViewer(null)}
        />
      )}
    </div>
  );
}
