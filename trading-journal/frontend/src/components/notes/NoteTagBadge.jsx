import { X } from 'lucide-react';

const NoteTagBadge = ({ tag, onRemove }) => {
  const bg = tag.color || '#6B7280';

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: bg }}
    >
      {tag.name}
      {onRemove && (
        <button
          onClick={() => onRemove(tag.id)}
          className="hover:opacity-70 transition-opacity"
          title="Quitar tag"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
};

export default NoteTagBadge;
