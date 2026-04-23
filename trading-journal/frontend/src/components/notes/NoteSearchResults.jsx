import { FileText, Loader2 } from 'lucide-react';
import { useNoteSearch } from '../../hooks/useNotes.js';

const buildBreadcrumb = (parentId, flat) => {
  if (!parentId || !flat) return null;
  const map = {};
  for (const n of flat) map[n.id] = n;

  const path = [];
  let current = map[parentId];
  while (current) {
    path.unshift(current.title || 'Sin título');
    current = current.parent_note_id ? map[current.parent_note_id] : null;
  }
  return path.length > 0 ? path.join(' › ') : null;
};

const HighlightedText = ({ html, fallback }) => {
  if (!html) return <span>{fallback}</span>;
  return (
    <span
      dangerouslySetInnerHTML={{ __html: html }}
      className="[&_b]:font-semibold [&_b]:text-blue-600 dark:[&_b]:text-blue-400"
    />
  );
};

const NoteSearchResults = ({ q, tagIds, flat, onSelectNote }) => {
  const { data: results, isLoading, isFetching } = useNoteSearch({ q, tagIds });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
        <FileText className="w-8 h-8 mb-2 text-gray-300 dark:text-gray-600" />
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No se encontraron notas para esta búsqueda
        </p>
      </div>
    );
  }

  return (
    <div className={`py-1 transition-opacity ${isFetching ? 'opacity-70' : 'opacity-100'}`}>
      {results.map((note) => {
        const breadcrumb = buildBreadcrumb(note.parent_note_id, flat);
        return (
          <button
            key={note.id}
            onClick={() => onSelectNote(note.id)}
            className="w-full text-left px-3 py-2.5
              hover:bg-gray-100 dark:hover:bg-gray-700
              border-b border-gray-100 dark:border-gray-700/50
              transition-colors group"
          >
            <div className="flex items-start gap-2 min-w-0">
              <FileText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400 group-hover:text-blue-500 transition-colors" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate leading-snug">
                  <HighlightedText html={note.title_headline} fallback={note.title || 'Sin título'} />
                </p>

                {breadcrumb && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                    {breadcrumb}
                  </p>
                )}

                {note.content_snippet && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                    <HighlightedText html={note.content_snippet} />
                  </p>
                )}

                {note.tags && note.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {note.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="px-1.5 py-0.5 rounded text-xs font-medium text-white"
                        style={{ backgroundColor: tag.color || '#6B7280' }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default NoteSearchResults;
