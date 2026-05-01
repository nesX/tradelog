import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flag, Clock, BookOpen } from 'lucide-react';
import { useReview } from '../hooks/useReview.js';
import { useToggleFollowUp } from '../hooks/useBlockFollowUp.js';

function timeAgo(dateStr) {
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

const HOURS_OPTIONS = [
  { value: 24, label: '24 h' },
  { value: 48, label: '48 h' },
  { value: 168, label: '1 semana' },
];

function BlockPreview({ content, blockType }) {
  if (!content || blockType === 'image_gallery') {
    return (
      <span className="text-xs italic text-gray-400 dark:text-gray-500">
        {blockType === 'image_gallery' ? 'Galería de imágenes' : 'Sin contenido'}
      </span>
    );
  }
  if (blockType === 'note_link') {
    return <span className="text-xs italic text-gray-400 dark:text-gray-500">Enlace a nota</span>;
  }
  const lines = content.split('\n').filter(Boolean).slice(0, 3).join(' ');
  const preview = lines.length > 120 ? lines.slice(0, 120) + '…' : lines;
  return <span className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{preview}</span>;
}

function BlockItem({ block, showResolveButton }) {
  const navigate = useNavigate();
  const { mutate, isPending } = useToggleFollowUp();

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
      {block.requires_follow_up && (
        <Flag className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" />
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

      {showResolveButton && block.requires_follow_up && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            mutate({ blockId: block.id, requiresFollowUp: false });
          }}
          disabled={isPending}
          className="flex-shrink-0 px-2 py-1 text-xs rounded-lg
                     border border-amber-300 dark:border-amber-700
                     text-amber-600 dark:text-amber-400
                     hover:bg-amber-50 dark:hover:bg-amber-900/30
                     disabled:opacity-50 transition-colors"
        >
          Resolver
        </button>
      )}
    </div>
  );
}

export default function Review() {
  const [hours, setHours] = useState(24);
  const { data, isLoading } = useReview(hours);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
      <div className="flex items-center gap-3">
        <Flag className="w-5 h-5 text-amber-500" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Revisión</h1>
      </div>

      {/* Sección 1: Pendientes */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            Pendientes de seguimiento
          </h2>
          {!isLoading && data && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full
                             bg-amber-100 dark:bg-amber-900/40
                             text-amber-700 dark:text-amber-400">
              {data.pending.length}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data?.pending.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic py-4">
            No hay bloques en seguimiento.
          </p>
        ) : (
          <div className="space-y-2">
            {data.pending.map((block) => (
              <BlockItem key={block.id} block={block} showResolveButton />
            ))}
          </div>
        )}
      </section>

      {/* Sección 2: Actividad reciente */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
              Actividad reciente
            </h2>
          </div>
          <div className="flex gap-1">
            {HOURS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setHours(opt.value)}
                className={`px-3 py-1 text-xs rounded-lg border transition-colors
                  ${hours === opt.value
                    ? 'bg-blue-50 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-medium'
                    : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data?.recent.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic py-4">
            Sin actividad en este período.
          </p>
        ) : (
          <div className="space-y-2">
            {data.recent.map((block) => (
              <BlockItem key={block.id} block={block} showResolveButton={false} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
