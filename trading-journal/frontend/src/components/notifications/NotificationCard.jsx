import { Link } from 'react-router-dom';
import { Zap, Bell, Ban, CalendarX, CircleOff, CalendarClock, FileText, MessageSquare, ArrowUpRight } from 'lucide-react';
import { formatDate } from '../../utils/formatters.js';
import { formatPrice, distancePct, formatSignedPct, timeAgo, durationBetween } from '../../utils/reminders.js';
import { describe, VARIANT_LABELS } from '../../utils/notificationText.js';

const VARIANTS = {
  price_alert_hit: { Icon: Zap, label: VARIANT_LABELS.price_alert_hit },
  price_alert_near: {
    Icon: Bell,
    label: VARIANT_LABELS.price_alert_near,
    accent: 'border-l-amber-400 dark:border-l-amber-400',
    iconClass: 'text-amber-500',
  },
  price_alert_invalidation: {
    Icon: Ban,
    label: VARIANT_LABELS.price_alert_invalidation,
    accent: 'border-l-purple-500 dark:border-l-purple-500',
    iconClass: 'text-purple-500',
  },
  price_alert_deadline: {
    Icon: CalendarX,
    label: VARIANT_LABELS.price_alert_deadline,
    accent: 'border-l-blue-500 dark:border-l-blue-500',
    iconClass: 'text-blue-500',
  },
  price_alert_delisted: {
    Icon: CircleOff,
    label: VARIANT_LABELS.price_alert_delisted,
    accent: 'border-l-gray-400 dark:border-l-gray-400',
    iconClass: 'text-gray-400',
  },
  date_reminder_due: {
    Icon: CalendarClock,
    label: VARIANT_LABELS.date_reminder_due,
    accent: 'border-l-sky-500 dark:border-l-sky-500',
    iconClass: 'text-sky-500',
  },
};

const RESOLUTION_LABEL = { dismissed: 'Archivada', rearmed: 'Re-armada', updated: 'Actualizada' };

// Un tipo que esta versión no conoce se muestra crudo
const describeCard = (card) => {
  try {
    return describe(card);
  } catch {
    return { headline: card.type, detail: null };
  }
};

const btn = {
  base: 'px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50',
  primary:
    'border-blue-500 text-blue-600 hover:bg-blue-50 dark:border-blue-600 dark:text-blue-400 dark:hover:bg-blue-900/30',
  neutral:
    'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700/60',
  danger:
    'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-900/30',
};

/**
 * Tarjeta de la bandeja /recordatorios. No se cierra sola: cada acción la
 * resuelve explícitamente (o el backend al re-armar / re-programar desde el modal).
 *
 * @param onResolve(card, { deleteSiblings })  Archivar / Entendido / Mantener sin fecha
 * @param onEditAlert(card)      Re-armar / Ajustar nivel / Extender fecha (modal precargado)
 * @param onEditReminder(card)   Re-programar
 * @param onDeleteAlert(card)    Borrar alerta
 */
