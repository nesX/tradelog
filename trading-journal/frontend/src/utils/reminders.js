/**
 * Utilidades de los recordatorios de análisis (alertas de precio y por fecha).
 */

export const TRADFI = 'TRADIFI_PERPETUAL';

export const isTradfi = (contractType) => contractType === TRADFI;

/** Decimales del tick (0.10 → 2, 0.00001 → 5). */
export const decimalsFromTick = (tickSize) => {
  if (tickSize == null) return null;
  const text = Number(tickSize).toFixed(12).replace(/0+$/, '');
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
};

/**
 * Precio con separadores (es-ES, como el resto de la app). Con tick, sus
 * decimales; sin tick, hasta 8 decimales sin ceros de relleno.
 */
export const formatPrice = (value, tickSize = null) => {
  if (value == null || Number.isNaN(Number(value))) return '-';
  const decimals = decimalsFromTick(tickSize);
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 8,
  }).format(Number(value));
};

/** Distancia porcentual del precio al nivel: +19.11 si el nivel está por encima. */
export const distancePct = (target, price) => {
  if (target == null || !price) return null;
  return ((Number(target) - Number(price)) / Number(price)) * 100;
};

export const formatSignedPct = (value, decimals = 2) => {
  if (value == null) return '';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(decimals)}%`;
};

/** Precio al que salta el aviso previo (misma fórmula que priceAlertEvaluator del backend). */
export const nearLevel = ({ direction, target, nearPct }) => {
  if (nearPct == null || !target || Number.isNaN(nearPct)) return null;
  return direction === 'above' ? target * (1 - nearPct / 100) : target * (1 + nearPct / 100);
};

/** ¿El precio ya está dentro de la banda de aviso previo (o más allá del nivel)? */
export const isWithinNearBand = ({ direction, target, nearPct }, price) => {
  if (price == null) return false;
  const level = nearLevel({ direction, target, nearPct });
  if (level == null) return false;
  return direction === 'above' ? price >= level : price <= level;
};

/** ¿El precio ya cruzó el nivel? (saltará en el próximo chequeo) */
export const isCrossed = (direction, target, price) => {
  if (price == null || !target) return false;
  return direction === 'above' ? price >= target : price <= target;
};

/**
 * Hora local del cierre diario de Binance (00:00 UTC), calculada para hoy
 * (respeta el horario de verano de la zona del usuario).
 */
export const dailyCloseLocalTime = () => {
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  return next.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

const pad = (n) => String(n).padStart(2, '0');

/** Date → 'YYYY-MM-DDTHH:mm' en hora local (el formato de DateTimeInput). */
export const toLocalInputValue = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * 'YYYY-MM-DDTHH:mm' (hora local, sin zona) → ISO en UTC. El backend rechaza
 * fechas sin zona: sin esto, el servidor (en UTC) las correría unas horas.
 */
export const localInputToIso = (value) => {
  if (!value) return null;
  const d = new Date(value); // sin offset → hora local
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Mañana a las 08:00 locales: valor por defecto de los recordatorios por fecha. */
export const defaultReminderDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return toLocalInputValue(d);
};

/** "hace 20 s", "hace 3 min", "hace 2 h", "hace 4 días", "hace 3 meses". */
export const timeAgo = (date, now = Date.now()) => {
  if (!date) return '';
  const seconds = Math.max(0, Math.round((now - new Date(date).getTime()) / 1000));
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 60) return `hace ${days} días`;
  const months = Math.round(days / 30);
  if (months < 24) return `hace ${months} meses`;
  return `hace ${Math.round(months / 12)} años`;
};

/** Duración legible entre dos fechas ("3 meses", "5 días", "4 h"). */
export const durationBetween = (from, to) => {
  if (!from || !to) return '';
  return timeAgo(from, new Date(to).getTime()).replace(/^hace /, '');
};

// Último símbolo usado en el modal. localStorage puede fallar (ventana privada,
// datos bloqueados): siempre con try/catch y sin depender de él.
const LAST_SYMBOL_KEY = 'tradelog:lastReminderSymbol';

export const getLastSymbol = () => {
  try {
    return window.localStorage.getItem(LAST_SYMBOL_KEY);
  } catch {
    return null;
  }
};

export const setLastSymbol = (symbol) => {
  try {
    window.localStorage.setItem(LAST_SYMBOL_KEY, symbol);
  } catch {
    // sin persistencia: el modal funciona igual
  }
};

/** ¿El anclaje tiene algo armado? (alertas activas o recordatorios pendientes) */
export const hasArmedReminders = (alerts = [], reminders = []) =>
  alerts.some((a) => a.status === 'active') || reminders.some((r) => r.status === 'pending');
