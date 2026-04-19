import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';

const NoteTextBlock = ({ block, onUpdate, saveStatus }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(block.content || '');
  const textareaRef = useRef(null);
  const debounceRef = useRef(null);

  // Sincronizar si cambia el bloque desde fuera (ej. invalidación de query)
  useEffect(() => {
    if (!editing) {
      setValue(block.content || '');
    }
  }, [block.content, editing]);

  // Autoexpand del textarea al entrar en modo edición
  useEffect(() => {
    if (editing && textareaRef.current) {
      const ta = textareaRef.current;
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
      ta.focus();
      // Cursor al final
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }, [editing]);

  const autoResize = (el) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  const handleChange = useCallback((e) => {
    const newValue = e.target.value;
    setValue(newValue);
    autoResize(e.target);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onUpdate(newValue);
    }, 1000);
  }, [onUpdate]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const handleBlur = () => {
    clearTimeout(debounceRef.current);
    onUpdate(value);
    setEditing(false);
  };

  /* ---------- MODO EDICIÓN ---------- */
  if (editing) {
    return (
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          className="w-full min-h-[80px] resize-none
                     bg-transparent
                     border border-blue-400 dark:border-blue-500
                     rounded-xl p-4 pb-6
                     text-sm text-gray-900 dark:text-gray-100
                     font-mono leading-relaxed outline-none transition-colors"
          placeholder="Escribe en markdown...&#10;&#10;# Título&#10;**negrita**   *italica*&#10;- elemento de lista&#10;`código inline`"
          style={{ overflow: 'hidden' }}
        />
        {/* Indicador de guardado */}
        {saveStatus && (
          <span className="absolute bottom-1.5 right-2.5 text-xs text-gray-400 pointer-events-none">
            {saveStatus}
          </span>
        )}
      </div>
    );
  }

  /* ---------- MODO PREVIEW ---------- */
  return (
    <div
      onClick={() => setEditing(true)}
      className="group relative cursor-text rounded-xl px-4 py-3
                 hover:ring-1 hover:ring-gray-200 dark:hover:ring-gray-600/50
                 transition-colors min-h-[44px]"
    >
      {value ? (
        <div
          className="prose prose-sm dark:prose-invert max-w-none
                     text-gray-800 dark:text-gray-200
                     prose-headings:font-semibold prose-headings:text-gray-900 dark:prose-headings:text-white
                     prose-code:bg-gray-100 dark:prose-code:bg-gray-700
                     prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                     prose-code:text-sm prose-code:font-mono
                     prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800
                     prose-a:text-blue-600 dark:prose-a:text-blue-400"
        >
          <ReactMarkdown>{value}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-gray-300 dark:text-gray-600 italic select-none">
          Haz click para escribir...
        </p>
      )}

      {/* Indicador de guardado en modo preview */}
      {saveStatus && (
        <span className="absolute bottom-1 right-2 text-xs text-gray-400 pointer-events-none">
          {saveStatus}
        </span>
      )}
    </div>
  );
};

export default NoteTextBlock;
