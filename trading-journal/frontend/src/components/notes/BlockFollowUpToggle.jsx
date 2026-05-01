import { Flag } from 'lucide-react';
import { useToggleFollowUp } from '../../hooks/useBlockFollowUp.js';

export function BlockFollowUpToggle({ block, noteId }) {
  const { mutate, isPending } = useToggleFollowUp();
  const active = block.requires_follow_up;

  return (
    <button
      type="button"
      onClick={() => mutate({ blockId: block.id, requiresFollowUp: !active, noteId })}
      disabled={isPending}
      className={`
        w-6 h-6 flex items-center justify-center rounded
        bg-white dark:bg-gray-800
        border transition-colors shadow-sm
        ${active
          ? 'border-amber-300 dark:border-amber-700 text-amber-500 hover:text-amber-600 hover:border-amber-400'
          : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:text-amber-500 hover:border-amber-300 dark:hover:border-amber-700'
        }
        disabled:opacity-50
      `}
      title={active ? 'Resolver seguimiento' : 'Marcar para seguimiento'}
    >
      <Flag className="w-3.5 h-3.5" fill={active ? 'currentColor' : 'none'} />
    </button>
  );
}
