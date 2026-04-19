import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';

const CALLOUT_STYLES = {
  info:    { bg: 'bg-blue-50 dark:bg-blue-950/30',   border: 'border-l-blue-500',   label: 'Información' },
  warning: { bg: 'bg-yellow-50 dark:bg-yellow-950/30', border: 'border-l-yellow-500', label: 'Advertencia' },
  success: { bg: 'bg-green-50 dark:bg-green-950/30',  border: 'border-l-green-500',  label: 'Éxito' },
  error:   { bg: 'bg-red-50 dark:bg-red-950/30',     border: 'border-l-red-500',    label: 'Error' },
  note:    { bg: 'bg-gray-50 dark:bg-gray-800/50',   border: 'border-l-gray-500',   label: 'Nota' },
};

const STYLE_KEYS = Object.keys(CALLOUT_STYLES);

const DOT_COLORS = {
  info:    'bg-blue-500',
  warning: 'bg-yellow-500',
  success: 'bg-green-500',
  error:   'bg-red-500',
  note:    'bg-gray-500',
};

const NoteCalloutBlock = ({ block, onUpdate, onUpdateMetadata, saveStatus }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(block.content || '');
  const textareaRef = useRef(null);
  const debounceRef = useRef(null);

  const metadata = block.metadata || {};
  const style = metadata.style || 'info';
  const { bg, border, label } = CALLOUT_STYLES[style] || CALLOUT_STYLES.info;

  useEffect(() => {
    if (!editing) setValue(block.content || '');
  }, [block.content, editing]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      const ta = textareaRef.current;
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
      ta.focus();
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
    debounceRef.current = setTimeout(() => onUpdate(newValue), 1000);
  }, [onUpdate]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const handleBlur = () => {
    clearTimeout(debounceRef.current);
    onUpdate(value);
    setEditing(false);
  };

  const handleStyleChange = (newStyle) => {
    onUpdateMetadata({ style: newStyle });
  };

  return (
    <div className={`border-l-4 rounded-r-xl ${bg} ${border} px-4 pt-3 pb-3`}>
      {/* Cabecera: label + selector de estilo */}
      <div className="flex items-center gap-2 mb-2">
        {metadata.icon && (
          <span className="text-base leading-none">{metadata.icon}</span>
        )}
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          {label}
        </span>
        {/* Selector de estilo — puntos de color */}
        <div className="flex items-center gap-1 ml-auto">
          {STYLE_KEYS.map((s) => (
            <button
              key={s}
              onClick={() => handleStyleChange(s)}
              title={CALLOUT_STYLES[s].label}
              className={`w-3 h-3 rounded-full transition-transform ${DOT_COLORS[s]}
                ${s === style ? 'ring-2 ring-offset-1 ring-gray-400 dark:ring-gray-500 scale-110' : 'opacity-50 hover:opacity-100'}`}
            />
          ))}
        </div>
      </div>

      {/* Contenido */}
      {editing ? (
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            className="w-full min-h-[60px] resize-none bg-transparent
                       border border-blue-400 dark:border-blue-500
                       rounded-lg p-3 pb-6
                       text-sm text-gray-900 dark:text-gray-100
                       font-mono leading-relaxed outline-none transition-colors"
            placeholder="Escribe en markdown..."
            style={{ overflow: 'hidden' }}
          />
          {saveStatus && (
            <span className="absolute bottom-1.5 right-2.5 text-xs text-gray-400 pointer-events-none">
              {saveStatus}
            </span>
          )}
        </div>
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="cursor-text min-h-[32px]"
        >
          {value ? (
            <div
              className="prose prose-sm dark:prose-invert max-w-none
                         text-gray-800 dark:text-gray-200
                         prose-headings:font-semibold prose-headings:text-gray-900 dark:prose-headings:text-white
                         prose-code:bg-white/60 dark:prose-code:bg-black/20
                         prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                         prose-code:text-sm prose-code:font-mono"
            >
              <ReactMarkdown>{value}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic select-none">
              Haz click para escribir...
            </p>
          )}
          {saveStatus && (
            <span className="text-xs text-gray-400">{saveStatus}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default NoteCalloutBlock;
