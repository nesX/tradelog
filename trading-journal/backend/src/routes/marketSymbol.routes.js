import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import * as ctrl from '../controllers/marketSymbol.controller.js';
import { symbolParamSchema } from '../validators/marketSymbol.validator.js';

// Catálogo de perpetuos de Binance Futures. No hay alta de símbolos: lo mantiene
// el sync diario del job de recordatorios.
const router = Router();
router.use(authenticate);

router.get('/', ctrl.getSymbols);
router.get('/:symbol/price', validate(symbolParamSchema, 'params'), ctrl.getSymbolPrice);

export default router;
