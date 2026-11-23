import { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, Bell, Ban, CalendarClock, Pencil, Trash2, AlertTriangle, Info } from 'lucide-react';
import Modal from '../common/Modal.jsx';
import Button from '../common/Button.jsx';
import DateTimeInput from '../common/DateTimeInput.jsx';
import { useToast } from '../common/Toast.jsx';
import SymbolCombobox from './SymbolCombobox.jsx';
import { alertLabel } from './ReminderChip.jsx';
import { useMarketSymbols, useSymbolPrice } from '../../hooks/useMarketSymbols.js';
import { useCreatePriceAlert, useUpdatePriceAlert, useDeletePriceAlert } from '../../hooks/usePriceAlerts.js';
import {
  useCreateDateReminder,
  useUpdateDateReminder,
  useDeleteDateReminder,
} from '../../hooks/useDateReminders.js';
import { formatDate } from '../../utils/formatters.js';
import {
  isTradfi,
  formatPrice,
  distancePct,
  formatSignedPct,
  isWithinNearBand,
  nearLevel,
  isCrossed,
  dailyCloseLocalTime,
  toLocalInputValue,
  localInputToIso,
  defaultReminderDate,
  timeAgo,
  getLastSymbol,
  setLastSymbol,
} from '../../utils/reminders.js';

const DEFAULT_NEAR_PCT = 3;

const emptyPriceForm = (symbol) => ({
  symbol,
  level: '',
  direction: 'above',
  // 'auto': deducida del precio actual; 'manual': elegida (o invertida) por el usuario
  directionMode: 'auto',
  nearEnabled: true,
  nearPct: String(DEFAULT_NEAR_PCT),
  isInvalidation: false,
  deadline: '',
  message: '',
});

// Una fecha límite vencida no se precarga: bloquearía el guardado ("debe ser futura").
// Al re-armar, el backend la quita; si no se re-arma, la evalúa el job con las velas.
const futureDeadline = (alert) =>
  alert.deadline_at && new Date(alert.deadline_at) > new Date() ? alert.deadline_at : null;

const priceFormFromAlert = (alert) => ({
  symbol: alert.symbol,
  level: String(alert.target_price),
  direction: alert.direction,
  directionMode: 'manual',
  nearEnabled: alert.near_pct != null,
  nearPct: String(alert.near_pct ?? DEFAULT_NEAR_PCT),
  isInvalidation: alert.is_invalidation,
  deadline: toLocalInputValue(futureDeadline(alert)),
  message: alert.message || '',
});

// Un recordatorio ya enviado se re-programa desde mañana a las 08:00, no desde su fecha vencida
const dateFormFromReminder = (reminder) => ({
  remindAt: reminder.status === 'sent' ? defaultReminderDate() : toLocalInputValue(reminder.remind_at),
  message: reminder.message || '',
});

const toMinute = (value) => (value ? Math.floor(new Date(value).getTime() / 60_000) : null);

const apiErrorMessage = (err) =>
  err?.details?.length ? err.details.map((d) => d.message).join('. ') : err?.message || 'No se pudo guardar';

