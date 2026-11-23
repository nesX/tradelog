import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import * as ctrl from '../controllers/push.controller.js';
import { subscriptionSchema, endpointSchema } from '../validators/push.validator.js';

// Avisos push de los recordatorios: vincular, comprobar y desvincular ESTE
// dispositivo, y enviarle una prueba.
const router = Router();
router.use(authenticate);

router.get('/config', ctrl.getConfig);
router.post('/subscriptions', validate(subscriptionSchema), ctrl.linkSubscription);
router.post('/subscriptions/status', validate(subscriptionSchema), ctrl.getSubscriptionStatus);
router.delete('/subscriptions', validate(endpointSchema), ctrl.unlinkSubscription);
router.post('/test', validate(endpointSchema), ctrl.sendTest);

export default router;
