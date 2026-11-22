import { noteKeys } from './useNotes.js';

// Query keys de los recordatorios de análisis, en un solo módulo para que los
// hooks de alertas, recordatorios y bandeja puedan invalidarse entre sí sin
// importaciones circulares.

export const marketSymbolKeys = {
  all: ['marketSymbols'],
  list: () => ['marketSymbols', 'list'],
  price: (symbol) => ['marketSymbols', 'price', symbol],
};

export const priceAlertKeys = {
  all: ['priceAlerts'],
  list: (status) => ['priceAlerts', 'list', status ?? 'all'],
};

export const dateReminderKeys = {
  all: ['dateReminders'],
  list: (status) => ['dateReminders', 'list', status ?? 'all'],
};

export const notificationKeys = {
  all: ['notifications'],
  open: () => ['notifications', 'open'],
  history: () => ['notifications', 'history'],
  count: () => ['notifications', 'count'],
};

/**
 * Tras crear, editar o borrar una alerta o un recordatorio (o cerrar una tarjeta
 * que borra alertas): los chips de las notas, la bandeja, las listas de
 * Programadas y el orden "usados primero" del catálogo.
 */
export const invalidateReminderQueries = (qc) => {
  qc.invalidateQueries({ queryKey: [...noteKeys.all, 'detail'] });
  qc.invalidateQueries({ queryKey: notificationKeys.all });
  qc.invalidateQueries({ queryKey: priceAlertKeys.all });
  qc.invalidateQueries({ queryKey: dateReminderKeys.all });
  qc.invalidateQueries({ queryKey: marketSymbolKeys.list() });
};
