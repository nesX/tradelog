import { X, Check } from 'lucide-react';

const SIZES = {
  lg: 'gap-1 px-2 py-0.5 text-[0.95rem]',
  md: 'gap-1 px-2 py-0.5 text-xs',
  sm: 'gap-0.5 px-1.5 py-px text-xs',
};

const ICON_SIZES = { lg: 'w-4 h-4', md: 'w-3 h-3', sm: 'w-3 h-3' };

// `checked`: marca de seleccionado (listas que alternan tags, p. ej. el TagPicker).
const NoteTagBadge = ({ tag, onRemove, size = 'md', checked = false }) => {
  const bg = tag.color || '#6B7280';

  return (
    <span
      className={`inline-flex items-center rounded font-medium text-white ${SIZES[size] || SIZES.md}`}
      style={{ backgroundColor: bg }}
    >
      {checked && <Check className={`${ICON_SIZES[size] || ICON_SIZES.md} -ml-0.5`} strokeWidth={3} />}
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
