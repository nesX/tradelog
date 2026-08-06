import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Tags, Menu, X, BookOpen, FileText, Clock, FolderInput, Search, Flag, Folder, ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNoteTree, useCreateNote, useCreateBlock, useDeleteNote, useRestoreNote, useMoveNote, useUpdateNoteTitle, noteKeys } from '../hooks/useNotes.js';
import { insertSubNote } from '../hooks/useBlockInserter.js';
import { clearSectionCollapsed } from '../hooks/useSectionCollapsed.js';
import { useToast } from '../components/common/Toast.jsx';
import ConfirmDialog from '../components/common/ConfirmDialog.jsx';
import NoteTree from '../components/notes/NoteTree.jsx';
import NoteTagManager from '../components/notes/NoteTagManager.jsx';
import NoteExportMenu from '../components/notes/NoteExportMenu.jsx';
import NoteSearch from '../components/notes/NoteSearch.jsx';
import NoteSearchResults from '../components/notes/NoteSearchResults.jsx';
import NoteEditor from './NoteEditor.jsx';
import Review from './Review.jsx';

// Ids de todos los descendientes de una nota (a partir del array plano). Se usa
// para excluirlos como destino en el modal "Mover nota" (mover a un descendiente
// crearía un ciclo → error 400 genérico del backend).
const collectDescendantIdsFlat = (flatNotes, rootId) => {
  const childrenByParent = new Map();
  for (const n of flatNotes) {
    const list = childrenByParent.get(n.parent_note_id) || [];
    list.push(n.id);
    childrenByParent.set(n.parent_note_id, list);
  }
  const result = new Set();
  const stack = [rootId];
  while (stack.length) {
    for (const childId of childrenByParent.get(stack.pop()) || []) {
      if (!result.has(childId)) {
        result.add(childId);
        stack.push(childId);
      }
    }
  }
  return result;
};

const buildBreadcrumb = (parentId, flatNotes) => {
  if (!parentId || !flatNotes) return null;
  const map = {};
  for (const n of flatNotes) map[n.id] = n;
  const path = [];
  let current = map[parentId];
  while (current) {
    path.unshift(current.title || 'Sin título');
    current = current.parent_note_id ? map[current.parent_note_id] : null;
  }
  return path.length > 0 ? path.join(' › ') : null;
};

