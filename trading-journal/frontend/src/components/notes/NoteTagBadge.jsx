import { X } from 'lucide-react';

const SIZES = {
  md: 'gap-1 px-2 py-0.5 text-xs',
  sm: 'gap-0.5 px-1.5 py-px text-[11px] leading-4',
};

const NoteTagBadge = ({ tag, onRemove, size = 'md' }) => {
  const bg = tag.color || '#6B7280';

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium text-white ${SIZES[size] || SIZES.md}`}
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
