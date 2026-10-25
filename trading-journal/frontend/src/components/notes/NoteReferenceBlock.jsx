import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Link2, ExternalLink, FileText, AlertCircle } from 'lucide-react';
import { parseReferenceUrl } from '../../utils/referenceLinks.js';
import { useClickOrDoubleClick } from '../../hooks/useClickOrDoubleClick.js';

// Ruta interna de react-router (relativa) hacia la nota/bloque referenciado. Usar
// <Link to> en vez de <a href absoluto target="_blank"> evita sacar de la PWA
// standalone al abrir una referencia interna.
const getToPath = (meta) => {
  if (!meta?.target_note_id) return null;
  return meta.target_block_id
    ? `/notes/${meta.target_note_id}#block-${meta.target_block_id}`
    : `/notes/${meta.target_note_id}`;
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
        {block.linked_note_title || 'Nota'}
      </span>
    </Link>
  );
};

// Tarjeta del enlace configurado. Compartida por el modo lectura y el modo
// edición en reposo (en este último intercepta el click vía `onClick`).
const ReferenceCard = ({ to, label, onClick, title }) => (
  <Link
    to={to}
    onClick={onClick}
    title={title}
    className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group touch-manipulation"
  >
    <div className="flex-shrink-0 p-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
      <Link2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
    </div>
    <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors truncate">
      {label || 'Referencia'}
    </span>
    <ExternalLink className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 dark:group-hover:text-blue-400 flex-shrink-0" />
  </Link>
);

const NoteReferenceBlock = ({ block, onUpdateMetadata }) => {
  const meta = block.metadata || {};
  const isConfigured = Boolean(meta.target_note_id);
  const isSubNote = Boolean(block.linked_note_id);

  const [urlInput, setUrlInput] = useState('');
  const [parseError, setParseError] = useState(null);
  const [labelDraft, setLabelDraft] = useState(meta.label || '');
  const [editingLabel, setEditingLabel] = useState(false);
  const cancelEditRef = useRef(false);
  const canEdit = typeof onUpdateMetadata === 'function';
  const navigate = useNavigate();
  const toPath = getToPath(meta);

  useEffect(() => {
    setLabelDraft(meta.label || '');
  }, [meta.label]);

  // Como una sub-nota: click abre la referencia; doble click edita la etiqueta.
  const handleCardClick = useClickOrDoubleClick({
    onSingleClick: () => navigate(toPath),
    onDoubleClick: () => setEditingLabel(true),
  });

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
    if (!trimmed) {
      setLabelDraft(meta.label || '');
      return;
    }
    if (trimmed === meta.label) return;
    onUpdateMetadata({ label: trimmed });
  };

  // Al salir del input (blur, Enter o Escape) se vuelve a la tarjeta. Escape
  // descarta el borrador: se marca con un ref porque el blur se dispara en el
  // mismo tick y su closure aún vería el texto editado.
  const finishLabelEdit = () => {
    if (cancelEditRef.current) {
      cancelEditRef.current = false;
      setLabelDraft(meta.label || '');
    } else {
      commitLabel();
    }
    setEditingLabel(false);
  };

  const handleLabelKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    }
    if (e.key === 'Escape') {
      cancelEditRef.current = true;
      e.currentTarget.blur();
    }
  };

  const handleCardLinkClick = (e) => {
    // Click con modificador (Ctrl/Cmd/Shift/Alt): comportamiento nativo del link (nueva pestaña/ventana).
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    handleCardClick(e);
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
    return <ReferenceCard to={toPath} label={meta.label} />;
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

  // Modo edición: bloque configurado, editando la etiqueta (tras doble click).
  if (editingLabel) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border border-blue-400 dark:border-blue-500 bg-gray-50 dark:bg-gray-800">
        <div className="flex-shrink-0 p-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
          <Link2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>
        <input
          type="text"
          autoFocus
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={finishLabelEdit}
          onKeyDown={handleLabelKey}
          placeholder="Etiqueta de la referencia"
          maxLength={200}
          className="flex-1 bg-transparent text-sm font-medium text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none"
        />
      </div>
    );
  }

  // Modo edición: bloque configurado en reposo → tarjeta como en lectura.
  // `labelDraft` (y no meta.label) para no mostrar la etiqueta vieja mientras
  // el guardado recién lanzado vuelve del servidor.
  return (
    <ReferenceCard
      to={toPath}
      label={labelDraft}
      onClick={handleCardLinkClick}
      title="Click para abrir · doble click para editar la etiqueta"
    />
  );
};

export default NoteReferenceBlock;
