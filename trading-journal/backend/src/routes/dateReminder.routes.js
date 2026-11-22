import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate, validateQuery } from '../middleware/validation.js';
import * as ctrl from '../controllers/dateReminder.controller.js';
import {
  idParamSchema,
  createDateReminderSchema,
  updateDateReminderSchema,
  listDateRemindersSchema,
} from '../validators/reminder.validator.js';

const router = Router();
router.use(authenticate);

router.get('/', validateQuery(listDateRemindersSchema), ctrl.getDateReminders);
router.post('/', validate(createDateReminderSchema), ctrl.createDateReminder);
router.patch('/:id', validate(idParamSchema, 'params'), validate(updateDateReminderSchema), ctrl.updateDateReminder);
router.delete('/:id', validate(idParamSchema, 'params'), ctrl.deleteDateReminder);

export default router;
