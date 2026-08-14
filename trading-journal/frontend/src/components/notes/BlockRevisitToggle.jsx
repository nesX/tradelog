import { BookMarked } from 'lucide-react';
import { useToggleRevisit } from '../../hooks/useBlockRevisit.js';

export function BlockRevisitToggle({ block }) {
  const { mutate, isPending } = useToggleRevisit();
  const active = block.marked_for_revisit;

  return (
    <button
      type="button"
      onClick={() => mutate({ blockId: block.id, markedForRevisit: !active })}
      disabled={isPending}
      className={`
        w-6 h-6 flex items-center justify-center rounded
        bg-white dark:bg-gray-800
        border transition-colors shadow-sm
        ${active
          ? 'border-blue-500 dark:border-blue-600 text-blue-500 hover:text-blue-600 hover:border-blue-600'
          : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:text-blue-500 hover:border-blue-300 dark:hover:border-blue-600'
        }
        disabled:opacity-50
      `}
      title={active ? 'Quitar de repaso' : 'Marcar para repasar'}
    >
      <BookMarked className="w-3.5 h-3.5" fill={active ? 'currentColor' : 'none'} />
    </button>
  );
}
