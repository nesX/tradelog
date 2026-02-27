import * as tradeService from '../services/trade.service.js';
import * as csvParserService from '../services/csvParser.service.js';
import { sendSuccess, sendCreated, sendDeleted } from '../utils/response.js';
import { logger } from '../utils/logger.js';

/**
 * Controllers para endpoints de trades
 */

/**
 * GET /api/trades - Listar trades con paginación y filtros
 */
export const listTrades = async (req, res, next) => {
  try {
    const result = await tradeService.getAllTrades(req.user.id, req.query);
    sendSuccess(res, result);
  } catch (error) {
    logger.error('TradeController:listTrades', { error: error.message, userId: req.user?.id });
    next(error);
  }
};

/**
 * GET /api/trades/:id - Obtener un trade por ID
 */
export const getTrade = async (req, res, next) => {
  try {
    const trade = await tradeService.getTradeById(req.user.id, req.params.id);
    sendSuccess(res, trade);
  } catch (error) {
    logger.error('TradeController:getTrade', { error: error.message, userId: req.user?.id, tradeId: req.params.id });
    next(error);
  }
};

/**
 * Parsea campos JSON que llegan como strings desde FormData
 */
const parseJsonFields = (body) => {
  const jsonFields = ['primary_signals', 'secondary_signals', 'timeframe_ids'];
  const result = { ...body };
  for (const field of jsonFields) {
    if (typeof result[field] === 'string') {
      try { result[field] = JSON.parse(result[field]); } catch { delete result[field]; }
    }
  }
  return result;
};

/**
 * POST /api/trades - Crear un nuevo trade
 */
export const createTrade = async (req, res, next) => {
  try {
    const trade = await tradeService.createTrade(req.user.id, parseJsonFields(req.body), req.files || []);
    sendCreated(res, trade, 'Trade creado exitosamente');
  } catch (error) {
    logger.error('TradeController:createTrade', { error: error.message, userId: req.user?.id });
    next(error);
  }
};

/**
 * PUT /api/trades/:id - Actualizar un trade
 */
export const updateTrade = async (req, res, next) => {
  try {
    const trade = await tradeService.updateTrade(req.user.id, req.params.id, parseJsonFields(req.body), req.files || []);
    sendSuccess(res, trade, 'Trade actualizado exitosamente');
  } catch (error) {
    logger.error('TradeController:updateTrade', { error: error.message, userId: req.user?.id, tradeId: req.params.id });
    next(error);
  }
};

/**
 * DELETE /api/trades/:id - Eliminar un trade (soft delete)
 */
export const deleteTrade = async (req, res, next) => {
  try {
    await tradeService.deleteTrade(req.user.id, req.params.id, req.query.permanent === 'true');
    sendDeleted(res, 'Trade eliminado exitosamente');
  } catch (error) {
    logger.error('TradeController:deleteTrade', { error: error.message, userId: req.user?.id, tradeId: req.params.id });
    next(error);
  }
};

/**
 * POST /api/trades/:id/images - Agregar imágenes a un trade
 */
export const addImages = async (req, res, next) => {
  try {
    const images = await tradeService.addImages(req.user.id, req.params.id, req.files || []);
    sendCreated(res, { images }, 'Imágenes agregadas exitosamente');
  } catch (error) {
    logger.error('TradeController:addImages', { error: error.message, userId: req.user?.id, tradeId: req.params.id });
    next(error);
  }
};

/**
 * DELETE /api/trades/:id/images/:imageId - Eliminar una imagen específica
 */
export const deleteImage = async (req, res, next) => {
  try {
    const trade = await tradeService.deleteImage(req.user.id, parseInt(req.params.id), parseInt(req.params.imageId));
    sendSuccess(res, trade, 'Imagen eliminada exitosamente');
  } catch (error) {
    logger.error('TradeController:deleteImage', { error: error.message, userId: req.user?.id, tradeId: req.params.id, imageId: req.params.imageId });
    next(error);
  }
};

/**
 * DELETE /api/trades/:id/images - Eliminar todas las imágenes de un trade
 */
export const deleteAllImages = async (req, res, next) => {
  try {
    const trade = await tradeService.deleteAllImages(req.user.id, req.params.id);
    sendSuccess(res, trade, 'Imágenes eliminadas exitosamente');
  } catch (error) {
    logger.error('TradeController:deleteAllImages', { error: error.message, userId: req.user?.id, tradeId: req.params.id });
    next(error);
  }
};

/**
 * GET /api/trades/symbols - Obtener símbolos únicos
 */
export const getSymbols = async (req, res, next) => {
  try {
    const symbols = await tradeService.getUniqueSymbols(req.user.id);
    sendSuccess(res, { symbols });
  } catch (error) {
    logger.error('TradeController:getSymbols', { error: error.message, userId: req.user?.id });
    next(error);
  }
};

/**
 * POST /api/trades/import/preview - Preview de importación CSV
 */
export const previewCSVImport = async (req, res, next) => {
  try {
    const preview = csvParserService.previewCSV(req.body.csvData);
    sendSuccess(res, preview);
  } catch (error) {
    logger.error('TradeController:previewCSVImport', { error: error.message, userId: req.user?.id });
    next(error);
  }
};

/**
 * POST /api/trades/import - Importar trades desde CSV
 */
export const importCSV = async (req, res, next) => {
  try {
    const result = await csvParserService.importCSV(req.user.id, req.body.csvData);
    if (result.success) {
      sendCreated(res, result, result.message);
    } else {
      sendSuccess(res, result, result.message);
    }
  } catch (error) {
    logger.error('TradeController:importCSV', { error: error.message, userId: req.user?.id });
    next(error);
  }
};
