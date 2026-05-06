import { Router } from 'express';
import * as ctrl from '../controllers/admin.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { validate, validateQuery } from '../middleware/validation.js';
import {
  createUserSchema,
  updateUserRoleSchema,
  listUsersQuerySchema,
} from '../validators/admin.validator.js';

const router = Router();

router.use(authenticate, authorize('admin', 'super_admin'));

router.get('/users', validateQuery(listUsersQuerySchema), ctrl.listUsers);
router.get('/users/:id', ctrl.getUser);
router.post('/users', validate(createUserSchema), ctrl.createUser);
router.patch('/users/:id/role', validate(updateUserRoleSchema), ctrl.updateUserRole);
router.delete('/users/:id', ctrl.deleteUser);

export default router;