export default function NotificationCard({ card, onResolve, onEditAlert, onEditReminder, onDeleteAlert, busy = false }) {
  const p = card.payload || {};
  const resolved = Boolean(card.resolved_at);
  const base = VARIANTS[card.type] || VARIANTS.price_alert_delisted;
  // Disparo: rojo si rompe hacia abajo, verde si hacia arriba
  const variant =
    card.type === 'price_alert_hit'
      ? {
          ...base,
          accent:
            p.direction === 'above'
              ? 'border-l-emerald-500 dark:border-l-emerald-500'
              : 'border-l-red-500 dark:border-l-red-500',
          iconClass: p.direction === 'above' ? 'text-emerald-500' : 'text-red-500',
        }
      : base;
  const { Icon } = variant;
  const { headline, detail } = describeCard(card);

  const alertAvailable = Boolean(card.price_alert) && card.note_available;
  const reminderAvailable = Boolean(card.date_reminder) && card.note_available;
  const siblings = p.sibling_alerts || [];
  const isTrigger = card.type === 'price_alert_hit' || card.type === 'price_alert_invalidation';
  const armedLine =
    p.armed_at && card.type !== 'date_reminder_due'
      ? `Armada ${timeAgo(p.armed_at, new Date(card.created_at).getTime())}${
          p.price_at_creation != null
            ? ` con ${p.symbol} en ${formatPrice(p.price_at_creation)} (${formatSignedPct(
                distancePct(p.target_price, p.price_at_creation)
              )})`
            : ''
        }`
      : null;

  const analysisLink = card.note_available
    ? `/notes/${card.note_id}${card.block_id ? `?highlight=${card.block_id}` : ''}`
    : null;

  const actions = [];
  if (!resolved) {
    if (analysisLink) {
      actions.push(
        <Link key="view" to={analysisLink} className={`${btn.base} ${btn.primary} inline-flex items-center gap-1`}>
          Ver análisis <ArrowUpRight className="w-3 h-3" />
        </Link>
      );
    }
    const resolveBtn = (label, extra = {}, style = btn.neutral) => (
      <button
        key={label}
        type="button"
        disabled={busy}
        onClick={() => onResolve(card, extra)}
        className={`${btn.base} ${style}`}
      >
        {label}
      </button>
    );
    const editBtn = (label, onClick) => (
      <button key={label} type="button" disabled={busy} onClick={() => onClick(card)} className={`${btn.base} ${btn.neutral}`}>
        {label}
      </button>
    );

    switch (card.type) {
      case 'price_alert_hit':
        if (alertAvailable) actions.push(editBtn('Re-armar en otro precio', onEditAlert));
        actions.push(resolveBtn('Archivar'));
        break;
      case 'price_alert_near':
        if (alertAvailable && card.price_alert.status === 'active') actions.push(editBtn('Ajustar nivel', onEditAlert));
        actions.push(resolveBtn('Entendido'));
        break;
      case 'price_alert_invalidation':
        if (siblings.length > 0) {
          actions.push(resolveBtn('Borrar las demás alertas', { deleteSiblings: true }, btn.danger));
        }
        actions.push(resolveBtn('Archivar'));
        break;
      case 'price_alert_deadline':
        if (alertAvailable) actions.push(editBtn('Extender fecha', onEditAlert));
        if (card.price_alert) {
          actions.push(
            <button
              key="delete"
              type="button"
              disabled={busy}
              onClick={() => onDeleteAlert(card)}
              className={`${btn.base} ${btn.danger}`}
            >
              Borrar alerta
            </button>
          );
        }
        actions.push(resolveBtn('Mantener sin fecha'));
        break;
      case 'date_reminder_due':
        if (reminderAvailable) actions.push(editBtn('Re-programar', onEditReminder));
        actions.push(resolveBtn('Archivar'));
        break;
      default:
        actions.push(resolveBtn('Archivar'));
    }
  } else if (analysisLink) {
    actions.push(
      <Link key="view" to={analysisLink} className={`${btn.base} ${btn.neutral} inline-flex items-center gap-1`}>
        Ver análisis <ArrowUpRight className="w-3 h-3" />
      </Link>
    );
  }

  return (
    <article
      id={`card-${card.id}`}
      className={`rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 ${variant.accent}
                  bg-white dark:bg-gray-800 shadow-sm p-4 space-y-2 ${resolved ? 'opacity-90' : ''}`}
    >
      <header className="flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${variant.iconClass}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {variant.label} · {timeAgo(card.created_at)}
          </p>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white break-words">{headline}</h3>
        </div>
        {resolved && (
          <span className="flex-shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">
            {RESOLUTION_LABEL[card.resolution] || 'Cerrada'} · {formatDate(card.resolved_at, { includeTime: false })}
          </span>
        )}
      </header>

      <div className="pl-6 space-y-1 text-sm text-gray-600 dark:text-gray-300">
        {detail && <p>{detail}</p>}
        {armedLine && <p className="text-xs text-gray-500 dark:text-gray-400">{armedLine}</p>}
        {isTrigger && p.armed_at && p.candle_open_time && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {new Date(p.candle_open_time) > new Date(p.armed_at)
              ? `Tardó ${durationBetween(p.armed_at, p.candle_open_time)} desde el armado`
              : 'Saltó en la misma hora del armado'}
          </p>
        )}
        {p.note_title && (
          <p className="flex items-center gap-1.5 text-gray-700 dark:text-gray-200">
            <FileText className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
            <span className="truncate">{p.note_title}</span>
            {!card.note_available && <span className="text-xs text-gray-400">(nota no disponible)</span>}
          </p>
        )}
        {p.block_excerpt && (
          <p className="text-xs italic text-gray-500 dark:text-gray-400 line-clamp-3">“{p.block_excerpt}”</p>
        )}
        {p.message && card.type !== 'date_reminder_due' && (
          <p className="flex items-center gap-1.5 text-xs">
            <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
            {p.message}
          </p>
        )}
        {card.type === 'price_alert_invalidation' && siblings.length > 0 && (
          <p className="text-xs text-purple-700 dark:text-purple-300">
            {siblings.length === 1 ? 'El análisis tiene 1 alerta más activa' : `El análisis tiene ${siblings.length} alertas más activas`}:{' '}
            {siblings.map((s) => `${s.direction === 'above' ? '↑' : '↓'} ${formatPrice(s.target_price)}`).join(', ')}
          </p>
        )}
      </div>

      {actions.length > 0 && <div className="pl-6 pt-1 flex flex-wrap gap-2">{actions}</div>}
    </article>
  );
}
