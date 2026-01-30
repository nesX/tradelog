import * as tradeService from '../services/trade.service.js';
import * as csvParserService from '../services/csvParser.service.js';
import { sendSuccess, sendCreated, sendDeleted } from '../utils/response.js';

/**
 * Controllers para endpoints de trades
 */

/**
 * GET /api/trades - Listar trades con paginación y filtros
 */
export const listTrades = async (req, res) => {
  const filters = req.query;
  const result = await tradeService.getAllTrades(filters);

  sendSuccess(res, result);
};

/**
 * GET /api/trades/:id - Obtener un trade por ID
 */
export const getTrade = async (req, res) => {
  const { id } = req.params;
  const trade = await tradeService.getTradeById(id);

  sendSuccess(res, trade);
};

/**
 * POST /api/trades - Crear un nuevo trade
 */
export const createTrade = async (req, res) => {
  const tradeData = req.body;
  const files = req.files || [];

  const trade = await tradeService.createTrade(tradeData, files);

  sendCreated(res, trade, 'Trade creado exitosamente');
};

/**
 * PUT /api/trades/:id - Actualizar un trade
 */
export const updateTrade = async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  const files = req.files || [];

  const trade = await tradeService.updateTrade(id, updateData, files);

  sendSuccess(res, trade, 'Trade actualizado exitosamente');
};

/**
 * DELETE /api/trades/:id - Eliminar un trade (soft delete)
 */
export const deleteTrade = async (req, res) => {
  const { id } = req.params;
  const permanent = req.query.permanent === 'true';

  await tradeService.deleteTrade(id, permanent);

  sendDeleted(res, 'Trade eliminado exitosamente');
};

/**
 * POST /api/trades/:id/images - Agregar imágenes a un trade
 */
export const addImages = async (req, res) => {
  const { id } = req.params;
  const files = req.files || [];

  const images = await tradeService.addImages(id, files);

  sendCreated(res, { images }, 'Imágenes agregadas exitosamente');
};

/**
 * DELETE /api/trades/:id/images/:imageId - Eliminar una imagen específica
 */
export const deleteImage = async (req, res) => {
  const { id, imageId } = req.params;

  const trade = await tradeService.deleteImage(parseInt(id), parseInt(imageId));

  sendSuccess(res, trade, 'Imagen eliminada exitosamente');
};

/**
 * DELETE /api/trades/:id/images - Eliminar todas las imágenes de un trade
 */
export const deleteAllImages = async (req, res) => {
  const { id } = req.params;

  const trade = await tradeService.deleteAllImages(id);

  sendSuccess(res, trade, 'Imágenes eliminadas exitosamente');
};

/**
 * GET /api/trades/symbols - Obtener símbolos únicos
 */
export const getSymbols = async (req, res) => {
  const symbols = await tradeService.getUniqueSymbols();

  sendSuccess(res, { symbols });
};

/**
 * POST /api/trades/import/preview - Preview de importación CSV
 */
export const previewCSVImport = async (req, res) => {
  const { csvData } = req.body;

  const preview = csvParserService.previewCSV(csvData);

  sendSuccess(res, preview);
};

/**
 * POST /api/trades/import - Importar trades desde CSV
 */
export const importCSV = async (req, res) => {
  const { csvData } = req.body;

  const result = await csvParserService.importCSV(csvData);

  if (result.success) {
    sendCreated(res, result, result.message);
  } else {
    sendSuccess(res, result, result.message);
  }
};
