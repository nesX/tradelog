import { Bell, Ban, Zap, CalendarClock } from 'lucide-react';
import { formatDate } from '../../utils/formatters.js';
import { formatPrice, distancePct } from '../../utils/reminders.js';

const BASE =
  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs whitespace-nowrap transition-colors';

const STYLES = {
  active: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900/50',
  invalidation:
    'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800 dark:hover:bg-purple-900/50',
  hit: 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900/50',
  invalidated:
    'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200 dark:bg-purple-900/50 dark:text-purple-200 dark:border-purple-700 dark:hover:bg-purple-900/70',
  date: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800 dark:hover:bg-sky-900/50',
};

const shortPct = (value) => {
  if (value == null) return null;
  const decimals = Math.abs(value) >= 10 ? 0 : 1;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(decimals)}%`;
};

const arrow = (direction) => (direction === 'above' ? '↑' : '↓');

/** Texto corto de una alerta (también lo usan la lista del modal y Programadas). */
export const alertLabel = (alert) => `${alert.symbol} ${arrow(alert.direction)} ${formatPrice(alert.target_price)}`;

/**
 * Chip de una alerta de precio o de un recordatorio por fecha, en el bloque o
 * bajo el título de la nota. La distancia sale del último precio leído por el
 * job (se actualiza al refrescar la nota tras un tick), no en vivo.
 */
export default function ReminderChip({ alert, reminder, onClick }) {
  let style;
  let Icon;
  let text;
  let title;

  if (reminder) {
    style = STYLES.date;
    Icon = CalendarClock;
    text = formatDate(reminder.remind_at, { includeTime: false });
    title = `Recordatorio: ${formatDate(reminder.remind_at)}${reminder.message ? ` · ${reminder.message}` : ''}`;
  } else if (alert.status === 'triggered') {
    style = alert.is_invalidation ? STYLES.invalidated : STYLES.hit;
    Icon = alert.is_invalidation ? Ban : Zap;
    const when = formatDate(alert.triggered_at, { includeTime: false });
    text = alert.is_invalidation ? `${alert.symbol} invalidada ${when}` : `${alertLabel(alert)} · tocado ${when}`;
    title = alert.message || text;
  } else {
    style = alert.is_invalidation ? STYLES.invalidation : STYLES.active;
    Icon = alert.is_invalidation ? Ban : Bell;
    const pct = shortPct(distancePct(alert.target_price, alert.last_price ?? alert.price_at_creation));
    text = [alertLabel(alert), alert.is_invalidation && 'cierre diario', pct].filter(Boolean).join(' · ');
    title = alert.message || (alert.is_invalidation ? 'Invalidación por cierre diario' : 'Alerta de precio');
  }

  return (
    <button type="button" onClick={onClick} className={`${BASE} ${style}`} title={title}>
      <Icon className="w-3 h-3 flex-shrink-0" />
      <span className="truncate max-w-[16rem]">{text}</span>
    </button>
  );
}

/**
 * Fila compacta con los chips de un anclaje. Los recordatorios ya enviados no
 * llevan chip: su tarjeta está en la bandeja.
 */
export function ReminderChips({ alerts = [], reminders = [], onOpen, className = '' }) {
  const pending = reminders.filter((r) => r.status === 'pending');
  if (alerts.length === 0 && pending.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {alerts.map((a) => (
        <ReminderChip key={`a${a.id}`} alert={a} onClick={() => onOpen({ alert: a })} />
      ))}
      {pending.map((r) => (
        <ReminderChip key={`r${r.id}`} reminder={r} onClick={() => onOpen({ reminder: r })} />
      ))}
    </div>
  );
}
