/**
 * Constantes compartidas para trades
 */

export const TRADE_TYPES = {
  LONG: 'LONG',
  SHORT: 'SHORT',
};

export const TRADE_STATUS = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
};

export const TRADE_TYPE_OPTIONS = [
  { value: TRADE_TYPES.LONG, label: 'Long' },
  { value: TRADE_TYPES.SHORT, label: 'Short' },
];

export const TRADE_STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: TRADE_STATUS.OPEN, label: 'Abiertos' },
  { value: TRADE_STATUS.CLOSED, label: 'Cerrados' },
];

export const SORT_OPTIONS = [
  { value: 'entry_date', label: 'Fecha de entrada' },
  { value: 'created_at', label: 'Fecha de creación' },
  { value: 'symbol', label: 'Símbolo' },
  { value: 'pnl', label: 'P&L' },
];

export const SORT_DIRECTIONS = [
  { value: 'DESC', label: 'Descendente' },
  { value: 'ASC', label: 'Ascendente' },
];

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  LIMIT_OPTIONS: [10, 20, 50, 100],
};

// Formato de CSV esperado
export const CSV_FORMAT = {
  delimiter: ';',
  columns: [
    'fecha',
    'simbolo',
    'tipo',
    'precio_entrada',
    'precio_salida',
    'cantidad',
    'comisiones',
    'notas',
  ],
  example: '2025-01-15 10:30;BTCUSDT;LONG;42000.50;43500.00;0.1;5.50;Breakout trade',
};
