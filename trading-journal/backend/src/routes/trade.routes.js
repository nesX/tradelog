import { Router } from 'express';
import * as tradeController from '../controllers/trade.controller.js';
import { validate } from '../middleware/validation.js';
import { authenticate } from '../middleware/auth.js';
import { uploadTradeImages, handleMulterError } from '../middleware/upload.js';
import {
  createTradeSchema,
  updateTradeSchema,
  listTradesQuerySchema,
  idParamSchema,
  csvImportSchema,
} from '../validators/trade.validator.js';

const router = Router();

// Aplicar autenticación a todas las rutas de trades
router.use(authenticate);

// GET /api/trades/symbols - Obtener símbolos únicos (antes de :id para evitar conflicto)
router.get('/symbols', tradeController.getSymbols);

// POST /api/trades/import/preview - Preview de CSV
router.post(
  '/import/preview',
  validate(csvImportSchema, 'body'),
  tradeController.previewCSVImport
);

// POST /api/trades/import - Importar desde CSV
router.post(
  '/import',
  validate(csvImportSchema, 'body'),
  tradeController.importCSV
);

// GET /api/trades - Listar trades
router.get(
  '/',
  validate(listTradesQuerySchema, 'query'),
  tradeController.listTrades
);

// GET /api/trades/:id - Obtener trade por ID
router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  tradeController.getTrade
);

// POST /api/trades - Crear trade (con múltiples imágenes)
router.post(
  '/',
  uploadTradeImages,
  handleMulterError,
  validate(createTradeSchema, 'body'),
  tradeController.createTrade
);

// PUT /api/trades/:id - Actualizar trade (con múltiples imágenes nuevas)
router.put(
  '/:id',
  validate(idParamSchema, 'params'),
  uploadTradeImages,
  handleMulterError,
  validate(updateTradeSchema, 'body'),
  tradeController.updateTrade
);

// DELETE /api/trades/:id - Eliminar trade
router.delete(
  '/:id',
  validate(idParamSchema, 'params'),
  tradeController.deleteTrade
);

// POST /api/trades/:id/images - Agregar imágenes a un trade existente
router.post(
  '/:id/images',
  validate(idParamSchema, 'params'),
  uploadTradeImages,
  handleMulterError,
  tradeController.addImages
);

// DELETE /api/trades/:id/images/:imageId - Eliminar una imagen específica
router.delete(
  '/:id/images/:imageId',
  tradeController.deleteImage
);

// DELETE /api/trades/:id/images - Eliminar todas las imágenes de un trade
router.delete(
  '/:id/images',
  validate(idParamSchema, 'params'),
  tradeController.deleteAllImages
);

export default router;
