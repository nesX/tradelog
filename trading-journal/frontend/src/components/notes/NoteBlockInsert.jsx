import { useState, useRef, useEffect } from 'react';
import { Plus, AlignLeft, Image, Link, StickyNote } from 'lucide-react';
import { useCreateBlock, useCreateNote } from '../../hooks/useNotes.js';
import { useNavigate } from 'react-router-dom';

const BLOCK_OPTIONS = [
  { type: 'text',          label: 'Texto',      icon: AlignLeft,  color: 'text-gray-500'   },
  { type: 'image_gallery', label: 'Imágenes',   icon: Image,      color: 'text-green-500'  },
  { type: 'note_link',     label: 'Sub-nota',   icon: Link,       color: 'text-blue-500'   },
  { type: 'callout',       label: 'Destacado',  icon: StickyNote, color: 'text-yellow-500' },
];

const NoteBlockInsert = ({ noteId, position }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const createBlock = useCreateBlock();
  const createNote = useCreateNote();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const insert = async (block_type) => {
    setOpen(false);
    if (block_type === 'note_link') {
      const noteRes = await createNote.mutateAsync({ parent_note_id: noteId });
      const subNote = noteRes.data;
      await createBlock.mutateAsync({
        noteId,
        data: { block_type: 'note_link', linked_note_id: subNote.id, position },
      });
      navigate(`/notes/${subNote.id}`);
    } else if (block_type === 'callout') {
      await createBlock.mutateAsync({
        noteId,
        data: { block_type: 'callout', content: '', metadata: { style: 'info' }, position },
      });
    } else {
      await createBlock.mutateAsync({ noteId, data: { block_type, position } });
    }
  };

  const loading = createBlock.isPending || createNote.isPending;

  return (
    <div className="relative group flex items-center py-0.5" ref={ref}>
      {/* Línea */}
      <div className="flex-1 h-px bg-transparent group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors" />

      {/* Botón + */}
      <button
        onClick={() => !loading && setOpen((v) => !v)}
        disabled={loading}
        className="mx-1.5 flex-shrink-0 w-6 h-6 flex items-center justify-center
                   rounded-full border border-gray-200 dark:border-gray-700
                   bg-white dark:bg-gray-800
                   text-gray-400 hover:text-blue-600 dark:hover:text-blue-400
                   hover:border-blue-400 dark:hover:border-blue-500
                   opacity-0 group-hover:opacity-100
                   transition-all shadow-sm
                   disabled:opacity-30 disabled:cursor-not-allowed"
        title="Insertar bloque"
      >
        {loading
          ? <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
          : <Plus className="w-3.5 h-3.5" />
        }
      </button>

      <div className="flex-1 h-px bg-transparent group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors" />

      {/* Menú flotante */}
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-20
                        bg-white dark:bg-gray-800
                        border border-gray-200 dark:border-gray-700
                        rounded-xl shadow-lg overflow-hidden
                        min-w-[150px]">
          {BLOCK_OPTIONS.map(({ type, label, icon: Icon, color }) => (
            <button
              key={type}
              onClick={() => insert(type)}
              className="flex items-center gap-2.5 w-full px-3 py-2
                         text-sm text-gray-700 dark:text-gray-200
                         hover:bg-gray-50 dark:hover:bg-gray-700/60
                         transition-colors"
            >
              <Icon className={`w-4 h-4 ${color}`} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default NoteBlockInsert;
