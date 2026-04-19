import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { googleLoginSchema } from '../validators/auth.validator.js';

const router = Router();

// POST /api/auth/google - Login con Google
router.post(
  '/google',
  validate(googleLoginSchema, 'body'),
  authController.loginWithGoogle
);

// GET /api/auth/me - Obtener usuario actual (requiere auth)
router.get('/me', authenticate, authController.getMe);

// POST /api/auth/logout - Cerrar sesión
router.post('/logout', authenticate, authController.logout);

// POST /api/auth/refresh - Refrescar token
router.post('/refresh', authenticate, authController.refreshToken);

export default router;
