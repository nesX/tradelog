import { BellRing } from 'lucide-react';
import { hasArmedReminders } from '../../utils/reminders.js';

/**
 * Abre el modal de recordatorios del bloque. Activo (relleno) si el bloque tiene
 * alertas activas o recordatorios por fecha pendientes.
 */
export function BlockReminderToggle({ block, onOpen }) {
  const active = hasArmedReminders(block.price_alerts, block.date_reminders);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onOpen(block.id);
      }}
      className={`
        w-6 h-6 flex items-center justify-center rounded
        bg-white dark:bg-gray-800
        border transition-colors shadow-sm
        ${active
          ? 'border-rose-400 dark:border-rose-600 text-rose-500 hover:text-rose-600 hover:border-rose-500'
          : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:text-rose-500 hover:border-rose-300 dark:hover:border-rose-600'
        }
      `}
      title={active ? 'Recordatorios del bloque' : 'Añadir recordatorio (precio o fecha)'}
    >
      <BellRing className="w-3.5 h-3.5" fill={active ? 'currentColor' : 'none'} />
    </button>
  );
}
