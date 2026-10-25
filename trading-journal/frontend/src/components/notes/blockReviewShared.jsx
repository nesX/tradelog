import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

/**
 * Helpers compartidos por las vistas de "Revisión" (follow-up) y "Repaso"
 * (revisit): ambas listan bloques de notas con una preview, un rango temporal
 * y navegación al bloque resaltado. Se extraen aquí para no duplicarlos.
 */

export function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return 'hace 1 semana';
  return `hace ${weeks} semanas`;
}

export const HOURS_OPTIONS = [
  { value: 24, label: '24 h' },
  { value: 48, label: '48 h' },
  { value: 168, label: '1 semana' },
];

export function TimeRangeTabs({ value, onChange, includeAll = false }) {
  const options = includeAll ? [{ value: null, label: 'Todos' }, ...HOURS_OPTIONS] : HOURS_OPTIONS;
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt.label}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 text-xs rounded-lg border transition-colors
            ${value === opt.value
              ? 'bg-blue-50 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-medium'
              : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const IMAGE_BLOCK_LABELS = { image_gallery: 'Galería de imágenes', image: 'Imagen' };

export function BlockPreview({ content, blockType }) {
  if (!content || IMAGE_BLOCK_LABELS[blockType]) {
    return (
      <span className="text-xs italic text-gray-400 dark:text-gray-500">
        {IMAGE_BLOCK_LABELS[blockType] || 'Sin contenido'}
      </span>
    );
  }
  if (blockType === 'reference') {
    return <span className="text-xs italic text-gray-400 dark:text-gray-500">Referencia</span>;
  }
  const lines = content.split('\n').filter(Boolean).slice(0, 3).join(' ');
  const preview = lines.length > 120 ? lines.slice(0, 120) + '…' : lines;
  return <span className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{preview}</span>;
}

/**
 * Fila de bloque en las vistas de repaso/revisión. El click navega al bloque en
 * su nota (con `?highlight=` que NoteEditor usa para hacer scroll + pulso).
 *
 * @param {object}      props.block       - Bloque a mostrar
 * @param {import('lucide-react').LucideIcon} [props.LeadingIcon] - Icono opcional a la izquierda
 * @param {string}      [props.leadingIconClass] - Clases del icono izquierdo
 * @param {React.ReactNode} [props.action] - Botón de acción opcional a la derecha
 *   (cada vista provee el suyo con su propio hook/`stopPropagation`).
 */
export function BlockItem({ block, LeadingIcon = null, leadingIconClass = '', action = null }) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/notes/${block.note_id}?highlight=${block.id}`);
  };

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700
                 bg-white dark:bg-gray-800 hover:border-blue-300 dark:hover:border-blue-700
                 transition-colors cursor-pointer group"
      onClick={handleClick}
    >
      {LeadingIcon && (
        <LeadingIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${leadingIconClass}`} fill="currentColor" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <BookOpen className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
            {block.note_title || 'Sin título'}
          </span>
        </div>
        <BlockPreview content={block.content} blockType={block.block_type} />
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          {timeAgo(block.updated_at)}
        </p>
      </div>

      {action}
    </div>
  );
}
