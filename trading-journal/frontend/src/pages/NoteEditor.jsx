import { useState, useRef, useEffect } from 'react';
import { useParams, useSearchParams, useLocation } from 'react-router-dom';
import { Tag, Plus, Check, Pencil, BellRing } from 'lucide-react';
import {
  useNote,
  useNoteTree,
  useUpdateNoteTitle,
  useToggleNoteTag,
  useApplyNoteTagsToBlocks,
} from '../hooks/useNotes.js';
import NoteBlockList from '../components/notes/NoteBlockList.jsx';
import NoteBreadcrumb from '../components/notes/NoteBreadcrumb.jsx';
import NoteTagBadge from '../components/notes/NoteTagBadge.jsx';
import TagPicker from '../components/notes/TagPicker.jsx';
import { useToast } from '../components/common/Toast.jsx';
import NoteSaveIndicator from '../components/notes/NoteSaveIndicator.jsx';
import CopyReferenceButton from '../components/notes/CopyReferenceButton.jsx';
import ReminderModal from '../components/notes/ReminderModal.jsx';
import { ReminderChips } from '../components/notes/ReminderChip.jsx';
import { hasArmedReminders } from '../utils/reminders.js';

const NoteEditor = ({ embeddedId }) => {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const noteId = embeddedId ? parseInt(embeddedId) : parseInt(params.id);

  const { data: note, isLoading, error } = useNote(noteId);
  const { data: treeData } = useNoteTree();
  const updateTitle = useUpdateNoteTitle();
  const { toggle: toggleTag } = useToggleNoteTag(noteId);
  const applyTags = useApplyNoteTagsToBlocks(noteId);
  const toast = useToast();

  const [editTitle, setEditTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const tagButtonRef = useRef(null);
  const titleInputRef = useRef(null);
  const skipBlurRef = useRef(false);
  const scrolledBlockRef = useRef(null);
  // Modal de recordatorios de nivel nota: null | { alert?, reminder? }
  const [noteReminder, setNoteReminder] = useState(null);

  // Auto-foco en título si es una nota recién creada (título por defecto)
  useEffect(() => {
    if (note && note.title === 'Sin título' && note.blocks?.length === 0) {
      setTitleValue(note.title);
      setEditTitle(true);
    }
  }, [note?.id]); // solo al montar/cambiar de nota

  // Foco en input cuando entra en modo edición
  useEffect(() => {
    if (editTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editTitle]);

  // Al cambiar de nota se cierran el picker y la confirmación de "Aplicar".
  useEffect(() => {
    setTagPickerOpen(false);
    setConfirmApply(false);
  }, [noteId]);

  // Scroll y resaltar bloque al navegar desde la vista de Revisión (?highlight=blockId)
  // o desde una referencia con hash (#block-{id}).
  useEffect(() => {
    if (!note) return;
    const fromQuery = searchParams.get('highlight');
    const fromHash = location.hash?.startsWith('#block-')
      ? location.hash.replace('#block-', '')
      : null;
    const blockId = fromQuery || fromHash;
    if (!blockId) return;
    // Scroll una sola vez por bloque: `note` cambia de referencia en cada refetch
    // (p. ej. al editar un bloque) y sin esta guarda re-scrollearía en cada cambio.
    if (scrolledBlockRef.current === blockId) return;

    let pulseTimeout;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(`block-${blockId}`);
      if (!el) return; // el bloque aún no está montado; reintenta en el próximo refetch
      scrolledBlockRef.current = blockId;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlight-pulse');
      pulseTimeout = setTimeout(() => el.classList.remove('highlight-pulse'), 2500);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (pulseTimeout) clearTimeout(pulseTimeout);
    };
  }, [searchParams, location.hash, note]);

  /* ---------- loading / error ---------- */

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full py-24 text-gray-400">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm">Cargando nota...</p>
        </div>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <p className="text-sm text-gray-400">Nota no encontrada.</p>
      </div>
    );
  }

  const flat = treeData?.flat || [];
  const noteTags = note.tags || [];
  const currentTagIds = noteTags.map((t) => t.id);
  // "Aplicar a bloques existentes": solo los bloques que no son referencias llevan tags.
  const taggableBlockCount = (note.blocks || []).filter((b) => b.block_type !== 'reference').length;
  const canApplyTags = noteTags.length > 0 && taggableBlockCount > 0;

  /* ---------- handlers ---------- */

  const startEditTitle = () => {
    setTitleValue(note.title);
    setEditTitle(true);
  };

  const commitTitle = () => {
    const trimmed = titleValue.trim() || 'Sin título';
    if (trimmed !== note.title) {
      updateTitle.mutate({ id: noteId, title: trimmed });
    }
    setEditTitle(false);
  };

  // onBlur del input: guarda, salvo que el cierre venga de Enter/✓/Escape (que ya
  // gestionan el guardado). Al desmontarse el input se dispara un blur extra; este
  // ref evita el doble PATCH y que Escape termine guardando.
  const handleTitleBlur = () => {
    if (skipBlurRef.current) {
      skipBlurRef.current = false;
      return;
    }
    commitTitle();
  };

  const handleTitleKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      skipBlurRef.current = true;
      commitTitle();
    } else if (e.key === 'Escape') {
      skipBlurRef.current = true;
      setTitleValue(note.title);
      setEditTitle(false);
    }
  };

  const removeTag = (tagId) => {
    const tag = noteTags.find((t) => t.id === tagId);
    if (tag) toggleTag(tag);
  };

  const handleApplyTags = () => {
    applyTags.mutate(undefined, {
      onSuccess: (res) => {
        const updated = res?.data?.blocks_updated ?? 0;
        toast.success(
          updated === 0
            ? 'Los bloques ya tenían estos tags'
            : `Tags aplicados a ${updated} bloque${updated !== 1 ? 's' : ''}`
        );
      },
      onSettled: () => setConfirmApply(false),
    });
  };

  /* ---------- render ---------- */

  return (
    <div className="flex flex-col">

      {/* ── Cabecera de la nota ── */}
      <div className="flex-shrink-0 px-6 pt-5 pb-0 border-b border-gray-100 dark:border-gray-700/50">

        {/* Breadcrumb + indicador de guardado */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <NoteBreadcrumb noteId={noteId} flat={flat} />
          <NoteSaveIndicator />
        </div>

        {/* Título */}
        <div className="flex items-start gap-2 mb-3">
          {editTitle ? (
            <div className="flex-1 flex items-center gap-2">
              <input
                ref={titleInputRef}
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={handleTitleKey}
                className="flex-1 text-2xl font-bold bg-transparent border-b-2 border-blue-500
                           outline-none text-gray-900 dark:text-white py-0.5 leading-tight"
                placeholder="Título de la nota"
                maxLength={500}
              />
              <button
                onMouseDown={(e) => {
                  // onMouseDown + preventDefault: no perder el foco antes del click
                  // (evitaría el blur previo y un guardado doble). Guarda una vez.
                  e.preventDefault();
                  skipBlurRef.current = true;
                  commitTitle();
                }}
                className="flex-shrink-0 p-1 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex-1 flex items-start gap-2 group">
              <h1
                className="flex-1 text-2xl font-bold text-gray-900 dark:text-white
                           cursor-pointer leading-tight break-words"
                onClick={startEditTitle}
                title="Click para editar título"
              >
                {note.title}
              </h1>
              <button
                onClick={startEditTitle}
                className="flex-shrink-0 mt-1 p-1 rounded text-gray-300 dark:text-gray-600
                           opacity-0 group-hover:opacity-100 touch:opacity-100 hover:text-gray-600 dark:hover:text-gray-300
                           hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                title="Editar título"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <div className="flex-shrink-0 mt-0.5 flex items-center">
                <button
                  type="button"
                  onClick={() => setNoteReminder({})}
                  title="Recordatorios de la nota (precio o fecha)"
                  aria-label="Recordatorios de la nota"
                  className={`p-1.5 rounded-md transition-colors hover:bg-rose-50 dark:hover:bg-rose-900/30 ${
                    hasArmedReminders(note.price_alerts, note.date_reminders)
                      ? 'text-rose-500'
                      : 'text-gray-400 hover:text-rose-500'
                  }`}
                >
                  <BellRing
                    className="w-4 h-4"
                    fill={hasArmedReminders(note.price_alerts, note.date_reminders) ? 'currentColor' : 'none'}
                  />
                </button>
                <CopyReferenceButton noteId={noteId} variant="header" />
              </div>
            </div>
          )}
        </div>

        {/* Recordatorios de nivel nota (los de bloque van bajo cada bloque) */}
        <ReminderChips
          alerts={note.price_alerts}
          reminders={note.date_reminders}
          onOpen={(item) => setNoteReminder(item)}
          className="mb-3"
        />

        {/* Tags de la nota: proponen los tags de sus bloques nuevos */}
        <div className="pb-3">
          <div className="flex items-center gap-1.5 flex-wrap relative">
            {noteTags.map((tag) => (
              <NoteTagBadge key={tag.id} tag={tag} onRemove={removeTag} />
            ))}

            {/* Botón agregar tag */}
            <button
              ref={tagButtonRef}
              onClick={() => setTagPickerOpen((v) => !v)}
              className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full
                         border border-dashed border-gray-300 dark:border-gray-600
                         text-gray-400 hover:border-blue-400 hover:text-blue-500
                         dark:hover:border-blue-500 dark:hover:text-blue-400
                         transition-colors"
              aria-expanded={tagPickerOpen}
            >
              <Tag className="w-3 h-3" />
              {noteTags.length === 0 ? 'Agregar tag' : <Plus className="w-3 h-3" />}
            </button>

            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              Se agregan a los bloques nuevos de esta nota
            </span>

            {canApplyTags && !confirmApply && (
              <button
                onClick={() => setConfirmApply(true)}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
              >
                Aplicar a bloques existentes
              </button>
            )}

            {tagPickerOpen && (
              <TagPicker
                selectedIds={currentTagIds}
                onToggle={toggleTag}
                onClose={() => setTagPickerOpen(false)}
                anchorRef={tagButtonRef}
              />
            )}
          </div>

          {/* Confirmación inline (mismo patrón que el borrado en el gestor de tags) */}
          {confirmApply && canApplyTags && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-gray-600 dark:text-gray-300">
                Se agregarán los tags de la nota a sus {taggableBlockCount} bloque{taggableBlockCount !== 1 ? 's' : ''}.
                Los tags que ya tengan se mantienen.
              </span>
              <button
                onClick={handleApplyTags}
                disabled={applyTags.isPending}
                className="px-2 py-0.5 bg-blue-600 text-white rounded disabled:opacity-50"
              >
                {applyTags.isPending ? 'Aplicando…' : 'Aplicar'}
              </button>
              <button
                onClick={() => setConfirmApply(false)}
                disabled={applyTags.isPending}
                className="px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Bloques de contenido ── */}
      {/* En tablet (táctil ≥ md) más padding izquierdo: hace sitio al botón "⋮"
          de cada bloque, que vive en ese margen. */}
      <div className="max-w-3xl mx-auto w-full px-6 md:touch:pl-10 pt-4 pb-40">
        <NoteBlockList blocks={note.blocks || []} noteId={noteId} />
      </div>

      {noteReminder && (
        <ReminderModal
          onClose={() => setNoteReminder(null)}
          anchor={{ noteId }}
          alerts={note.price_alerts || []}
          reminders={note.date_reminders || []}
          initialAlert={noteReminder.alert || null}
          initialReminder={noteReminder.reminder || null}
        />
      )}
    </div>
  );
};

export default NoteEditor;
