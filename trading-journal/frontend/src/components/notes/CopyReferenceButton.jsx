import { Link2 } from 'lucide-react';
import { useToast } from '../common/Toast.jsx';
import { buildNoteUrl, buildBlockUrl } from '../../utils/referenceLinks.js';

const CopyReferenceButton = ({ noteId, blockId = null, variant = 'hover' }) => {
  const toast = useToast();

  const handleCopy = async (e) => {
    e?.stopPropagation();
    e?.preventDefault();
    const url = blockId ? buildBlockUrl(noteId, blockId) : buildNoteUrl(noteId);
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Referencia copiada');
    } catch {
      toast.error('No se pudo copiar la referencia');
    }
  };

  if (variant === 'header') {
    return (
      <button
        type="button"
        onClick={handleCopy}
        title="Copiar referencia a esta nota"
        aria-label="Copiar referencia a esta nota"
        className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 dark:hover:text-blue-400
                   hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
      >
        <Link2 className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copiar referencia al bloque"
      aria-label="Copiar referencia al bloque"
      className="w-6 h-6 flex items-center justify-center rounded
                 bg-white dark:bg-gray-800
                 border border-gray-200 dark:border-gray-700
                 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400
                 hover:border-blue-300 dark:hover:border-blue-700
                 shadow-sm transition-colors"
    >
      <Link2 className="w-3.5 h-3.5" />
    </button>
  );
};

export default CopyReferenceButton;
