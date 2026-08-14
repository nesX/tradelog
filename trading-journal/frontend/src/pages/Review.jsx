import { useState } from 'react';
import { Flag, Clock } from 'lucide-react';
import { useReview } from '../hooks/useReview.js';
import { useToggleFollowUp } from '../hooks/useBlockFollowUp.js';
import { TimeRangeTabs, BlockItem } from '../components/notes/blockReviewShared.jsx';

function ReviewBlockItem({ block, showResolveButton }) {
  const { mutate, isPending } = useToggleFollowUp();

  const action =
    showResolveButton && block.requires_follow_up ? (
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
    ) : null;

  return (
    <BlockItem
      block={block}
      LeadingIcon={block.requires_follow_up ? Flag : null}
      leadingIconClass="text-amber-500"
      action={action}
    />
  );
}

export default function Review() {
  const [hours, setHours] = useState(24);
  const [pendingHours, setPendingHours] = useState(null); // null = "Todos"
  const { data, isLoading } = useReview(hours, pendingHours);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
      <div className="flex items-center gap-3">
        <Flag className="w-5 h-5 text-amber-500" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Revisión</h1>
      </div>

      {/* Sección 1: Pendientes */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
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
          <TimeRangeTabs value={pendingHours} onChange={setPendingHours} includeAll />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data?.pending.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic py-4">
            {pendingHours === null
              ? 'No hay bloques en seguimiento.'
              : 'No hay pendientes en este rango.'}
          </p>
        ) : (
          <div className="space-y-2">
            {data.pending.map((block) => (
              <ReviewBlockItem key={block.id} block={block} showResolveButton />
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
          <TimeRangeTabs value={hours} onChange={setHours} />
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
              <ReviewBlockItem key={block.id} block={block} showResolveButton={false} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