const Notes = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const selectedId = id ? parseInt(id) : null;

  const queryClient = useQueryClient();
  const { data: treeData, isLoading } = useNoteTree();
  const createNote = useCreateNote();
  const createBlock = useCreateBlock();
  const deleteNote = useDeleteNote();
  const restoreNote = useRestoreNote();
  const toast = useToast();

  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Colapsar el sidebar en pantallas md+ (tablet/desktop). Persistido en
  // localStorage para respetar la preferencia entre sesiones. En mobile el
  // panel sigue funcionando como drawer (sidebarOpen), sin verse afectado.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('notes-sidebar-collapsed') === '1'
  );
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isReviewActive, setIsReviewActive] = useState(false);
  const [searchParams, setSearchParams] = useState({ q: '', tagIds: [] });
  const [moveNoteId, setMoveNoteId] = useState(null);
  const [moveSearch, setMoveSearch] = useState('');
  // Nota pendiente de confirmación de borrado (solo cuando tiene sub-notas).
  const [pendingDeleteNote, setPendingDeleteNote] = useState(null);
  const moveNote = useMoveNote();
  const updateTitle = useUpdateNoteTitle();

  // "Nueva sección" inline creation state
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [creatingSection, setCreatingSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const sectionInputRef = useRef(null);
  const addMenuRef = useRef(null);
  // Guard contra doble creación: Enter + blur del input disparan handleCreateSection
  // casi a la vez. El ref evita que el segundo entre mientras el primero está en vuelo.
  const sectionSubmitRef = useRef(false);

  useEffect(() => {
    if (selectedId) setIsReviewActive(false);
  }, [selectedId]);

  useEffect(() => {
    localStorage.setItem('notes-sidebar-collapsed', sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (creatingSection && sectionInputRef.current) {
      sectionInputRef.current.focus();
    }
  }, [creatingSection]);

  useEffect(() => {
    if (!addMenuOpen) return;
    const handleClick = (e) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) setAddMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [addMenuOpen]);

  const handleSearchChange = useCallback((params) => setSearchParams(params), []);

  const tree = treeData?.tree || [];
  const flat = treeData?.flat || [];

  // Cuando llega con una nota seleccionada desde URL directa,
  // si hay notas pero ninguna está expandida en el árbol no hace falta hacer nada especial
  // — el NoteTree ya lee el estado del localStorage.

  const handleCreateRoot = async () => {
    const res = await createNote.mutateAsync({ parent_note_id: null });
    navigate(`/notes/${res.data.id}`);
  };

  const handleCreateSection = async () => {
    if (sectionSubmitRef.current) return;
    const title = newSectionTitle.trim();
    if (!title) { setCreatingSection(false); return; }
    sectionSubmitRef.current = true;
    try {
      await createNote.mutateAsync({ title, parent_note_id: null, type: 'section' });
      setNewSectionTitle('');
      setCreatingSection(false);
    } catch {
      // El toast global informa; se mantiene el input abierto para reintentar.
    } finally {
      sectionSubmitRef.current = false;
    }
  };

  const handleSectionInputKeyDown = (e) => {
    if (e.key === 'Enter') handleCreateSection();
    if (e.key === 'Escape') { setNewSectionTitle(''); setCreatingSection(false); }
  };

  const handleRenameSection = async (sectionId, newTitle) => {
    await updateTitle.mutateAsync({ id: sectionId, title: newTitle });
  };

  const handleDeleteSection = (sectionId, title, itemCount) => {
    const msg = itemCount > 0
      ? `¿Eliminar la sección "${title}"?\n\nLas ${itemCount} nota${itemCount !== 1 ? 's' : ''} agrupadas quedarán bajo la sección anterior (o sueltas).\n\nLas notas no se borran.`
      : `¿Eliminar la sección "${title}"?`;
    if (!window.confirm(msg)) return;
    clearSectionCollapsed(sectionId);
    deleteNote.mutateAsync(sectionId);
  };

  const handleCreateChild = async (parentId) => {
    try {
      const subNote = await insertSubNote({ createBlock, createNote, noteId: parentId, position: 9999 });
      navigate(`/notes/${subNote.id}`);
    } catch {
      // El toast global informa el fallo. Si la sub-nota llegó a crearse aparece
      // en el árbol (cuelga del padre); no forzamos navegación a un estado parcial.
    }
  };

  const handleSelectNote = (noteId) => {
    setIsReviewActive(false);
    navigate(`/notes/${noteId}`);
    setSidebarOpen(false);
  };

  // Ejecuta el borrado (soft-delete recursivo) y ofrece deshacer vía toast. El
  // backend conserva el subtree durante la gracia de purga (NOTE_PURGE_DAYS), así
  // que "Deshacer" lo restaura por completo.
  const performDelete = async (noteId) => {
    // Calcular el set afectado ANTES de mutar (el árbol aún los contiene) para
    // navegar/limpiar caché si la nota abierta es la borrada o una de sus
    // descendientes; si no, el editor seguiría mostrando una nota ya eliminada.
    const affected = collectDescendantIdsFlat(flat, noteId);
    affected.add(noteId);
    const wasViewing = Boolean(selectedId && affected.has(selectedId));

    try {
      await deleteNote.mutateAsync(noteId);
    } catch {
      return; // el toast global informa el fallo
    }
    affected.forEach((id) => queryClient.removeQueries({ queryKey: noteKeys.detail(id) }));
    if (wasViewing) navigate('/notes');

    toast.success('Nota eliminada', {
      duration: 6000,
      action: {
        label: 'Deshacer',
        onClick: async () => {
          try {
            await restoreNote.mutateAsync(noteId);
            if (wasViewing) navigate(`/notes/${noteId}`);
          } catch {
            // el toast global informa el fallo
          }
        },
      },
    });
  };

  const handleDeleteNote = (noteId, title) => {
    // Con undo disponible, el borrado de una nota sin hijos es directo (patrón
    // Gmail: borrar + deshacer). Si tiene sub-notas, confirmar mostrando el conteo.
    const descendants = collectDescendantIdsFlat(flat, noteId);
    if (descendants.size > 0) {
      setPendingDeleteNote({ id: noteId, title, count: descendants.size });
    } else {
      performDelete(noteId);
    }
  };

  const handleOpenMove = (noteId) => {
    setMoveNoteId(noteId);
    setMoveSearch('');
  };

  const handleConfirmMove = async (parentId) => {
    await moveNote.mutateAsync({ id: moveNoteId, parent_note_id: parentId });
    setMoveNoteId(null);
  };

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 flex h-[calc(100vh-112px)] overflow-hidden bg-gray-50 dark:bg-gray-900">

      {/* ── Sidebar ── */}
      {/* Overlay para mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          fixed md:relative inset-y-0 left-0 z-40 md:z-auto
          w-72 flex-shrink-0 h-full
          bg-white dark:bg-gray-800
          border-r border-gray-200 dark:border-gray-700
          flex flex-col
          transform transition-all duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${sidebarCollapsed
            ? 'md:w-0 md:min-w-0 md:border-r-0 md:opacity-0 md:overflow-hidden md:pointer-events-none'
            : 'md:w-64 lg:w-72'}
        `}
      >
        {/* Cabecera del sidebar */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200 dark:border-gray-700">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200">
            <BookOpen className="w-4 h-4" />
            Mis notas
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setTagManagerOpen(true)}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200
                         hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Gestionar tags"
            >
              <Tags className="w-4 h-4" />
            </button>
            {/* Dropdown: nueva nota / nueva sección */}
            <div className="relative" ref={addMenuRef}>
              <button
                onClick={() => setAddMenuOpen((o) => !o)}
                disabled={createNote.isPending}
                className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 dark:hover:text-blue-400
                           hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-40 flex items-center"
                title="Nueva nota o sección"
              >
                <Plus className="w-4 h-4" />
              </button>
              {addMenuOpen && (
                <div className="absolute right-0 top-8 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px]">
                  <button
                    onClick={() => { setAddMenuOpen(false); handleCreateRoot(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <FileText className="w-4 h-4 text-gray-400" /> Nueva nota
                  </button>
                  <button
                    onClick={() => { setAddMenuOpen(false); setNewSectionTitle(''); setCreatingSection(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <Folder className="w-4 h-4 text-gray-400" /> Nueva sección
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden p-1.5 rounded-md text-gray-400 hover:text-gray-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            {/* Ocultar panel (solo tablet/desktop) */}
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="hidden md:inline-flex p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200
                         hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Ocultar panel"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Búsqueda */}
        <NoteSearch
          onSearchActive={setIsSearchActive}
          onChange={handleSearchChange}
          onEnter={() => selectedId && navigate('/notes')}
        />

        {/* Árbol de notas */}
        <div className="flex-1 overflow-y-auto pt-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tree.length === 0 ? (
            <div className="text-center py-10 px-4">
              <BookOpen className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">No hay notas aún</p>
              <button
                onClick={handleCreateRoot}
                disabled={createNote.isPending}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40"
              >
                Crear primera nota
              </button>
            </div>
          ) : (
            <>
              <NoteTree
                notes={tree}
                selectedNoteId={selectedId}
                onSelect={handleSelectNote}
                onCreateChild={handleCreateChild}
                onDelete={handleDeleteNote}
                onMove={handleOpenMove}
                onRenameSection={handleRenameSection}
                onDeleteSection={handleDeleteSection}
              />
              {creatingSection && (
                <div className="px-2 py-1 mt-1">
                  <input
                    ref={sectionInputRef}
                    type="text"
                    placeholder="Nombre de la sección..."
                    value={newSectionTitle}
                    onChange={(e) => setNewSectionTitle(e.target.value)}
                    onBlur={handleCreateSection}
                    onKeyDown={handleSectionInputKeyDown}
                    className="w-full px-2 py-1 text-xs font-semibold uppercase tracking-wide
                               bg-gray-100 dark:bg-gray-700 rounded border border-blue-400
                               text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none"
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Recientes + Revisión */}
        <div className="px-3 pb-1.5 pt-1.5 flex flex-col gap-1 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => { setIsReviewActive(false); navigate('/notes'); setSidebarOpen(false); }}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-sm
                       text-gray-600 dark:text-gray-300
                       hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Clock className="w-4 h-4 text-gray-400" />
            Recientes
          </button>
          <button
            onClick={() => { setIsReviewActive(true); setSidebarOpen(false); }}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-sm
                       bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400
                       hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
          >
            <Flag className="w-4 h-4 text-amber-500" fill="currentColor" />
            Revisión
          </button>
        </div>

        {/* Exportación al pie del sidebar */}
        <div className="px-3 py-2.5 border-t border-gray-200 dark:border-gray-700">
          <NoteExportMenu />
        </div>
      </aside>

      {/* ── Panel principal ── */}
      <main className="flex-1 overflow-y-auto flex flex-col min-w-0">

        {/* Topbar visible solo en mobile */}
        <div className="md:hidden flex items-center gap-2 px-4 py-2.5
                        border-b border-gray-200 dark:border-gray-700
                        bg-white dark:bg-gray-800">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400 truncate">
            {selectedId
              ? flat.find((n) => n.id === selectedId)?.title || 'Nota'
              : 'Notas'}
          </span>
        </div>

        {/* Botón para mostrar el panel cuando está oculto (solo tablet/desktop) */}
        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="hidden md:inline-flex items-center gap-1.5 self-start sticky top-0 z-20
                       m-2 px-2.5 py-1.5 rounded-md
                       bg-white/90 dark:bg-gray-800/90 backdrop-blur
                       border border-gray-200 dark:border-gray-700 shadow-sm
                       text-sm text-gray-500 dark:text-gray-400
                       hover:text-gray-700 dark:hover:text-gray-200
                       hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            title="Mostrar panel de notas"
          >
            <PanelLeftOpen className="w-4 h-4" />
            <span className="text-xs font-medium">Notas</span>
          </button>
        )}

        {/* Contenido */}
        {isReviewActive ? (
          <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800">
            <Review />
          </div>
        ) : selectedId ? (
          <div className="flex-1 bg-gray-50 dark:bg-gray-900">
            <NoteEditor embeddedId={selectedId} />
          </div>
        ) : isSearchActive ? (
          <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800">
            <NoteSearchResults
              q={searchParams.q}
              tagIds={searchParams.tagIds}
              flat={flat}
              onSelectNote={handleSelectNote}
            />
          </div>
        ) : (
          /* ── Panel de inicio: notas recientes ── */
          <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-gray-800">
            {/* Cabecera con botón nueva nota */}
            <div className="flex items-center justify-between px-6 py-4
                            border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Notas recientes
                </span>
              </div>
              <button
                onClick={handleCreateRoot}
                disabled={createNote.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700
                           text-white text-sm font-medium rounded-lg transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                {createNote.isPending ? 'Creando...' : 'Nueva nota'}
              </button>
            </div>

            {/* Lista de notas recientes */}
            <div className="flex-1 overflow-y-auto">
              {flat.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-16 px-6">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-50 dark:bg-blue-900/30
                                  flex items-center justify-center">
                    <BookOpen className="w-8 h-8 text-blue-500 dark:text-blue-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">
                    Crea tu primera nota
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Guarda ideas, investigación y análisis en un lugar privado.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                  {[...flat]
                    .filter((n) => !n.deleted_at && n.type !== 'section')
                    // Ordenar por última edición (updated_at) para que una nota
                    // editada a diario suba; created_at como respaldo.
                    .sort(
                      (a, b) =>
                        new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
                    )
                    .slice(0, 50)
                    .map((note) => {
                      const breadcrumb = buildBreadcrumb(note.parent_note_id, flat);
                      return (
                        <li key={note.id}>
                          <button
                            onClick={() => handleSelectNote(note.id)}
                            className="w-full flex items-start gap-3 px-6 py-3.5
                                       hover:bg-gray-50 dark:hover:bg-gray-700/50
                                       transition-colors text-left"
                          >
                            <FileText className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                                {note.title || 'Sin título'}
                              </p>
                              {breadcrumb && (
                                <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                                  {breadcrumb}
                                </p>
                              )}
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                {new Date(note.created_at).toLocaleDateString('es-ES', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </p>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Confirmación de borrado (solo cuando la nota tiene sub-notas) */}
      <ConfirmDialog
        isOpen={pendingDeleteNote !== null}
        onClose={() => setPendingDeleteNote(null)}
        onConfirm={() => {
          const target = pendingDeleteNote;
          setPendingDeleteNote(null);
          if (target) performDelete(target.id);
        }}
        title="Eliminar nota"
        message={
          pendingDeleteNote
            ? `Se eliminará "${pendingDeleteNote.title}" y sus ${pendingDeleteNote.count} sub-nota${pendingDeleteNote.count !== 1 ? 's' : ''}. Podrás deshacerlo unos segundos.`
            : ''
        }
        confirmLabel="Eliminar"
        isLoading={deleteNote.isPending}
      />

      {/* Modal de tags */}
      <NoteTagManager isOpen={tagManagerOpen} onClose={() => setTagManagerOpen(false)} />

      {/* Modal: mover nota dentro de otra */}
      {moveNoteId && (() => {
        const movingNote = flat.find((n) => n.id === moveNoteId);
        const q = moveSearch.trim().toLowerCase();
        const descendantIds = collectDescendantIdsFlat(flat, moveNoteId);
        const candidates = flat.filter(
          (n) =>
            n.id !== moveNoteId &&
            !descendantIds.has(n.id) &&
            n.type !== 'section' &&
            (!q || n.title?.toLowerCase().includes(q))
        );
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm flex flex-col max-h-[70vh]">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <FolderInput className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    Mover nota
                  </span>
                </div>
                <button
                  onClick={() => setMoveNoteId(null)}
                  className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Nota a mover */}
              <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/40 border-b border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">Moviendo:</p>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                  {movingNote?.title || 'Sin título'}
                </p>
              </div>

              {/* Búsqueda */}
              <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Buscar nota destino..."
                    value={moveSearch}
                    onChange={(e) => setMoveSearch(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none"
                  />
                </div>
              </div>

              {/* Lista de destinos */}
              <div className="flex-1 overflow-y-auto py-1">
                {/* Opción: mover a raíz */}
                <button
                  onClick={() => handleConfirmMove(null)}
                  disabled={moveNote.isPending}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm
                             hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors
                             text-gray-600 dark:text-gray-300 disabled:opacity-50"
                >
                  <BookOpen className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <span className="italic">Sin padre (nota raíz)</span>
                </button>

                <div className="my-1 border-t border-gray-100 dark:border-gray-700" />

                {candidates.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-6">
                    No hay notas coincidentes
                  </p>
                ) : (
                  candidates.map((n) => {
                    const bc = buildBreadcrumb(n.parent_note_id, flat);
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleConfirmMove(n.id)}
                        disabled={moveNote.isPending}
                        className="w-full flex items-start gap-2 px-4 py-2 text-left
                                   hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors
                                   disabled:opacity-50"
                      >
                        <FileText className="w-3.5 h-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-gray-800 dark:text-gray-100 truncate">
                            {n.title || 'Sin título'}
                          </p>
                          {bc && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                              {bc}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default Notes;
