import * as authService from '../services/auth.service.js';
import { sendSuccess } from '../utils/response.js';
import { logger } from '../utils/logger.js';

/**
 * POST /api/auth/google - Autenticación con Google
 */
export const loginWithGoogle = async (req, res, next) => {
  try {
    const result = await authService.authenticateWithGoogle(req.body.idToken);
    sendSuccess(res, result, 'Autenticación exitosa');
  } catch (error) {
    logger.error('AuthController:loginWithGoogle', { error: error.message });
    next(error);
  }
};

/**
 * GET /api/auth/me - Obtener usuario actual
 */
export const getMe = async (req, res, next) => {
  try {
    const user = await authService.getCurrentUser(req.user.id);
    sendSuccess(res, { user });
  } catch (error) {
    logger.error('AuthController:getMe', { error: error.message, userId: req.user?.id });
    next(error);
  }
};

/**
 * POST /api/auth/logout - Cerrar sesión
 */
export const logout = async (req, res) => {
  sendSuccess(res, null, 'Sesión cerrada exitosamente');
};

/**
 * POST /api/auth/refresh - Refrescar token
 */
export const refreshToken = async (req, res, next) => {
  try {
    const user = await authService.getCurrentUser(req.user.id);
    const token = authService.generateToken(user);
    sendSuccess(res, { token }, 'Token renovado');
  } catch (error) {
    logger.error('AuthController:refreshToken', { error: error.message, userId: req.user?.id });
    next(error);
  }
};
