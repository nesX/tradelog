import { logger } from '../utils/logger.js';
import { sendError, sendValidationError } from '../utils/response.js';

/**
 * Clase base para errores personalizados de la aplicación
 */
export class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error de recurso no encontrado
 */
export class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado') {
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * Error de validación
 */
export class ValidationError extends AppError {
  constructor(message = 'Error de validación', details = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

/**
 * Error de conflicto (duplicado, etc.)
 */
export class ConflictError extends AppError {
  constructor(message = 'Conflicto con el recurso existente') {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Error de base de datos
 */
export class DatabaseError extends AppError {
  constructor(message = 'Error en la base de datos') {
    super(message, 500, 'DATABASE_ERROR');
  }
}

/**
 * Middleware de manejo centralizado de errores
 */
export const errorHandler = (err, req, res, next) => {
  // Log del error
  logger.error('Error capturado', {
    message: err.message,
    code: err.code,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  // Si es un error operacional (controlado)
  if (err.isOperational) {
    // Caso especial para errores de validación con detalles
    if (err instanceof ValidationError && err.details?.length > 0) {
      return sendValidationError(res, err.details);
    }

    return sendError(res, err.message, err.statusCode, err.code);
  }

  // Errores de Joi (validación)
  if (err.isJoi) {
    const details = err.details.map((detail) => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));
    return sendValidationError(res, details);
  }

  // Errores de PostgreSQL
  if (err.code && typeof err.code === 'string') {
    // Violación de constraint único
    if (err.code === '23505') {
      return sendError(res, 'El registro ya existe', 409, 'DUPLICATE_ENTRY');
    }

    // Violación de foreign key
    if (err.code === '23503') {
      return sendError(res, 'Referencia inválida', 400, 'INVALID_REFERENCE');
    }

    // Violación de check constraint
    if (err.code === '23514') {
      return sendError(res, 'Valor inválido', 400, 'CHECK_VIOLATION');
    }
  }

  // Error de Multer (upload de archivos)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return sendError(res, 'El archivo excede el tamaño máximo permitido', 400, 'FILE_TOO_LARGE');
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return sendError(res, 'Tipo de archivo no permitido', 400, 'INVALID_FILE_TYPE');
  }

  // Error no controlado (no exponer detalles en producción)
  const message =
    process.env.NODE_ENV === 'development'
      ? err.message
      : 'Ha ocurrido un error interno';

  return sendError(res, message, 500, 'INTERNAL_ERROR');
};

/**
 * Middleware para rutas no encontradas
 */
export const notFoundHandler = (req, res) => {
  return sendError(res, `Ruta no encontrada: ${req.method} ${req.url}`, 404, 'ROUTE_NOT_FOUND');
};
