import apiClient from './client.js';

/**
 * Endpoints de la API
 */

// ==================
// AUTH
// ==================

/**
 * Login con Google
 */
export const loginWithGoogle = async (idToken) => {
  return apiClient.post('/api/auth/google', { idToken });
};

/**
 * Obtener usuario actual
 */
export const getCurrentUser = async () => {
  return apiClient.get('/api/auth/me');
};

/**
 * Cerrar sesión
 */
export const logout = async () => {
  return apiClient.post('/api/auth/logout');
};

/**
 * Refrescar token
 */
export const refreshToken = async () => {
  return apiClient.post('/api/auth/refresh');
};

// ==================
// TRADES
// ==================

/**
 * Obtener lista de trades con paginación y filtros
 */
export const getTrades = async (params = {}) => {
  return apiClient.get('/api/trades', { params });
};

/**
 * Obtener un trade por ID
 */
export const getTradeById = async (id) => {
  return apiClient.get(`/api/trades/${id}`);
};

/**
 * Crear un nuevo trade (con múltiples imágenes)
 */
const JSON_ARRAY_FIELDS = ['primary_signals', 'secondary_signals', 'timeframe_ids'];

const appendToFormData = (formData, tradeData) => {
  Object.entries(tradeData).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      if (JSON_ARRAY_FIELDS.includes(key)) {
        formData.append(key, JSON.stringify(value));
      } else {
        formData.append(key, value);
      }
    }
  });
};

export const createTrade = async (tradeData, imageFiles = []) => {
  if (imageFiles && imageFiles.length > 0) {
    const formData = new FormData();
    appendToFormData(formData, tradeData);
    imageFiles.forEach((file) => formData.append('images', file));
    return apiClient.post('/api/trades', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }

  return apiClient.post('/api/trades', tradeData);
};

/**
 * Actualizar un trade (con nuevas imágenes)
 */
export const updateTrade = async (id, updateData, imageFiles = []) => {
  if (imageFiles && imageFiles.length > 0) {
    const formData = new FormData();
    appendToFormData(formData, updateData);
    imageFiles.forEach((file) => formData.append('images', file));
    return apiClient.put(`/api/trades/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }

  return apiClient.put(`/api/trades/${id}`, updateData);
};

/**
 * Eliminar un trade
 */
export const deleteTrade = async (id, permanent = false) => {
  return apiClient.delete(`/api/trades/${id}`, {
    params: { permanent },
  });
};

/**
 * Agregar imágenes a un trade existente
 */
export const addTradeImages = async (tradeId, imageFiles) => {
  const formData = new FormData();
  imageFiles.forEach((file) => {
    formData.append('images', file);
  });

  return apiClient.post(`/api/trades/${tradeId}/images`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

/**
 * Eliminar una imagen específica de un trade
 */
export const deleteTradeImage = async (tradeId, imageId) => {
  return apiClient.delete(`/api/trades/${tradeId}/images/${imageId}`);
};

/**
 * Eliminar todas las imágenes de un trade
 */
export const deleteAllTradeImages = async (tradeId) => {
  return apiClient.delete(`/api/trades/${tradeId}/images`);
};

/**
 * Obtener símbolos únicos
 */
export const getSymbols = async () => {
  return apiClient.get('/api/trades/symbols');
};

// ==================
// CSV IMPORT
// ==================

/**
 * Preview de importación CSV
 */
export const previewCSVImport = async (csvData) => {
  return apiClient.post('/api/trades/import/preview', { csvData });
};

/**
 * Importar trades desde CSV
 */
export const importCSV = async (csvData) => {
  return apiClient.post('/api/trades/import', { csvData });
};

// ==================
// SYSTEMS
// ==================

export const getSystems = async () => apiClient.get('/api/systems');
export const getSystemById = async (id) => apiClient.get(`/api/systems/${id}`);
export const createSystem = async (data) => apiClient.post('/api/systems', data);
export const updateSystemName = async (id, name) => apiClient.patch(`/api/systems/${id}/name`, { name });
export const deleteSystem = async (id) => apiClient.delete(`/api/systems/${id}`);

// ==================
// TIMEFRAMES
// ==================

export const getTimeframes = async () => apiClient.get('/api/timeframes');
export const createTimeframe = async (data) => apiClient.post('/api/timeframes', data);
export const deleteTimeframe = async (id) => apiClient.delete(`/api/timeframes/${id}`);

// ==================
// BACKTEST
// ==================

export const getSessions = () => apiClient.get('/api/backtest/sessions');
export const getSession = (id) => apiClient.get(`/api/backtest/sessions/${id}`);
export const createSession = (data) => apiClient.post('/api/backtest/sessions', data);
export const closeSession = (id, data) => apiClient.patch(`/api/backtest/sessions/${id}/close`, data);
export const getContinuationData = (id) => apiClient.get(`/api/backtest/sessions/${id}/continuation-data`);
export const addBacktestTrade = (sessionId, data) => apiClient.post(`/api/backtest/sessions/${sessionId}/trades`, data);
export const deleteBacktestTrade = (tradeId) => apiClient.delete(`/api/backtest/trades/${tradeId}`);

// ==================
// STATS
// ==================

/**
 * Obtener estadísticas generales
 */
export const getStats = async () => {
  return apiClient.get('/api/stats');
};

/**
 * Obtener estadísticas por símbolo
 */
export const getStatsBySymbol = async () => {
  return apiClient.get('/api/stats/by-symbol');
};

/**
 * Obtener estadísticas por rango de fechas
 */
export const getStatsByDateRange = async (dateFrom, dateTo) => {
  return apiClient.get('/api/stats/by-date', {
    params: { dateFrom, dateTo },
  });
};

/**
 * Obtener P&L diario
 */
export const getDailyPnL = async (days = 30) => {
  return apiClient.get('/api/stats/daily-pnl', {
    params: { days },
  });
};

/**
 * Obtener estadísticas por tipo de trade
 */
export const getStatsByType = async () => {
  return apiClient.get('/api/stats/by-type');
};

/**
 * Obtener mejores y peores trades
 */
export const getTopTrades = async (limit = 5) => {
  return apiClient.get('/api/stats/top-trades', {
    params: { limit },
  });
};
