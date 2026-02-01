import * as authService from '../services/auth.service.js';
import { sendSuccess } from '../utils/response.js';

/**
 * POST /api/auth/google - Autenticación con Google
 */
export const loginWithGoogle = async (req, res, next) => {
  try {
    const { idToken } = req.body;

    const result = await authService.authenticateWithGoogle(idToken);

    sendSuccess(res, result, 'Autenticación exitosa');
  } catch (error) {
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
    next(error);
  }
};

/**
 * POST /api/auth/logout - Cerrar sesión
 */
export const logout = async (req, res) => {
  // El logout es manejado en el cliente eliminando el token
  sendSuccess(res, null, 'Sesión cerrada exitosamente');
};

/**
 * POST /api/auth/refresh - Refrescar token
 */
export const refreshToken = async (req, res, next) => {
  try {
    // Generar nuevo token con los datos del usuario actual
    const user = await authService.getCurrentUser(req.user.id);
    const token = authService.generateToken(user);

    sendSuccess(res, { token }, 'Token renovado');
  } catch (error) {
    next(error);
  }
};
