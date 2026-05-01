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
export const addBacktestTrade = (sessionId, data, imageFile = null) => {
  if (imageFile) {
    const formData = new FormData();
    formData.append('result', data.result);
    formData.append('comment', data.comment);
    formData.append('image', imageFile);
    return apiClient.post(`/api/backtest/sessions/${sessionId}/trades`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }
  return apiClient.post(`/api/backtest/sessions/${sessionId}/trades`, data);
};
export const updateBacktestDescription = (id, description) => apiClient.patch(`/api/backtest/sessions/${id}/description`, { description });
export const deleteBacktestTrade = (tradeId) => apiClient.delete(`/api/backtest/trades/${tradeId}`);
export const deleteBacktestTradeImage = (tradeId) => apiClient.delete(`/api/backtest/trades/${tradeId}/image`);

// ==================
// NOTES
// ==================

export const getNoteTree = () => apiClient.get('/api/notes/tree');
export const getNote = (id) => apiClient.get(`/api/notes/${id}`);
export const createNote = (data) => apiClient.post('/api/notes', data);
export const updateNoteTitle = (id, title) => apiClient.patch(`/api/notes/${id}/title`, { title });
export const deleteNote = (id) => apiClient.delete(`/api/notes/${id}`);
export const moveNote = (id, parent_note_id) => apiClient.patch(`/api/notes/${id}/move`, { parent_note_id });
export const moveNoteDnd = (id, payload) => apiClient.patch(`/api/notes/${id}/move-dnd`, payload);
export const moveBlockDnd = (blockId, payload) => apiClient.patch(`/api/notes/blocks/${blockId}/move-dnd`, payload);
export const reorderNotes = (note_ids) => apiClient.patch('/api/notes/reorder', { note_ids });

export const createBlock = (noteId, data) => apiClient.post(`/api/notes/${noteId}/blocks`, data);
export const updateBlock = (blockId, content) => apiClient.patch(`/api/notes/blocks/${blockId}`, { content });
export const updateBlockMetadata = (blockId, metadata) => apiClient.patch(`/api/notes/blocks/${blockId}/metadata`, metadata);
export const deleteBlock = (blockId) => apiClient.delete(`/api/notes/blocks/${blockId}`);
export const reorderBlocks = (noteId, block_ids) => apiClient.patch(`/api/notes/${noteId}/blocks/reorder`, { block_ids });

export const addBlockImage = (blockId, formData) =>
  apiClient.post(`/api/notes/blocks/${blockId}/images`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
export const updateImageCaption = (imageId, caption) => apiClient.patch(`/api/notes/images/${imageId}`, { caption });
export const deleteBlockImage = (imageId) => apiClient.delete(`/api/notes/images/${imageId}`);
export const reorderBlockImages = (blockId, image_ids) =>
  apiClient.patch(`/api/notes/blocks/${blockId}/images/reorder`, { image_ids });

export const getNoteTags = () => apiClient.get('/api/notes/tags');
export const createNoteTag = (data) => apiClient.post('/api/notes/tags', data);
export const updateNoteTag = (tagId, data) => apiClient.patch(`/api/notes/tags/${tagId}`, data);
export const deleteNoteTag = (tagId) => apiClient.delete(`/api/notes/tags/${tagId}`);
export const assignNoteTags = (noteId, tag_ids) => apiClient.post(`/api/notes/${noteId}/tags`, { tag_ids });
export const removeNoteTags = (noteId, tag_ids) =>
  apiClient.delete(`/api/notes/${noteId}/tags`, { data: { tag_ids } });

export const exportNotesJSON = () => apiClient.get('/api/notes/export/json');
export const exportNotesMarkdown = () => apiClient.get('/api/notes/export/markdown', { responseType: 'text' });
export const searchNotes = (params) => apiClient.get('/api/notes/search', { params });

export const toggleBlockFollowUp = (blockId, requiresFollowUp) =>
  apiClient.patch(`/api/notes/blocks/${blockId}/follow-up`, { requires_follow_up: requiresFollowUp });
export const getBlocksReview = (hours = 24) =>
  apiClient.get('/api/notes/blocks/review', { params: { hours } });

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
