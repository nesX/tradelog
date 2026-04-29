import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { uploadTradeImage, handleMulterError } from '../middleware/upload.js';
import {
  createSessionSchema,
  closeSessionSchema,
  addTradeSchema,
} from '../validators/backtest.validator.js';
import * as controller from '../controllers/backtest.controller.js';

const router = Router();

router.use(authenticate);

// Sesiones
router.get('/sessions', controller.listSessions);
router.post('/sessions', validate(createSessionSchema, 'body'), controller.createSession);
router.get('/sessions/:id', controller.getSession);
router.patch('/sessions/:id/close', validate(closeSessionSchema, 'body'), controller.closeSession);
router.patch('/sessions/:id/comment', controller.updateComment);
router.get('/sessions/:id/continuation-data', controller.getContinuationData);

// Trades
router.post('/sessions/:id/trades', uploadTradeImage, handleMulterError, validate(addTradeSchema, 'body'), controller.addTrade);
router.delete('/trades/:tradeId', controller.deleteTrade);
router.delete('/trades/:tradeId/image', controller.deleteTradeImage);

export default router;
