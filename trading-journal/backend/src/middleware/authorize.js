import { AppError } from './errorHandler.js';

/**
 * Middleware factory que valida que el usuario tenga uno de los roles permitidos.
 * Se usa DESPUÉS del middleware `authenticate`.
 *
 * @param {...string} allowedRoles
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('No autenticado', 401, 'UNAUTHENTICATED'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('No tienes permiso para esta acción', 403, 'FORBIDDEN'));
    }
    next();
  };
}
