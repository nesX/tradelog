import { formatDate } from './formatters.js';
import { formatPrice, distancePct } from './reminders.js';

/**
 * Textos de las tarjetas de /recordatorios. Los usan la tarjeta (NotificationCard)
 * y el service worker para las notificaciones push (src/sw.js), así que este
 * módulo y todo lo que importa NO pueden tocar `window`, `document` ni
 * `localStorage` al cargarse: el SW fallaría al instalarse y los dispositivos se
 * quedarían con el frontend viejo. Lo comprueba notificationText.test.js.
 */

const HOUR_MS = 3_600_000;

const pad = (n) => String(n).padStart(2, '0');
const hourRange = (iso) => {
  const start = new Date(iso);
  const end = new Date(start.getTime() + HOUR_MS);
  return `${pad(start.getHours())}:00–${pad(end.getHours())}:00`;
};
// El cierre diario de Binance es el de la vela de 23:00 UTC: su día es el día UTC
const utcDay = (iso) => {
  const d = new Date(iso);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};

export const VARIANT_LABELS = {
  price_alert_hit: 'Nivel tocado',
  price_alert_near: 'Cerca del nivel',
  price_alert_invalidation: 'Tesis invalidada',
  price_alert_deadline: 'Fecha límite',
  price_alert_delisted: 'Perpetuo deslistado',
  date_reminder_due: 'Recordatorio',
};

/**
 * Titular y detalle de la tarjeta según su tipo (a partir de la foto del payload).
 * Lanza con un tipo desconocido: la tarjeta muestra el tipo crudo y el SW, un
 * aviso genérico.
 */
export const describe = (card) => {
  const p = card.payload || {};
  const target = formatPrice(p.target_price);
  const above = p.direction === 'above';

  switch (card.type) {
    case 'price_alert_hit':
      return {
        headline: `${p.symbol} tocó ${target}`,
        detail: p.candle_open_time
          ? `Vela ${formatDate(p.candle_open_time, { includeTime: false })} · ${hourRange(p.candle_open_time)}: ${
              above ? 'máximo' : 'mínimo'
            } ${formatPrice(p.candle_value)}`
          : null,
      };
    case 'price_alert_near': {
      if (p.is_invalidation) {
        return {
          headline: `${p.symbol} llegó a ${formatPrice(p.candle_value)}`,
          detail: `Invalidación en ${target}: salta solo si cierra el día por ${above ? 'encima' : 'debajo'}.`,
        };
      }
      const gap = p.candle_value && p.target_price ? Math.abs(distancePct(p.target_price, p.candle_value)) : null;
      return {
        headline: `${p.symbol} a ${gap != null ? `${gap.toFixed(1)}%` : 'poco'} de ${target}`,
        detail: p.candle_open_time
          ? `Llegó a ${formatPrice(p.candle_value)} · ${formatDate(p.candle_open_time, { includeTime: false })} ${hourRange(
              p.candle_open_time
            )}`
          : null,
      };
    }
    case 'price_alert_invalidation':
      return {
        headline: `${p.symbol} cerró ${above ? 'sobre' : 'bajo'} ${target}`,
        detail: p.candle_open_time ? `Cierre diario del ${utcDay(p.candle_open_time)}: ${formatPrice(p.candle_value)}` : null,
      };
    case 'price_alert_deadline':
      return {
        headline: `${p.symbol} ${above ? '↑' : '↓'} ${target} no se tocó antes del ${formatDate(p.deadline_at, {
          includeTime: false,
        })}`,
        detail: '¿Sigue vigente el análisis?',
      };
    case 'price_alert_delisted':
      return {
        headline: `${p.symbol} dejó de cotizar en Binance Futures`,
        detail: `La alerta ${above ? '↑' : '↓'} ${target} ya no se vigila.`,
      };
    case 'date_reminder_due':
      return {
        headline: p.message || 'Revisar este análisis',
        detail: `Programado para el ${formatDate(p.remind_at)}`,
      };
    default:
      throw new Error(`Tipo de tarjeta desconocido: ${card.type}`);
  }
};
