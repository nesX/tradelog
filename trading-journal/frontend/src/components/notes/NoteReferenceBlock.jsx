import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Link2, ExternalLink, FileText, AlertCircle } from 'lucide-react';
import {
  parseReferenceUrl,
  buildNoteUrl,
  buildBlockUrl,
} from '../../utils/referenceLinks.js';

const getHref = (meta) => {
  if (!meta?.target_note_id) return null;
  return meta.target_block_id
    ? buildBlockUrl(meta.target_note_id, meta.target_block_id)
    : buildNoteUrl(meta.target_note_id);
};

// Las sub-notas conservan linked_note_id poblado; usamos el JOIN del repo
// (linked_note_title) para mostrar el título en vivo y renderizamos un link
// interno (sin abrir pestaña nueva).
const SubNoteView = ({ block }) => {
  if (!block.linked_note_id) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-100 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span className="text-sm italic">Nota eliminada</span>
      </div>
    );
  }
  return (
    <Link
      to={`/notes/${block.linked_note_id}`}
      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group"
    >
      <div className="flex-shrink-0 p-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-lg group-hover:bg-blue-200 dark:group-hover:bg-blue-900/60 transition-colors">
        <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
      </div>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors">
        {block.linked_note_title || 'Sub-nota'}
      </span>
    </Link>
  );
};

const NoteReferenceBlock = ({ block, onUpdateMetadata }) => {
  const meta = block.metadata || {};
  const isConfigured = Boolean(meta.target_note_id);
  const isSubNote = Boolean(block.linked_note_id);

  const [urlInput, setUrlInput] = useState('');
  const [parseError, setParseError] = useState(null);
  const [labelDraft, setLabelDraft] = useState(meta.label || '');
  const canEdit = typeof onUpdateMetadata === 'function';

  useEffect(() => {
    setLabelDraft(meta.label || '');
  }, [meta.label]);

  // Sub-notas: render simple con título en vivo, sin editar label.
  if (isSubNote) {
    return <SubNoteView block={block} />;
  }

  const commitFromUrl = (value) => {
    setUrlInput(value);
    if (!value.trim()) {
      setParseError(null);
      return;
    }
    const parsed = parseReferenceUrl(value);
    if (!parsed) {
      setParseError('URL no válida. Pega un enlace de nota o bloque.');
      return;
    }
    setParseError(null);
    onUpdateMetadata({
      target_note_id: parsed.noteId,
      target_block_id: parsed.blockId,
      label: meta.label || 'Referencia',
    });
    setUrlInput('');
  };

  const commitLabel = () => {
    const trimmed = labelDraft.trim();
    if (!trimmed || trimmed === meta.label) return;
    onUpdateMetadata({ label: trimmed });
  };

  const handleLabelKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    }
    if (e.key === 'Escape') {
      setLabelDraft(meta.label || '');
      e.currentTarget.blur();
    }
  };

  // Modo lectura: solo render del link.
  if (!canEdit) {
    if (!isConfigured) {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-100 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm italic">Referencia sin configurar</span>
        </div>
      );
    }
    return (
      <a
        href={getHref(meta)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group"
      >
        <div className="flex-shrink-0 p-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
          <Link2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>
        <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors truncate">
          {meta.label || 'Referencia'}
        </span>
        <ExternalLink className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 dark:group-hover:text-blue-400 flex-shrink-0" />
      </a>
    );
  }

  // Modo edición: bloque sin configurar → input para pegar URL.
  if (!isConfigured) {
    return (
      <div className="flex flex-col gap-2 p-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Link2 className="w-3.5 h-3.5 text-blue-500" />
          <span>Pega el enlace copiado desde otra nota o bloque</span>
        </div>
        <input
          type="text"
          autoFocus
          value={urlInput}
          onChange={(e) => commitFromUrl(e.target.value)}
          placeholder="https://.../notes/123#block-456"
          className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-blue-400 dark:focus:border-blue-500"
        />
        {parseError && (
          <div className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400">
            <AlertCircle className="w-3.5 h-3.5" />
            {parseError}
          </div>
        )}
      </div>
    );
  }

  // Modo edición: bloque configurado → label editable + botón "Abrir".
  const href = getHref(meta);
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-blue-400 dark:hover:border-blue-500 transition-colors group">
      <div className="flex-shrink-0 p-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
        <Link2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
      </div>
      <input
        type="text"
        value={labelDraft}
        onChange={(e) => setLabelDraft(e.target.value)}
        onBlur={commitLabel}
        onKeyDown={handleLabelKey}
        placeholder="Etiqueta de la referencia"
        maxLength={200}
        className="flex-1 bg-transparent text-sm font-medium text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none border-b border-transparent focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
      />
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title="Abrir en pestaña nueva"
        className="flex items-center gap-1 px-2 py-1 text-xs rounded-md text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors flex-shrink-0"
      >
        Abrir <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
};

export default NoteReferenceBlock;
