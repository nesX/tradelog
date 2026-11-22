import { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BellRing, Inbox, CalendarClock, History, Pencil, Trash2, ArrowUpRight, Ban, Bell } from 'lucide-react';
import NotificationCard from '../components/notifications/NotificationCard.jsx';
import ReminderModal from '../components/notes/ReminderModal.jsx';
import { alertLabel } from '../components/notes/ReminderChip.jsx';
import ConfirmDialog from '../components/common/ConfirmDialog.jsx';
import {
  useNotifications,
  useNotificationHistory,
  useNotificationCount,
  useResolveNotification,
} from '../hooks/useNotifications.js';
import { usePriceAlerts, useDeletePriceAlert } from '../hooks/usePriceAlerts.js';
import { useDateReminders, useDeleteDateReminder } from '../hooks/useDateReminders.js';
import { formatDate } from '../utils/formatters.js';
import { formatSignedPct } from '../utils/reminders.js';

const TABS = [
  { key: 'pending', label: 'Pendientes', Icon: Inbox },
  { key: 'scheduled', label: 'Programadas', Icon: CalendarClock },
  { key: 'history', label: 'Historial', Icon: History },
];

const analysisLink = (item) => `/notes/${item.note_id}${item.block_id ? `?highlight=${item.block_id}` : ''}`;

function Empty({ children }) {
  return <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-12">{children}</p>;
}

function Loading() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/** Pestañas Pendientes e Historial: lista de tarjetas con sus acciones. */
function CardList({ cards, onEditAlert, onEditReminder, onDeleteAlert }) {
  const resolve = useResolveNotification();
  return (
    <div className="space-y-3">
      {cards.map((card) => (
        <NotificationCard
          key={card.id}
          card={card}
          busy={resolve.isPending && resolve.variables?.id === card.id}
          onResolve={(c, { deleteSiblings } = {}) =>
            resolve.mutate({
              id: c.id,
              delete_sibling_alerts: Boolean(deleteSiblings),
            })
          }
          onEditAlert={onEditAlert}
          onEditReminder={onEditReminder}
          onDeleteAlert={onDeleteAlert}
        />
      ))}
    </div>
  );
}

function ScheduledRow({ icon: Icon, iconClass, title, subtitle, item, onEdit, onDelete }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconClass}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {item.note_title}
          {item.block_excerpt && <span className="italic"> · “{item.block_excerpt}”</span>}
        </p>
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <Link
          to={analysisLink(item)}
          className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-700"
          title="Ir al análisis"
        >
          <ArrowUpRight className="w-4 h-4" />
        </Link>
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          title="Editar"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"
          title="Borrar"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </li>
  );
}

