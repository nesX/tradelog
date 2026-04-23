import { useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Tags, Menu, X, BookOpen } from 'lucide-react';
import { useNoteTree, useCreateNote, useDeleteNote, useReorderNotes } from '../hooks/useNotes.js';
import NoteTree from '../components/notes/NoteTree.jsx';
import NoteTagManager from '../components/notes/NoteTagManager.jsx';
import NoteExportMenu from '../components/notes/NoteExportMenu.jsx';
import NoteSearch from '../components/notes/NoteSearch.jsx';
import NoteSearchResults from '../components/notes/NoteSearchResults.jsx';
import NoteEditor from './NoteEditor.jsx';

const Notes = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const selectedId = id ? parseInt(id) : null;

  const { data: treeData, isLoading } = useNoteTree();
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();
  const reorderNotes = useReorderNotes();

  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchParams, setSearchParams] = useState({ q: '', tagIds: [] });

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
    navigate(`/notes/${res.data.id}`);
  };

  const handleSelectNote = (noteId) => {
    navigate(`/notes/${noteId}`);
    setSidebarOpen(false);
  };

  const handleDeleteNote = async (noteId, title) => {
    if (!window.confirm(`¿Eliminar "${title}"? También se eliminarán sus sub-notas.`)) return;
    await deleteNote.mutateAsync(noteId);
    if (selectedId === noteId) navigate('/notes');
  };

  return (
    <div className="flex bg-gray-50 dark:bg-gray-900">

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
          fixed md:sticky md:top-16 inset-y-0 left-0 z-40 md:z-auto
          w-72 md:w-64 lg:w-72 flex-shrink-0
          md:h-[calc(100vh-64px)] md:self-start
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
        <NoteSearch onSearchActive={setIsSearchActive} onChange={handleSearchChange} />

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
              flat={flat}
              selectedNoteId={selectedId}
              onSelect={handleSelectNote}
              onCreateChild={handleCreateChild}
              onDelete={handleDeleteNote}
              onReorder={(note_ids) => reorderNotes.mutate(note_ids)}
            />
          )}
        </div>

        {/* Exportación al pie del sidebar */}
        <div className="px-3 py-2.5 border-t border-gray-200 dark:border-gray-700">
          <NoteExportMenu />
        </div>
      </aside>

      {/* ── Panel principal ── */}
      <main className="flex-1 flex flex-col min-w-0 min-h-screen">

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
        {isSearchActive ? (
          <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800">
            <NoteSearchResults
              q={searchParams.q}
              tagIds={searchParams.tagIds}
              flat={flat}
              onSelectNote={handleSelectNote}
            />
          </div>
        ) : selectedId ? (
          <div className="flex-1 bg-gray-50 dark:bg-gray-900">
            <NoteEditor embeddedId={selectedId} />
          </div>
        ) : (
          /* ── Empty state ── */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-xs px-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-50 dark:bg-blue-900/30
                              flex items-center justify-center">
                <BookOpen className="w-8 h-8 text-blue-500 dark:text-blue-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">
                {flat.length === 0 ? 'Crea tu primera nota' : 'Selecciona una nota'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                {flat.length === 0
                  ? 'Guarda ideas, investigación y análisis en un lugar privado.'
                  : 'Elige una nota del panel izquierdo o crea una nueva.'}
              </p>
              <button
                onClick={handleCreateRoot}
                disabled={createNote.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700
                           text-white text-sm font-medium rounded-lg transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                {createNote.isPending ? 'Creando...' : 'Nueva nota'}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Modal de tags */}
      <NoteTagManager isOpen={tagManagerOpen} onClose={() => setTagManagerOpen(false)} />
    </div>
  );
};

export default Notes;
