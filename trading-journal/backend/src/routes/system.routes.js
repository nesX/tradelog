import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import {
  createSystemSchema,
  updateSystemNameSchema,
  createTimeframeSchema,
} from '../validators/system.validator.js';
import {
  listSystems,
  getSystem,
  createSystem,
  updateSystemName,
  deleteSystem,
  listTimeframes,
  createTimeframe,
  deleteTimeframe,
} from '../controllers/system.controller.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Systems
router.get('/systems', listSystems);
router.post('/systems', validate(createSystemSchema), createSystem);
router.get('/systems/:id', getSystem);
router.patch('/systems/:id/name', validate(updateSystemNameSchema), updateSystemName);
router.delete('/systems/:id', deleteSystem);

// Timeframes
router.get('/timeframes', listTimeframes);
router.post('/timeframes', validate(createTimeframeSchema), createTimeframe);
router.delete('/timeframes/:id', deleteTimeframe);

export default router;
