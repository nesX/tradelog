import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const buildAncestors = (noteId, flatNotes) => {
  const map = {};
  for (const n of flatNotes) {
    map[n.id] = n;
  }
  const chain = [];
  let current = map[noteId];
  while (current) {
    chain.unshift(current);
    current = current.parent_note_id ? map[current.parent_note_id] : null;
  }
  return chain;
};

const NoteBreadcrumb = ({ noteId, flat = [] }) => {
  const ancestors = buildAncestors(noteId, flat);

  return (
    <nav className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
      <Link to="/notes" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
        Notas
      </Link>
      {ancestors.map((note, i) => (
        <span key={note.id} className="flex items-center gap-1">
          <ChevronRight className="w-3 h-3 flex-shrink-0" />
          {i < ancestors.length - 1 ? (
            <Link
              to={`/notes/${note.id}`}
              className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate max-w-[120px]"
            >
              {note.title}
            </Link>
          ) : (
            <span className="text-gray-800 dark:text-gray-200 font-medium truncate max-w-[180px]">
              {note.title}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
};

export default NoteBreadcrumb;
