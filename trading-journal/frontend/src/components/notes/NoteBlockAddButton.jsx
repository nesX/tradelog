import { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { useBlockInserter, BLOCK_OPTIONS } from '../../hooks/useBlockInserter.js';

/**
 * Botón "+" en el margen izquierdo de un bloque. Al pulsarlo despliega las
 * opciones de bloque e inserta el nuevo bloque DEBAJO (en `position`).
 * Se hace visible al pasar el cursor por encima del bloque contenedor (que
 * debe tener la clase `group`).
 */
const NoteBlockAddButton = ({ noteId, position, topClass = 'top-1/2' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { insert, loading } = useBlockInserter(noteId);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInsert = async (type) => {
    setOpen(false);
    await insert(type, position);
  };

  return (
    <div
      ref={ref}
      className={`absolute -left-8 ${topClass} -translate-y-1/2 z-20 transition-opacity
                  ${open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (!loading) setOpen((v) => !v);
        }}
        disabled={loading}
        className="w-6 h-6 flex items-center justify-center rounded-full
                   bg-white dark:bg-gray-800
                   border border-gray-200 dark:border-gray-700
                   text-gray-400 hover:text-blue-600 dark:hover:text-blue-400
                   hover:border-blue-400 dark:hover:border-blue-500
                   shadow-sm transition-colors
                   disabled:opacity-40 disabled:cursor-not-allowed"
        title="Insertar bloque debajo"
      >
        {loading ? (
          <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <Plus className="w-3.5 h-3.5" />
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-20
                     bg-white dark:bg-gray-800
                     border border-gray-200 dark:border-gray-700
                     rounded-xl shadow-lg overflow-hidden min-w-[150px]"
        >
          {BLOCK_OPTIONS.map(({ type, label, icon: Icon, color }) => (
            <button
              key={type}
              onClick={() => handleInsert(type)}
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

export default NoteBlockAddButton;
