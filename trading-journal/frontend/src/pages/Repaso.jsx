import { useState } from 'react';
import { BookMarked } from 'lucide-react';
import { useRevisit } from '../hooks/useRevisit.js';
import { useToggleRevisit } from '../hooks/useBlockRevisit.js';
import { TimeRangeTabs, BlockItem } from '../components/notes/blockReviewShared.jsx';

function RepasoBlockItem({ block }) {
  const { mutate, isPending } = useToggleRevisit();

  const action = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        mutate({ blockId: block.id, markedForRevisit: false });
      }}
      disabled={isPending}
      className="flex-shrink-0 px-2 py-1 text-xs rounded-lg
                 border border-blue-500 dark:border-blue-600
                 text-blue-600 dark:text-blue-400
                 hover:bg-blue-50 dark:hover:bg-blue-900/30
                 disabled:opacity-50 transition-colors"
    >
      Repasado
    </button>
  );

  return (
    <BlockItem
      block={block}
      LeadingIcon={BookMarked}
      leadingIconClass="text-blue-500"
      action={action}
    />
  );
}

export default function Repaso() {
  const [pendingHours, setPendingHours] = useState(null); // null = "Todos"
  const { data, isLoading } = useRevisit(pendingHours);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
      <div className="flex items-center gap-3">
        <BookMarked className="w-5 h-5 text-blue-500" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Repaso</h1>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
              Bloques para repasar
            </h2>
            {!isLoading && data && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full
                               bg-blue-100 dark:bg-blue-900/40
                               text-blue-700 dark:text-blue-400">
                {data.blocks.length}
              </span>
            )}
          </div>
          <TimeRangeTabs value={pendingHours} onChange={setPendingHours} includeAll />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data?.blocks.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic py-4">
            {pendingHours === null
              ? 'No hay bloques marcados para repasar.'
              : 'No hay bloques para repasar en este rango.'}
          </p>
        ) : (
          <div className="space-y-2">
            {data.blocks.map((block) => (
              <RepasoBlockItem key={block.id} block={block} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
