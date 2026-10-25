import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkDirective from 'remark-directive';
import remarkDirectiveRehype from 'remark-directive-rehype';
import remarkMore from '../../utils/remarkMore';
import remarkSafeDirectives from '../../utils/remarkSafeDirectives';
import remarkNoSetext from '../../utils/remarkNoSetext';
import preserveBlankLines from '../../utils/markdownSpacing';
import MoreBlock from './MoreBlock';
import { useAutosaveTextarea } from '../../hooks/useAutosaveTextarea';
import { useClickOrDoubleClick } from '../../hooks/useClickOrDoubleClick';

const MARKDOWN_PLUGINS = [
  remarkGfm,
  remarkNoSetext,
  remarkDirective,
  remarkMore,
  remarkSafeDirectives,
  remarkBreaks,
  remarkDirectiveRehype,
];
const MARKDOWN_COMPONENTS = { more: MoreBlock };

const NoteTextBlock = ({ block, onUpdate, saveStatus }) => {
  const { value, editing, startEditing, textareaRef, handleChange, handleBlur } =
    useAutosaveTextarea({ block, onUpdate });
  // Con contenido, doble click para editar: el click simple no hace nada
  // (permite seleccionar texto o seguir un link sin entrar en edición). Vacío no
  // hay nada que seleccionar, así que basta un click.
  const handleDoubleClick = useClickOrDoubleClick({ onDoubleClick: startEditing });
  const handleClick = value ? handleDoubleClick : startEditing;

  /* ---------- MODO EDICIÓN ---------- */
  // Misma caja, padding, fuente e interlineado que el preview (prose-sm = 14px /
  // 24px) para que entrar en edición no mueva el bloque; solo queda fijo el ring
  // que en preview aparece con hover.
  if (editing) {
    return (
      <div className="relative rounded-xl px-4 py-3 ring-1 ring-gray-200 dark:ring-gray-600/50">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          rows={1}
          className="block w-full resize-none bg-transparent p-0
                     text-sm leading-6 text-gray-800 dark:text-gray-200 outline-none
                     placeholder:italic placeholder:text-gray-300 dark:placeholder:text-gray-600"
          placeholder="Escribe en markdown..."
          style={{ overflow: 'hidden' }}
        />
        {/* Indicador de guardado */}
        {saveStatus && (
          <span className="absolute bottom-1 right-2 text-xs text-gray-400 pointer-events-none">
            {saveStatus}
          </span>
        )}
      </div>
    );
  }

  /* ---------- MODO PREVIEW ---------- */
  return (
    <div
      onClick={handleClick}
      className="group relative cursor-text touch-manipulation rounded-xl px-4 py-3
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
          <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS} components={MARKDOWN_COMPONENTS}>
            {preserveBlankLines(value)}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm leading-6 text-gray-300 dark:text-gray-600 italic select-none">
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
