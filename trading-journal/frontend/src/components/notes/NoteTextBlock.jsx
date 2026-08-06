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
      onClick={startEditing}
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
          <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS} components={MARKDOWN_COMPONENTS}>
            {preserveBlankLines(value)}
          </ReactMarkdown>
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