// Re-render periódico para que "hace 20 s" no se congele
function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function Notice({ tone = 'warning', children }) {
  const tones = {
    warning: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-800',
    info: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-200 dark:border-blue-800',
  };
  const Icon = tone === 'warning' ? AlertTriangle : Info;
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${tones[tone]}`}>
      <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function Row({ label, children, hint }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[7.5rem_1fr] sm:items-center gap-1 sm:gap-3">
      <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
      <div>
        {children}
        {hint && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
      </div>
    </div>
  );
}

/** Lista de lo armado en el anclaje, con editar y borrar (confirmación en línea). */
function AnchorReminderList({ alerts, reminders, editingId, onEditAlert, onEditReminder }) {
  const [confirming, setConfirming] = useState(null); // 'a5' | 'r3'
  const deleteAlert = useDeletePriceAlert();
  const deleteReminder = useDeleteDateReminder();
  if (alerts.length === 0 && reminders.length === 0) return null;

  const rowClass = 'flex items-center gap-2 py-1.5 text-sm';
  const iconBtn =
    'p-1.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors';

  const confirmRow = (key, onConfirm) =>
    confirming === key && (
      <span className="flex items-center gap-1 text-xs">
        <button
          type="button"
          onClick={() => {
            onConfirm();
            setConfirming(null);
          }}
          className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
        >
          Borrar
        </button>
        <button type="button" onClick={() => setConfirming(null)} className="px-2 py-1 rounded text-gray-500">
          No
        </button>
      </span>
    );

  return (
    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Recordatorios de este anclaje</p>
      <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
        {alerts.map((a) => {
          const key = `a${a.id}`;
          const Icon = a.is_invalidation ? Ban : Bell;
          return (
            <li key={key} className={`${rowClass} ${editingId === key ? 'text-blue-600 dark:text-blue-400' : ''}`}>
              <Icon className={`w-4 h-4 flex-shrink-0 ${a.is_invalidation ? 'text-purple-500' : 'text-blue-500'}`} />
              <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-200">
                {alertLabel(a)}
                {a.message && <span className="text-gray-400"> · {a.message}</span>}
                {a.status === 'triggered' && (
                  <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">
                    · {a.is_invalidation ? 'invalidada' : 'tocada'} {formatDate(a.triggered_at, { includeTime: false })}
                  </span>
                )}
              </span>
              {confirmRow(key, () => deleteAlert.mutate(a.id)) || (
                <>
                  <button type="button" onClick={() => onEditAlert(a)} className={iconBtn} title="Editar o re-armar">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => setConfirming(key)} className={iconBtn} title="Borrar">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </li>
          );
        })}
        {reminders.map((r) => {
          const key = `r${r.id}`;
          return (
            <li key={key} className={`${rowClass} ${editingId === key ? 'text-blue-600 dark:text-blue-400' : ''}`}>
              <CalendarClock className="w-4 h-4 flex-shrink-0 text-sky-500" />
              <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-200">
                {formatDate(r.remind_at)}
                {r.message && <span className="text-gray-400"> · {r.message}</span>}
                {r.status === 'sent' && <span className="ml-1 text-xs text-gray-400">· enviado</span>}
              </span>
              {confirmRow(key, () => deleteReminder.mutate(r.id)) || (
                <>
                  <button type="button" onClick={() => onEditReminder(r)} className={iconBtn} title="Editar o re-programar">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => setConfirming(key)} className={iconBtn} title="Borrar">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Crear, editar, re-armar y re-programar recordatorios de análisis. Pestañas
 * Precio (alerta sobre un perpetuo de Binance Futures) y Fecha. En pantallas
 * chicas ocupa toda la pantalla.
 *
 * El componente se monta solo mientras está abierto (el estado del formulario
 * arranca de las props).
 *
 * @param anchor          { blockId } | { noteId }: para crear y para la lista
 * @param alerts/reminders lo armado en el anclaje (block.price_alerts / note.price_alerts…)
 * @param initialAlert    alerta a editar o re-armar (desde un chip o una tarjeta)
 * @param initialReminder recordatorio a editar o re-programar
 * @param closeOnSave     desde una tarjeta: cerrar al guardar (el backend resuelve la tarjeta)
 */
export default function ReminderModal({
  onClose,
  anchor = null,
  alerts = [],
  reminders = [],
  initialAlert = null,
  initialReminder = null,
  initialTab = 'price',
  closeOnSave = false,
  title,
}) {
  const toast = useToast();
  const now = useNow(5000);
  const [tab, setTab] = useState(initialReminder ? 'date' : initialTab);
  const [editingAlert, setEditingAlert] = useState(initialAlert);
  const [editingReminder, setEditingReminder] = useState(initialReminder);
  const [form, setForm] = useState(() =>
    initialAlert ? priceFormFromAlert(initialAlert) : emptyPriceForm(getLastSymbol() || '')
  );
  const [dateForm, setDateForm] = useState(() =>
    initialReminder ? dateFormFromReminder(initialReminder) : { remindAt: defaultReminderDate(), message: '' }
  );
  const [error, setError] = useState(null);

  const { data: symbols = [], isLoading: symbolsLoading } = useMarketSymbols();
  const { data: priceData } = useSymbolPrice(form.symbol, { enabled: tab === 'price' });
  const createAlert = useCreatePriceAlert();
  const updateAlert = useUpdatePriceAlert();
  const createReminder = useCreateDateReminder();
  const updateReminder = useUpdateDateReminder();

  // Sin último símbolo guardado: el primero que el usuario usó o BTCUSDT
  useEffect(() => {
    if (form.symbol || symbols.length === 0) return;
    const fallback = symbols.find((s) => s.last_used_at)?.symbol || 'BTCUSDT';
    setForm((f) => ({ ...f, symbol: fallback }));
  }, [symbols, form.symbol]);

  const symbolInfo = symbols.find((s) => s.symbol === form.symbol);
  const tickSize = symbolInfo?.tick_size ?? null;
  const price = priceData?.price ?? null;
  const level = Number(form.level) > 0 ? Number(form.level) : null;
  const direction =
    form.directionMode === 'auto' && price != null && level != null ? (level > price ? 'above' : 'below') : form.direction;
  const nearPct = form.nearEnabled ? Number(form.nearPct) : null;
  const crossed = isCrossed(direction, level, price);
  const insideBand = !crossed && isWithinNearBand({ direction, target: level, nearPct }, price);
  const nearPrice = nearPct >= 0.1 && nearPct <= 50 ? nearLevel({ direction, target: level, nearPct }) : null;
  const isEditing = Boolean(editingAlert || editingReminder);
  const saving = createAlert.isPending || updateAlert.isPending || createReminder.isPending || updateReminder.isPending;

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const resetToCreate = () => {
    setEditingAlert(null);
    setEditingReminder(null);
    setForm((f) => emptyPriceForm(f.symbol));
    setDateForm({ remindAt: defaultReminderDate(), message: '' });
    setError(null);
  };

  const startEditAlert = (alert) => {
    setEditingReminder(null);
    setEditingAlert(alert);
    setForm(priceFormFromAlert(alert));
    setTab('price');
    setError(null);
  };

  const startEditReminder = (reminder) => {
    setEditingAlert(null);
    setEditingReminder(reminder);
    setDateForm(dateFormFromReminder(reminder));
    setTab('date');
    setError(null);
  };

  const afterSave = (message) => {
    toast.success(message);
    if (closeOnSave) onClose();
    else resetToCreate();
  };

  const anchorFields = () => (anchor?.blockId ? { block_id: anchor.blockId } : { note_id: anchor?.noteId });

  const handleSavePrice = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.symbol) return setError('Elige un símbolo');
    if (level == null) return setError('Indica un nivel mayor que 0');
    if (form.nearEnabled && !(nearPct >= 0.1 && nearPct <= 50)) {
      return setError('El aviso previo debe estar entre 0.1% y 50%');
    }
    const deadlineIso = localInputToIso(form.deadline);
    if (deadlineIso && new Date(deadlineIso) <= new Date()) return setError('La fecha límite debe ser futura');

    const data = {
      target_price: level,
      direction,
      is_invalidation: form.isInvalidation,
      near_pct: nearPct,
      message: form.message.trim() || null,
    };
    try {
      if (editingAlert) {
        // La fecha límite solo se envía si cambió respecto a lo precargado: una vencida
        // se muestra vacía y, si el campo sigue vacío, no se envía (no se borra sin querer)
        const deadlineChanged = toMinute(deadlineIso) !== toMinute(futureDeadline(editingAlert));
        await updateAlert.mutateAsync({
          id: editingAlert.id,
          data: { ...data, ...(deadlineChanged ? { deadline_at: deadlineIso } : {}) },
        });
        setLastSymbol(form.symbol);
        afterSave('Alerta actualizada');
      } else {
        await createAlert.mutateAsync({ ...data, ...anchorFields(), symbol: form.symbol, deadline_at: deadlineIso });
        setLastSymbol(form.symbol);
        afterSave('Alerta creada');
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  const handleSaveDate = async (e) => {
    e.preventDefault();
    setError(null);
    const remindIso = localInputToIso(dateForm.remindAt);
    if (!remindIso) return setError('Indica la fecha y la hora');
    if (new Date(remindIso).getTime() < Date.now() + 60_000) {
      return setError('La fecha debe ser al menos 1 minuto en el futuro');
    }
    const message = dateForm.message.trim() || null;
    try {
      if (editingReminder) {
        const dateChanged = toMinute(remindIso) !== toMinute(editingReminder.remind_at);
        await updateReminder.mutateAsync({
          id: editingReminder.id,
          data: { message, ...(dateChanged ? { remind_at: remindIso } : {}) },
        });
        afterSave('Recordatorio actualizado');
      } else {
        await createReminder.mutateAsync({ ...anchorFields(), remind_at: remindIso, message });
        afterSave('Recordatorio creado');
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  const tabButton = (key, label, Icon) => (
    <button
      type="button"
      onClick={() => {
        setTab(key);
        setError(null);
      }}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        tab === key
          ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  const modalTitle = title || (isEditing ? 'Editar recordatorio' : 'Nuevo recordatorio');
  const showList = Boolean(anchor) && !closeOnSave;

  return (
    <Modal isOpen onClose={onClose} title={modalTitle} size="md" fullScreenOnMobile>
      <div className="space-y-4">
        {!isEditing && (
          <div className="inline-flex p-1 rounded-lg bg-gray-100 dark:bg-gray-900/60">
            {tabButton('price', 'Precio', Bell)}
            {tabButton('date', 'Fecha', CalendarClock)}
          </div>
        )}

        {isEditing && !closeOnSave && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-700 dark:text-blue-300">
            <span>
              {editingAlert
                ? editingAlert.status === 'triggered'
                  ? 'Re-armando una alerta disparada'
                  : 'Editando una alerta'
                : 'Editando un recordatorio por fecha'}
            </span>
            <button type="button" onClick={resetToCreate} className="underline">
              Cancelar edición
            </button>
          </div>
        )}

        {tab === 'price' ? (
          <form onSubmit={handleSavePrice} noValidate className="space-y-3">
            <Row label="Símbolo">
              <SymbolCombobox
                symbols={symbols}
                value={form.symbol}
                onChange={(symbol) => setForm((f) => ({ ...f, symbol, directionMode: 'auto' }))}
                disabled={Boolean(editingAlert)}
                isLoading={symbolsLoading}
              />
            </Row>

            <Row label="Precio actual">
              {price != null ? (
                <p className="text-sm text-gray-800 dark:text-gray-100">
                  {formatPrice(price, tickSize)} {symbolInfo?.quote_asset || ''}
                  <span className="text-gray-400"> · {timeAgo(priceData.as_of, now)}</span>
                </p>
              ) : (
                <p className="text-sm text-gray-400">{form.symbol ? 'Sin precio disponible' : '—'}</p>
              )}
            </Row>

            <Row label="Nivel">
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step={tickSize ?? 'any'}
                  className="input flex-1"
                  value={form.level}
                  onChange={(e) => setForm((f) => ({ ...f, level: e.target.value, directionMode: 'auto' }))}
                  placeholder="Precio objetivo"
                />
                {level != null && price != null && (
                  <span className="text-sm text-gray-500 dark:text-gray-400 w-20 text-right tabular-nums">
                    {formatSignedPct(distancePct(level, price))}
                  </span>
                )}
              </div>
            </Row>

            <Row
              label="Dirección"
              hint={
                price == null
                  ? 'Sin precio actual: elige la dirección a mano.'
                  : form.directionMode === 'auto'
                    ? 'Deducida del precio actual; puedes invertirla.'
                    : null
              }
            >
              <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                {[
                  { value: 'above', label: 'Sube hasta', Icon: ArrowUp },
                  { value: 'below', label: 'Baja hasta', Icon: ArrowDown },
                ].map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, direction: value, directionMode: 'manual' }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                      direction === value
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </Row>

            <Row label="Aviso previo">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.1"
                    max="50"
                    step="0.1"
                    className="input w-20"
                    value={form.nearPct}
                    onChange={(e) => setField('nearPct', e.target.value)}
                    disabled={!form.nearEnabled}
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
                {nearPrice != null && (
                  <span className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
                    avisa en {formatPrice(nearPrice, tickSize)}
                  </span>
                )}
                <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={!form.nearEnabled}
                    onChange={(e) => setField('nearEnabled', !e.target.checked)}
                  />
                  sin aviso
                </label>
              </div>
            </Row>

            <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.isInvalidation}
                onChange={(e) => setField('isInvalidation', e.target.checked)}
              />
              <span>
                Es una invalidación
                {form.isInvalidation && (
                  <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Salta solo si una vela diaria cierra por {direction === 'above' ? 'encima' : 'debajo'} (cierre de
                    Binance: 00:00 UTC · {dailyCloseLocalTime()} hora local)
                  </span>
                )}
              </span>
            </label>

            <Row label="Fecha límite" hint="Opcional: si llega sin dispararse, aparece la tarjeta “¿sigue vigente?”.">
              <DateTimeInput value={form.deadline} onChange={(e) => setField('deadline', e.target.value)} />
            </Row>

            <Row label="Mensaje">
              <input
                type="text"
                className="input"
                maxLength={500}
                value={form.message}
                onChange={(e) => setField('message', e.target.value)}
                placeholder="objetivo, invalidación del escenario…"
              />
            </Row>

            <div className="space-y-2">
              {crossed && (
                <Notice>El precio ya está del otro lado del nivel: saltará en el próximo chequeo.</Notice>
              )}
              {insideBand && <Notice tone="info">Ya estás dentro del aviso previo; no se enviará en este armado.</Notice>}
              {isTradfi(symbolInfo?.contract_type) && (
                <Notice>
                  Este perpetuo cotiza 24/7 y no es el instrumento de la bolsa: dibuja tu análisis sobre él (en
                  TradingView, <code>BINANCE:{form.symbol}.P</code>). En acciones, una mecha fuera de horario puede tocar
                  el nivel.
                </Notice>
              )}
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" isLoading={saving}>
                {editingAlert ? (editingAlert.status === 'triggered' ? 'Re-armar' : 'Guardar') : 'Crear recordatorio'}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSaveDate} noValidate className="space-y-3">
            <Row label="Fecha y hora" hint="Hora local. Por defecto, mañana a las 08:00.">
              <DateTimeInput
                value={dateForm.remindAt}
                onChange={(e) => setDateForm((f) => ({ ...f, remindAt: e.target.value }))}
              />
            </Row>
            <Row label="Mensaje">
              <input
                type="text"
                className="input"
                maxLength={500}
                value={dateForm.message}
                onChange={(e) => setDateForm((f) => ({ ...f, message: e.target.value }))}
                placeholder="revisar tras el cierre trimestral…"
              />
            </Row>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" isLoading={saving}>
                {editingReminder
                  ? editingReminder.status === 'sent'
                    ? 'Re-programar'
                    : 'Guardar'
                  : 'Crear recordatorio'}
              </Button>
            </div>
          </form>
        )}

        {showList && (
          <AnchorReminderList
            alerts={alerts}
            reminders={reminders}
            editingId={editingAlert ? `a${editingAlert.id}` : editingReminder ? `r${editingReminder.id}` : null}
            onEditAlert={startEditAlert}
            onEditReminder={startEditReminder}
          />
        )}
      </div>
    </Modal>
  );
}
