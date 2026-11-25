import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookMarked, Play, Tags, Search, FileQuestion } from 'lucide-react';
import { useRevisit, useTagReviewBlocks } from '../hooks/useRevisit.js';
import { useToggleRevisit } from '../hooks/useBlockRevisit.js';
import { useNoteTags } from '../hooks/useNotes.js';
import { BLOCK_OPTIONS } from '../hooks/useBlockInserter.js';
import { TimeRangeTabs, BlockItem } from '../components/notes/blockReviewShared.jsx';
import GroupedTagList from '../components/notes/GroupedTagList.jsx';
import BlockReviewViewer from '../components/notes/BlockReviewViewer.jsx';
import {
  REVIEW_ORDERS,
  parseTagIdsParam,
  formatTagIdsParam,
  parseOrderParam,
  shuffle,
  sortReviewItems,
  buildReviewTitle,
} from '../utils/tagReview.js';

const TABS = [
  { key: 'marked', label: 'Marcados', icon: BookMarked },
  { key: 'tags', label: 'Por tag', icon: Tags },
];

const Spinner = () => (
  <div className="flex items-center justify-center py-10 text-gray-400">
    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

const reviewButtonClass = `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
  bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50`;

function RepasoBlockItem({ block }) {
  const { mutate, isPending } = useToggleRevisit();

  const action = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        mutate({ blockId: block.id, markedForRevisit: false });
      }}
      disabled={isPending}
      className="flex-shrink-0 px-2 py-1 text-xs rounded-lg
                 border border-blue-500 dark:border-blue-600
                 text-blue-600 dark:text-blue-400
                 hover:bg-blue-50 dark:hover:bg-blue-900/30
                 disabled:opacity-50 transition-colors"
    >
      Repasado
    </button>
  );

  return (
    <BlockItem
      block={block}
      LeadingIcon={BookMarked}
      leadingIconClass="text-blue-500"
      action={action}
    />
  );
}

// ── Pestaña "Marcados": los bloques marcados para repaso ──
function MarkedTab({ onOpenViewer }) {
  const [pendingHours, setPendingHours] = useState(null); // null = "Todos"
  const { data, isLoading } = useRevisit(pendingHours);
  const blocks = data?.blocks || [];

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            Bloques para repasar
          </h2>
          {!isLoading && data && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full
                             bg-blue-100 dark:bg-blue-900/40
                             text-blue-700 dark:text-blue-400">
              {blocks.length}
            </span>
          )}
          {blocks.length > 0 && (
            <button
              onClick={() =>
                onOpenViewer({ blockIds: blocks.map((b) => b.id), initialIndex: 0, title: 'Marcados para repaso' })
              }
              className="ml-1 inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg
                         text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              Repasar en visor
            </button>
          )}
        </div>
        <TimeRangeTabs value={pendingHours} onChange={setPendingHours} includeAll />
      </div>

      {isLoading ? (
        <Spinner />
      ) : blocks.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic py-4">
          {pendingHours === null
            ? 'No hay bloques marcados para repasar.'
            : 'No hay bloques para repasar en este rango.'}
        </p>
      ) : (
        <div className="space-y-2">
          {blocks.map((block) => (
            <RepasoBlockItem key={block.id} block={block} />
          ))}
        </div>
      )}
    </section>
  );
}

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

const BLOCK_TYPE_INFO = Object.fromEntries(BLOCK_OPTIONS.map((o) => [o.type, o]));

