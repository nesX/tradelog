import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, X, BookOpen, BookMarked, ExternalLink, AlertCircle } from 'lucide-react';
import BlockContent from './BlockContent.jsx';
import BlockTags from './BlockTags.jsx';
import { useNoteBlock, noteBlockQuery, noteKeys } from '../../hooks/useNotes.js';
import { useToggleRevisit } from '../../hooks/useBlockRevisit.js';
import { revisitKeys } from '../../hooks/useRevisit.js';
import { useSequenceNavigation } from '../../hooks/useSequenceNavigation.js';

const API_BASE = import.meta.env.VITE_API_URL || '';
const IMAGE_TYPES = ['image_gallery', 'image'];

const navButtonClass = `p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100
  dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors
  disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`;

// Precarga un bloque y, si es de imágenes, su primera imagen: repasar gráficos es
// el caso principal y así la siguiente aparece sin esperar.
const prefetchBlock = (qc, blockId) => {
  qc.prefetchQuery(noteBlockQuery(blockId)).then(() => {
    const block = qc.getQueryData(noteKeys.block(blockId))?.data;
    const first = block && IMAGE_TYPES.includes(block.block_type) ? block.images?.[0] : null;
    if (first) new Image().src = `${API_BASE}/api/images/${first.image_path}`;
  });
};

/**
 * Visor a pantalla completa que recorre una lista fija de bloques, en solo
 * lectura, con los tags y la marca de repaso editables en el pie.
 *
 * - La lista se congela al abrir: desmarcar o cambiar tags durante el repaso no
 *   mueve el índice ni el contador. Al salir se refresca Repaso.
 * - Overlay en un portal (z-40): tapa el header de la app y deja encima los
 *   toasts y el lightbox (z-50). La pestaña de debajo conserva filtros y scroll.
 * - Teclado: ←/→ navegan y Esc sale, salvo con el TagPicker o un lightbox abiertos.
 *
 * @param {number[]} props.blockIds
 * @param {number}   [props.initialIndex]
 * @param {string}   props.title
 * @param {() => void} props.onExit
 */
const BlockReviewViewer = ({ blockIds, initialIndex = 0, title, onExit }) => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [ids] = useState(() => [...blockIds]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const { index, next, prev, hasNext, hasPrev } = useSequenceNavigation({
    length: ids.length,
    initialIndex,
    onExit,
    enabled: !tagsOpen && !lightboxOpen,
  });
  const blockId = ids[index];
  const { data: block, isLoading, error, refetch } = useNoteBlock(blockId);
  const toggleRevisit = useToggleRevisit();

  // Al cambiar de bloque: picker cerrado y vecinos precargados.
  useEffect(() => {
    setTagsOpen(false);
    setLightboxOpen(false);
    if (hasNext) prefetchBlock(qc, ids[index + 1]);
    if (hasPrev) prefetchBlock(qc, ids[index - 1]);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bloquear el scroll de la página de debajo; al salir (por cualquier camino,
  // también "Abrir en la nota"), refrescar marcados y repaso por tag.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      qc.invalidateQueries({ queryKey: revisitKeys.all });
    };
  }, [qc]);

  const openInNote = () => {
    navigate(`/notes/${block.note_id}?highlight=${block.id}`);
    onExit();
  };

  const marked = Boolean(block?.marked_for_revisit);

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex flex-col bg-gray-50 dark:bg-gray-900"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Cabecera */}
      <header className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <h2 className="flex-1 min-w-0 truncate text-sm sm:text-base font-semibold text-gray-900 dark:text-white">
          {title}
        </h2>
        <span className="flex-shrink-0 text-sm tabular-nums text-gray-500 dark:text-gray-400">
          {index + 1} / {ids.length}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={prev} disabled={!hasPrev} className={navButtonClass} title="Bloque anterior (←)">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={next} disabled={!hasNext} className={navButtonClass} title="Bloque siguiente (→)">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <button
          onClick={onExit}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-300
                     hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Salir (Esc)"
        >
          <X className="w-4 h-4" />
          <span className="hidden sm:inline">Salir</span>
        </button>
      </header>

      {/* Bloque */}
      <main className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-4xl mx-auto px-2 sm:px-4 py-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-24 text-gray-400">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-24 text-center text-gray-400 dark:text-gray-500">
              <AlertCircle className="w-6 h-6" />
              {error.status === 404 ? (
                <p className="text-sm">Este bloque ya no existe</p>
              ) : (
                <>
                  <p className="text-sm">No se pudo cargar el bloque</p>
                  <button onClick={() => refetch()} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                    Reintentar
                  </button>
                </>
              )}
            </div>
          ) : (
            block && (
              <BlockContent
                key={block.id}
                block={block}
                noteId={block.note_id}
                readOnly
                onLightboxChange={setLightboxOpen}
              />
            )
          )}
        </div>
      </main>

      {/* Pie: nota, tags y marca de repaso */}
      {block && !error && (
        <footer className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 sm:px-4 py-3">
          <div className="max-w-4xl mx-auto space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <BookOpen className="w-4 h-4 flex-shrink-0 text-gray-400" />
                <span className="truncate text-sm text-gray-600 dark:text-gray-300">
                  {block.note?.title || 'Sin título'}
                </span>
                <button
                  onClick={openInNote}
                  className="flex-shrink-0 inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir en la nota
                </button>
              </div>
              <button
                onClick={() => toggleRevisit.mutate({ blockId: block.id, markedForRevisit: !marked })}
                aria-pressed={marked}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm border transition-colors
                  ${marked
                    ? 'border-blue-500 dark:border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
                    : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-300 hover:text-blue-500'
                  }`}
              >
                <BookMarked className="w-4 h-4" fill={marked ? 'currentColor' : 'none'} />
                Marcado para repaso
              </button>
            </div>
            <BlockTags
              key={block.id}
              block={block}
              noteId={block.note_id}
              showAdd
              open={tagsOpen}
              onOpenChange={setTagsOpen}
              pickerClassName="left-0 bottom-full mb-1"
            />
          </div>
        </footer>
      )}
    </div>,
    document.body
  );
};

export default BlockReviewViewer;