/** Pestaña Programadas: todo lo armado, para consultar y administrar. */
function Scheduled({ onEditAlert, onEditReminder, onDelete }) {
  const { data: alerts = [], isLoading: loadingAlerts } = usePriceAlerts('active');
  const { data: reminders = [], isLoading: loadingReminders } = useDateReminders('pending');
  const [symbolFilter, setSymbolFilter] = useState('');

  const symbols = useMemo(() => [...new Set(alerts.map((a) => a.symbol))].sort(), [alerts]);
  // Más cerca del nivel primero; sin precio conocido, al final
  const sortedAlerts = useMemo(
    () =>
      alerts
        .filter((a) => !symbolFilter || a.symbol === symbolFilter)
        .sort((a, b) => Math.abs(a.distance_pct ?? Infinity) - Math.abs(b.distance_pct ?? Infinity)),
    [alerts, symbolFilter],
  );

  if (loadingAlerts || loadingReminders) return <Loading />;
  if (alerts.length === 0 && reminders.length === 0) {
    return <Empty>No hay nada armado. Crea recordatorios desde el icono de campana de un bloque o de una nota.</Empty>;
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Alertas de precio activas <span className="text-gray-400 font-normal">({alerts.length})</span>
          </h2>
          {symbols.length > 1 && (
            <select
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              className="input w-auto py-1 text-sm"
            >
              <option value="">Todos los símbolos</option>
              {symbols.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>
        {sortedAlerts.length === 0 ? (
          <Empty>Sin alertas activas.</Empty>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {sortedAlerts.map((a) => (
              <ScheduledRow
                key={a.id}
                item={a}
                icon={a.is_invalidation ? Ban : Bell}
                iconClass={a.is_invalidation ? 'text-purple-500' : 'text-blue-500'}
                title={`${alertLabel(a)}${a.is_invalidation ? ' · cierre diario' : ''}${
                  a.distance_pct != null ? ` · ${formatSignedPct(a.distance_pct)}` : ''
                }`}
                subtitle={[a.message, a.deadline_at && `límite ${formatDate(a.deadline_at, { includeTime: false })}`]
                  .filter(Boolean)
                  .join(' · ')}
                onEdit={() => onEditAlert(a)}
                onDelete={() => onDelete({ kind: 'alert', item: a })}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
          Recordatorios por fecha <span className="text-gray-400 font-normal">({reminders.length})</span>
        </h2>
        {reminders.length === 0 ? (
          <Empty>Sin recordatorios pendientes.</Empty>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {reminders.map((r) => (
              <ScheduledRow
                key={r.id}
                item={r}
                icon={CalendarClock}
                iconClass="text-sky-500"
                title={formatDate(r.remind_at)}
                subtitle={r.message}
                onEdit={() => onEditReminder(r)}
                onDelete={() => onDelete({ kind: 'reminder', item: r })}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Bandeja de recordatorios de análisis. Las tarjetas esperan en Pendientes hasta
 * que el usuario actúa.
 */
export default function Reminders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'pending';
  const setTab = (key) => setSearchParams(key === 'pending' ? {} : { tab: key }, { replace: true });

  const { data: openCards = [], isLoading: loadingOpen } = useNotifications({
    enabled: tab === 'pending',
  });
  const history = useNotificationHistory({ enabled: tab === 'history' });
  const { data: openCount } = useNotificationCount();
  const deleteAlert = useDeletePriceAlert();
  const deleteReminder = useDeleteDateReminder();

  // Modal precargado: { alert, closeOnSave } | { reminder, closeOnSave }
  const [modal, setModal] = useState(null);
  // Confirmación de borrado: { kind: 'alert'|'reminder', item }
  const [pendingDelete, setPendingDelete] = useState(null);

  const editAlertFromCard = (card) => setModal({ alert: card.price_alert });
  const editReminderFromCard = (card) => setModal({ reminder: card.date_reminder });
  const deleteAlertFromCard = (card) => setPendingDelete({ kind: 'alert', item: card.price_alert });

  const confirmDelete = () => {
    const { kind, item } = pendingDelete;
    const mutation = kind === 'alert' ? deleteAlert : deleteReminder;
    mutation.mutate(item.id, { onSettled: () => setPendingDelete(null) });
  };

  return (
    <>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <BellRing className="w-5 h-5 text-rose-500" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Recordatorios</h1>
        </div>

        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 -mb-px text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === key
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {key === 'pending' && openCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500 text-white">
                  {openCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'pending' &&
          (loadingOpen ? (
            <Loading />
          ) : openCards.length === 0 ? (
            <Empty>
              No hay tarjetas pendientes. Cuando un precio llegue a su nivel o venza una fecha, aparecerán aquí.
            </Empty>
          ) : (
            <CardList
              cards={openCards}
              onEditAlert={editAlertFromCard}
              onEditReminder={editReminderFromCard}
              onDeleteAlert={deleteAlertFromCard}
            />
          ))}

        {tab === 'scheduled' && (
          <Scheduled
            onEditAlert={(alert) => setModal({ alert, fromList: true })}
            onEditReminder={(reminder) => setModal({ reminder, fromList: true })}
            onDelete={setPendingDelete}
          />
        )}

        {tab === 'history' &&
          (history.isLoading ? (
            <Loading />
          ) : (history.data || []).length === 0 ? (
            <Empty>Todavía no hay tarjetas resueltas.</Empty>
          ) : (
            <div className="space-y-3">
              <CardList cards={history.data} />
              {history.hasNextPage && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => history.fetchNextPage()}
                    disabled={history.isFetchingNextPage}
                    className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    {history.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
                  </button>
                </div>
              )}
            </div>
          ))}
      </div>

      {/* Modales fuera del contenedor space-y: su margin-top desplazaría el overlay fijo */}
      {modal && (
        <ReminderModal
          onClose={() => setModal(null)}
          initialAlert={modal.alert || null}
          initialReminder={modal.reminder || null}
          closeOnSave
          title={
            modal.alert
              ? modal.alert.status === 'triggered'
                ? 'Re-armar alerta'
                : 'Editar alerta'
              : modal.reminder?.status === 'sent'
                ? 'Re-programar recordatorio'
                : 'Editar recordatorio'
          }
        />
      )}

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title={pendingDelete?.kind === 'alert' ? 'Borrar alerta' : 'Borrar recordatorio'}
        message={
          pendingDelete?.kind === 'alert'
            ? `Se borrará la alerta ${alertLabel(pendingDelete.item)}. Sus tarjetas abiertas se archivarán.`
            : 'Se borrará el recordatorio. Sus tarjetas abiertas se archivarán.'
        }
        isLoading={deleteAlert.isPending || deleteReminder.isPending}
      />
    </>
  );
}
