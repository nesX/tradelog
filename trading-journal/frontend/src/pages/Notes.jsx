import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Tags, Menu, X, BookOpen, FileText, Clock, FolderInput, Search, Flag } from 'lucide-react';
import { useNoteTree, useCreateNote, useCreateBlock, useDeleteNote, useMoveNote } from '../hooks/useNotes.js';
import NoteTree from '../components/notes/NoteTree.jsx';
import NoteTagManager from '../components/notes/NoteTagManager.jsx';
import NoteExportMenu from '../components/notes/NoteExportMenu.jsx';
import NoteSearch from '../components/notes/NoteSearch.jsx';
import NoteSearchResults from '../components/notes/NoteSearchResults.jsx';
import NoteEditor from './NoteEditor.jsx';
import Review from './Review.jsx';

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

  const { data: treeData, isLoading } = useNoteTree();
  const createNote = useCreateNote();
  const createBlock = useCreateBlock();
  const deleteNote = useDeleteNote();

  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isReviewActive, setIsReviewActive] = useState(false);
  const [searchParams, setSearchParams] = useState({ q: '', tagIds: [] });
  const [moveNoteId, setMoveNoteId] = useState(null);
  const [moveSearch, setMoveSearch] = useState('');
  const moveNote = useMoveNote();

  useEffect(() => {
    if (selectedId) setIsReviewActive(false);
  }, [selectedId]);

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

  const handleCreateChild = async (parentId) => {
    const res = await createNote.mutateAsync({ parent_note_id: parentId });
    const newNoteId = res.data.id;
    await createBlock.mutateAsync({
      noteId: parentId,
      data: { block_type: 'note_link', linked_note_id: newNoteId, position: 9999 },
    });
    navigate(`/notes/${newNoteId}`);
  };

  const handleSelectNote = (noteId) => {
    setIsReviewActive(false);
    navigate(`/notes/${noteId}`);
    setSidebarOpen(false);
  };

  const handleDeleteNote = async (noteId, title) => {
    if (!window.confirm(`¿Eliminar "${title}"? También se eliminarán sus sub-notas.`)) return;
    await deleteNote.mutateAsync(noteId);
    if (selectedId === noteId) navigate('/notes');
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
          w-72 md:w-64 lg:w-72 flex-shrink-0 h-full
          bg-white dark:bg-gray-800
          border-r border-gray-200 dark:border-gray-700
          flex flex-col
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
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
            <button
              onClick={handleCreateRoot}
              disabled={createNote.isPending}
              className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 dark:hover:text-blue-400
                         hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-40"
              title="Nueva nota raíz"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden p-1.5 rounded-md text-gray-400 hover:text-gray-700 transition-colors"
            >
              <X className="w-4 h-4" />
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
        <div className="flex-1 overflow-y-auto py-2 px-1.5">
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
            <NoteTree
              notes={tree}
              selectedNoteId={selectedId}
              onSelect={handleSelectNote}
              onCreateChild={handleCreateChild}
              onDelete={handleDeleteNote}
              onMove={handleOpenMove}
            />
          )}
        </div>

        {/* Recientes + Revisión */}
        <div className="px-3 pb-1.5 flex flex-col gap-1">
          <button
            onClick={() => { setIsReviewActive(false); navigate('/notes'); setSidebarOpen(false); }}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm
                       text-gray-600 dark:text-gray-300
                       hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Clock className="w-4 h-4 text-gray-400" />
            Recientes
          </button>
          <button
            onClick={() => { setIsReviewActive(true); setSidebarOpen(false); }}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm
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
                    .filter((n) => !n.deleted_at)
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
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

      {/* Modal de tags */}
      <NoteTagManager isOpen={tagManagerOpen} onClose={() => setTagManagerOpen(false)} />

      {/* Modal: mover nota dentro de otra */}
      {moveNoteId && (() => {
        const movingNote = flat.find((n) => n.id === moveNoteId);
        const q = moveSearch.trim().toLowerCase();
        const candidates = flat.filter(
          (n) => n.id !== moveNoteId && (!q || n.title?.toLowerCase().includes(q))
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
