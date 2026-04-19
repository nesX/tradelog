import { Link } from 'react-router-dom';
import { FileText, AlertCircle } from 'lucide-react';

const NoteLinkBlock = ({ block }) => {
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

export default NoteLinkBlock;
