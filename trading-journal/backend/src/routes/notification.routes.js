import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate, validateQuery } from '../middleware/validation.js';
import * as ctrl from '../controllers/notification.controller.js';
import {
  idParamSchema,
  listNotificationsSchema,
  resolveNotificationSchema,
} from '../validators/reminder.validator.js';

// Bandeja de tarjetas de /recordatorios
const router = Router();
router.use(authenticate);

router.get('/', validateQuery(listNotificationsSchema), ctrl.getNotifications);
router.get('/count', ctrl.getNotificationCount);
router.post('/:id/resolve', validate(idParamSchema, 'params'), validate(resolveNotificationSchema), ctrl.resolveNotification);

export default router;
