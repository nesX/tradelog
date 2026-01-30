/**
 * Utilidades para formateo de datos
 */

/**
 * Formatea un número como moneda
 * @param {number} value - Valor a formatear
 * @param {string} currency - Código de moneda
 * @param {number} decimals - Decimales a mostrar
 * @returns {string}
 */
export const formatCurrency = (value, currency = 'USD', decimals = 2) => {
  if (value === null || value === undefined) return '-';

  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

/**
 * Formatea un número con separadores de miles
 * @param {number} value - Valor a formatear
 * @param {number} decimals - Decimales a mostrar
 * @returns {string}
 */
export const formatNumber = (value, decimals = 2) => {
  if (value === null || value === undefined) return '-';

  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

/**
 * Formatea un porcentaje
 * @param {number} value - Valor a formatear
 * @param {boolean} includeSign - Incluir signo +/-
 * @returns {string}
 */
export const formatPercentage = (value, includeSign = true) => {
  if (value === null || value === undefined) return '-';

  const formatted = `${Math.abs(value).toFixed(2)}%`;

  if (!includeSign) return formatted;

  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
};

/**
 * Formatea P&L con color indicativo
 * @param {number} value - Valor del P&L
 * @returns {Object} { value: string, className: string }
 */
export const formatPnL = (value) => {
  if (value === null || value === undefined) {
    return { value: '-', className: 'text-gray-500' };
  }

  const formatted = formatCurrency(value);

  if (value > 0) {
    return { value: `+${formatted}`, className: 'text-profit font-medium' };
  }
  if (value < 0) {
    return { value: formatted, className: 'text-loss font-medium' };
  }
  return { value: formatted, className: 'text-gray-600' };
};

/**
 * Formatea una fecha
 * @param {string|Date} date - Fecha a formatear
 * @param {Object} options - Opciones de formato
 * @returns {string}
 */
export const formatDate = (date, options = {}) => {
  if (!date) return '-';

  const {
    includeTime = true,
    locale = 'es-ES',
  } = options;

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return '-';

  const dateOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };

  if (includeTime) {
    dateOptions.hour = '2-digit';
    dateOptions.minute = '2-digit';
  }

  return new Intl.DateTimeFormat(locale, dateOptions).format(dateObj);
};

/**
 * Formatea una fecha para input datetime-local
 * @param {string|Date} date - Fecha a formatear
 * @returns {string}
 */
export const formatDateForInput = (date) => {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return '';

  // Formato: YYYY-MM-DDTHH:mm
  return dateObj.toISOString().slice(0, 16);
};

/**
 * Formatea el símbolo del trade
 * @param {string} symbol - Símbolo a formatear
 * @returns {string}
 */
export const formatSymbol = (symbol) => {
  if (!symbol) return '-';
  return symbol.toUpperCase();
};

/**
 * Obtiene la clase CSS para el tipo de trade
 * @param {string} tradeType - Tipo de trade (LONG/SHORT)
 * @returns {string}
 */
export const getTradeTypeClass = (tradeType) => {
  return tradeType === 'LONG' ? 'badge-long' : 'badge-short';
};

/**
 * Obtiene la clase CSS para el estado del trade
 * @param {string} status - Estado del trade (OPEN/CLOSED)
 * @returns {string}
 */
export const getStatusClass = (status) => {
  return status === 'OPEN' ? 'badge-open' : 'badge-closed';
};

/**
 * Obtiene la clase CSS para el P&L
 * @param {number} pnl - Valor del P&L
 * @returns {string}
 */
export const getPnLClass = (pnl) => {
  if (pnl > 0) return 'badge-profit';
  if (pnl < 0) return 'badge-loss';
  return 'badge';
};
