/**
 * Constantes y configuración del modelo Trade
 */

// Tipos de trade permitidos
export const TRADE_TYPES = {
  LONG: 'LONG',
  SHORT: 'SHORT',
};

// Estados de trade permitidos
export const TRADE_STATUS = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
};

// Campos seleccionables
export const TRADE_FIELDS = [
  'id',
  'symbol',
  'trade_type',
  'entry_price',
  'exit_price',
  'quantity',
  'entry_date',
  'exit_date',
  'commission',
  'pnl',
  'pnl_percentage',
  'notes',
  'status',
  'created_at',
  'updated_at',
];

// Campos de imagen
export const IMAGE_FIELDS = [
  'id',
  'trade_id',
  'filename',
  'original_name',
  'file_size',
  'mime_type',
  'created_at',
];

// Campos para ordenamiento permitidos
export const SORTABLE_FIELDS = [
  'entry_date',
  'exit_date',
  'created_at',
  'updated_at',
  'symbol',
  'pnl',
  'pnl_percentage',
  'quantity',
];

// Direcciones de ordenamiento permitidas
export const SORT_DIRECTIONS = ['ASC', 'DESC'];

// Valores por defecto para paginación
export const PAGINATION_DEFAULTS = {
  page: 1,
  limit: 20,
  maxLimit: 100,
};

/**
 * Estructura de un trade para documentación
 * @typedef {Object} Trade
 * @property {number} id - ID único del trade
 * @property {string} symbol - Símbolo del activo (ej: BTCUSDT)
 * @property {string} trade_type - Tipo de trade (LONG o SHORT)
 * @property {number} entry_price - Precio de entrada
 * @property {number|null} exit_price - Precio de salida (null si está abierto)
 * @property {number} quantity - Cantidad operada
 * @property {Date} entry_date - Fecha y hora de entrada
 * @property {Date|null} exit_date - Fecha y hora de salida
 * @property {number} commission - Comisiones pagadas
 * @property {number|null} pnl - Profit/Loss calculado
 * @property {number|null} pnl_percentage - Porcentaje de P&L
 * @property {string|null} notes - Notas del trade
 * @property {Array} images - Imágenes asociadas al trade
 * @property {string} status - Estado (OPEN o CLOSED)
 * @property {Date} created_at - Fecha de creación
 * @property {Date} updated_at - Fecha de última actualización
 */
