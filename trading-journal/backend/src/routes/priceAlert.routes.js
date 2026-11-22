import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate, validateQuery } from '../middleware/validation.js';
import * as ctrl from '../controllers/priceAlert.controller.js';
import {
  idParamSchema,
  createPriceAlertSchema,
  updatePriceAlertSchema,
  listPriceAlertsSchema,
} from '../validators/reminder.validator.js';

const router = Router();
router.use(authenticate);

router.get('/', validateQuery(listPriceAlertsSchema), ctrl.getPriceAlerts);
router.post('/', validate(createPriceAlertSchema), ctrl.createPriceAlert);
router.patch('/:id', validate(idParamSchema, 'params'), validate(updatePriceAlertSchema), ctrl.updatePriceAlert);
router.delete('/:id', validate(idParamSchema, 'params'), ctrl.deletePriceAlert);

export default router;
