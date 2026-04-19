import * as authService from '../services/auth.service.js';
import { AppError } from './errorHandler.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware para verificar autenticación JWT
 * Agrega req.user con los datos del usuario autenticado
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new AppError('Token de autenticación requerido', 401, 'AUTH_REQUIRED');
    }

    // Formato esperado: "Bearer <token>"
    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new AppError('Formato de token inválido', 401, 'INVALID_TOKEN_FORMAT');
    }

    const token = parts[1];

    // Verificar token
    const payload = authService.verifyToken(token);

    // Agregar datos del usuario al request
    req.user = {
      id: payload.userId,
      email: payload.email,
    };

    logger.debug('Usuario autenticado', { userId: req.user.id });

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware opcional - no falla si no hay token
 * Útil para endpoints que funcionan con o sin auth
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      req.user = null;
      return next();
    }

    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      req.user = null;
      return next();
    }

    const token = parts[1];
    const payload = authService.verifyToken(token);

    req.user = {
      id: payload.userId,
      email: payload.email,
    };

    next();
  } catch (error) {
    // Si hay error de verificación, simplemente no autenticamos
    req.user = null;
    next();
  }
};
