import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import remarkDirectiveRehype from 'remark-directive-rehype';
import remarkMore from '../../utils/remarkMore';
import remarkSafeDirectives from '../../utils/remarkSafeDirectives';
import MoreBlock from './MoreBlock';
import { useAutosaveTextarea } from '../../hooks/useAutosaveTextarea';
import { useClickOrDoubleClick } from '../../hooks/useClickOrDoubleClick';

const MARKDOWN_PLUGINS = [
  remarkGfm,
  remarkDirective,
  remarkMore,
  remarkSafeDirectives,
  remarkDirectiveRehype,
];
const MARKDOWN_COMPONENTS = { more: MoreBlock };

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
  const { value, editing, startEditing, textareaRef, handleChange, handleBlur } =
    useAutosaveTextarea({ block, onUpdate });
  // Con contenido, doble click para editar; vacío, basta un click.
  const handleDoubleClick = useClickOrDoubleClick({ onDoubleClick: startEditing });
  const handleClick = value ? handleDoubleClick : startEditing;

  const metadata = block.metadata || {};
  const style = metadata.style || 'info';
  const { bg, border, label } = CALLOUT_STYLES[style] || CALLOUT_STYLES.info;

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
      {/* En edición, mismo alto mínimo, fuente e interlineado que el preview
          (prose-sm = 14px / 24px) y sin borde: el destacado ya delimita el bloque. */}
      {editing ? (
        <div className="min-h-[32px]">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            rows={1}
            className="block w-full resize-none bg-transparent p-0
                       text-sm leading-6 text-gray-800 dark:text-gray-200 outline-none
                       placeholder:italic placeholder:text-gray-400 dark:placeholder:text-gray-500"
            placeholder="Escribe en markdown..."
            style={{ overflow: 'hidden' }}
          />
          {saveStatus && (
            <span className="text-xs text-gray-400">{saveStatus}</span>
          )}
        </div>
      ) : (
        <div
          onClick={handleClick}
          className="cursor-text touch-manipulation min-h-[32px]"
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
              <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS} components={MARKDOWN_COMPONENTS}>
                {value}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm leading-6 text-gray-400 dark:text-gray-500 italic select-none">
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