function TagReviewRow({ item, onOpen }) {
  const info = BLOCK_TYPE_INFO[item.block_type];
  const Icon = info?.icon ?? FileQuestion;
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left
                 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800
                 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${info?.color ?? 'text-gray-400'}`} />
      <div className="flex-1 min-w-0">
        <p className={`truncate text-sm ${item.preview ? 'text-gray-800 dark:text-gray-100' : 'italic text-gray-400'}`}>
          {item.preview || info?.label || item.block_type}
        </p>
        <p className="truncate text-xs text-gray-400 dark:text-gray-500">
          {item.note_title || 'Sin título'} · {formatDate(item.created_at)}
        </p>
      </div>
      {item.marked_for_revisit && (
        <BookMarked className="w-4 h-4 flex-shrink-0 text-blue-500" fill="currentColor" aria-label="Marcado para repaso" />
      )}
    </button>
  );
}

// ── Pestaña "Por tag": bloques que cumplen una combinación de tags ──
function TagsTab({ selectedIds, order, tagsLoaded, allTags, onChangeSelection, onChangeOrder, onOpenViewer }) {
  const [filterText, setFilterText] = useState('');
  const { data, isLoading, isFetching, isPlaceholderData, error } = useTagReviewBlocks(selectedIds);
  const items = useMemo(() => (selectedIds.length > 0 ? data?.items ?? [] : []), [data, selectedIds.length]);

  // Aleatorio: se baraja una vez por conjunto de resultados (o al elegir el orden),
  // no en cada refetch; si no, la invalidación al salir del visor lo barajaría.
  const idsKey = items
    .map((i) => i.block_id)
    .sort((a, b) => a - b)
    .join(',');
  const randomOrder = useMemo(
    () => (order === 'random' && idsKey ? shuffle(idsKey.split(',').map(Number)) : []),
    [idsKey, order]
  );
  const sorted = useMemo(() => sortReviewItems(items, order, randomOrder), [items, order, randomOrder]);

  const selectedTags = allTags.filter((t) => selectedIds.includes(t.id));
  const title = buildReviewTitle(selectedTags);
  const openViewer = (initialIndex) =>
    onOpenViewer({ blockIds: sorted.map((i) => i.block_id), initialIndex, title });

  const toggleTag = (tag) =>
    onChangeSelection(
      selectedIds.includes(tag.id) ? selectedIds.filter((id) => id !== tag.id) : [...selectedIds, tag.id]
    );

  return (
    <div className="space-y-5">
      {/* Selector */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700">
            <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filtrar tags…"
              aria-label="Filtrar tags"
              className="flex-1 min-w-0 bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none"
            />
          </div>
          {selectedIds.length > 0 && (
            <button
              onClick={() => onChangeSelection([])}
              className="flex-shrink-0 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Limpiar
            </button>
          )}
        </div>
        {!tagsLoaded ? (
          <Spinner />
        ) : (
          <GroupedTagList
            tags={allTags}
            selectedIds={selectedIds}
            onToggle={toggleTag}
            filterText={filterText}
            emptyText={allTags.length === 0 ? 'Todavía no hay tags.' : 'Ningún tag coincide.'}
          />
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Mismo grupo: cualquiera · Grupos distintos: todos a la vez
        </p>
      </section>

      {/* Resultado */}
      {selectedIds.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic py-2">Elige uno o más tags para empezar</p>
      ) : isLoading ? (
        <Spinner />
      ) : error ? (
        <p className="text-sm text-red-500 py-2">{error.message || 'No se pudo cargar el repaso.'}</p>
      ) : (
        <section className={`space-y-3 transition-opacity ${isPlaceholderData && isFetching ? 'opacity-60' : ''}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {data.truncated
                ? `mostrando ${data.items.length} de ${data.total}`
                : `${data.total} bloque${data.total !== 1 ? 's' : ''}`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1" role="group" aria-label="Orden">
                {REVIEW_ORDERS.map((o) => (
                  <button
                    key={o.key}
                    onClick={() => onChangeOrder(o.key)}
                    aria-pressed={order === o.key}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-colors
                      ${order === o.key
                        ? 'bg-blue-50 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-medium'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {sorted.length > 0 && (
                <button onClick={() => openViewer(0)} className={reviewButtonClass}>
                  <Play className="w-4 h-4" />
                  Repasar ({sorted.length})
                </button>
              )}
            </div>
          </div>

          {sorted.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic py-2">
              Ningún bloque tiene esa combinación de tags.
            </p>
          ) : (
            <div className="space-y-1.5">
              {sorted.map((item, idx) => (
                <TagReviewRow key={item.block_id} item={item} onOpen={() => openViewer(idx)} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * Repaso: los bloques marcados y el repaso por combinación de tags. La pestaña,
 * los tags y el orden viven en la URL (?tab=tags&tags=1,4,7&order=chrono), así un
 * enlace guardado repite la consulta. Se usa como página (/repaso) y embebida en
 * Notes.jsx, que la muestra también cuando la URL trae tab=tags.
 */
export default function Repaso() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewer, setViewer] = useState(null); // { blockIds, initialIndex, title }
  const { data: allTags = [], isSuccess: tagsLoaded } = useNoteTags();

  const tab = searchParams.get('tab') === 'tags' ? 'tags' : 'marked';
  const order = parseOrderParam(searchParams.get('order'));
  // Ids de la URL que siguen existiendo: un marcador con un tag borrado no da 400.
  // Hasta que cargan los tags no se consulta (si no, se descartaría todo).
  const selectedIds = useMemo(() => {
    if (!tagsLoaded) return [];
    const known = new Set(allTags.map((t) => t.id));
    return parseTagIdsParam(searchParams.get('tags')).filter((id) => known.has(id));
  }, [searchParams, allTags, tagsLoaded]);

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

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <BookMarked className="w-5 h-5 text-blue-500" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Repaso</h1>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700" role="tablist">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => updateParams({ tab: key === 'tags' ? 'tags' : null })}
            className={`-mb-px inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors
              ${tab === key
                ? 'border-blue-500 text-blue-600 dark:text-blue-400 font-medium'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'marked' ? (
        <MarkedTab onOpenViewer={setViewer} />
      ) : (
        <TagsTab
          selectedIds={selectedIds}
          order={order}
          tagsLoaded={tagsLoaded}
          allTags={allTags}
          onChangeSelection={(ids) => updateParams({ tags: formatTagIdsParam(ids), order })}
          onChangeOrder={(key) => updateParams({ order: key })}
          onOpenViewer={setViewer}
        />
      )}

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
