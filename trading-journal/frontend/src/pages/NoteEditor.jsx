import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Tag, X, Plus, Check, Pencil } from 'lucide-react';
import {
  useNote,
  useNoteTree,
  useUpdateNoteTitle,
  useAssignTags,
  useNoteTags,
} from '../hooks/useNotes.js';
import NoteBlockList from '../components/notes/NoteBlockList.jsx';
import NoteBreadcrumb from '../components/notes/NoteBreadcrumb.jsx';
import NoteTagBadge from '../components/notes/NoteTagBadge.jsx';

const NoteEditor = ({ embeddedId }) => {
  const params = useParams();
  const noteId = embeddedId ? parseInt(embeddedId) : parseInt(params.id);

  const { data: note, isLoading, error } = useNote(noteId);
  const { data: treeData } = useNoteTree();
  const updateTitle = useUpdateNoteTitle();
  const assignTags = useAssignTags();
  const { data: allTags = [] } = useNoteTags();

  const [editTitle, setEditTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const tagPickerRef = useRef(null);
  const titleInputRef = useRef(null);

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

  // Cerrar tag picker al click fuera
  useEffect(() => {
    const handler = (e) => {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target)) {
        setTagPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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
  const currentTagIds = (note.tags || []).map((t) => t.id);

  /* ---------- handlers ---------- */

  const startEditTitle = () => {
    setTitleValue(note.title);
    setEditTitle(true);
  };

  const saveTitle = () => {
    const trimmed = titleValue.trim() || 'Sin título';
    if (trimmed !== note.title) {
      updateTitle.mutate({ id: noteId, title: trimmed });
    }
    setEditTitle(false);
  };

  const handleTitleKey = (e) => {
    if (e.key === 'Enter') saveTitle();
    if (e.key === 'Escape') setEditTitle(false);
  };

  const toggleTag = (tagId) => {
    const newIds = currentTagIds.includes(tagId)
      ? currentTagIds.filter((id) => id !== tagId)
      : [...currentTagIds, tagId];
    assignTags.mutate({ noteId, tag_ids: newIds });
  };

  /* ---------- render ---------- */

  return (
    <div className="flex flex-col">

      {/* ── Cabecera de la nota ── */}
      <div className="flex-shrink-0 px-6 pt-5 pb-0 border-b border-gray-100 dark:border-gray-700/50">

        {/* Breadcrumb */}
        <div className="mb-3">
          <NoteBreadcrumb noteId={noteId} flat={flat} />
        </div>

        {/* Título */}
        <div className="flex items-start gap-2 mb-3">
          {editTitle ? (
            <div className="flex-1 flex items-center gap-2">
              <input
                ref={titleInputRef}
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={handleTitleKey}
                className="flex-1 text-2xl font-bold bg-transparent border-b-2 border-blue-500
                           outline-none text-gray-900 dark:text-white py-0.5 leading-tight"
                placeholder="Título de la nota"
                maxLength={500}
              />
              <button
                onClick={saveTitle}
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
                           opacity-0 group-hover:opacity-100 hover:text-gray-600 dark:hover:text-gray-300
                           hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                title="Editar título"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="flex items-center gap-1.5 flex-wrap pb-3 relative" ref={tagPickerRef}>
          {(note.tags || []).map((tag) => (
            <NoteTagBadge
              key={tag.id}
              tag={tag}
              onRemove={toggleTag}
            />
          ))}

          {/* Botón agregar tag */}
          <button
            onClick={() => setTagPickerOpen((v) => !v)}
            className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full
                       border border-dashed border-gray-300 dark:border-gray-600
                       text-gray-400 hover:border-blue-400 hover:text-blue-500
                       dark:hover:border-blue-500 dark:hover:text-blue-400
                       transition-colors"
          >
            <Tag className="w-3 h-3" />
            {(note.tags || []).length === 0 ? 'Agregar tag' : <Plus className="w-3 h-3" />}
          </button>

          {/* Dropdown picker de tags */}
          {tagPickerOpen && (
            <div className="absolute top-full left-0 mt-1 z-30
                            bg-white dark:bg-gray-800
                            border border-gray-200 dark:border-gray-700
                            rounded-xl shadow-lg py-1.5 min-w-[180px] max-h-64 overflow-y-auto">
              <div className="flex items-center justify-between px-3 pb-1.5 mb-0.5
                              border-b border-gray-100 dark:border-gray-700">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Tags</span>
                <button
                  onClick={() => setTagPickerOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {allTags.length === 0 ? (
                <p className="text-xs text-gray-400 px-3 py-2">
                  No hay tags. Créalos con el ícono <span className="font-medium">Tags</span> en el sidebar.
                </p>
              ) : (
                allTags.map((tag) => {
                  const active = currentTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-sm transition-colors
                        ${active
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60'
                        }`}
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="flex-1 text-left">{tag.name}</span>
                      {active && <Check className="w-3 h-3 flex-shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Bloques de contenido ── */}
      <div className="max-w-3xl mx-auto w-full px-6 pt-4 pb-40">
        <NoteBlockList blocks={note.blocks || []} noteId={noteId} />
      </div>
    </div>
  );
};

export default NoteEditor;
