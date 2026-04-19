/**
 * Utilidades para respuestas HTTP estandarizadas
 */

/**
 * Envía una respuesta exitosa
 * @param {Object} res - Objeto response de Express
 * @param {Object} data - Datos a enviar
 * @param {string} message - Mensaje opcional
 * @param {number} statusCode - Código HTTP (default: 200)
 */
export const sendSuccess = (res, data, message = null, statusCode = 200) => {
  const response = {
    success: true,
    data,
  };

  if (message) {
    response.message = message;
  }

  return res.status(statusCode).json(response);
};

/**
 * Envía una respuesta de error
 * @param {Object} res - Objeto response de Express
 * @param {string} message - Mensaje de error
 * @param {number} statusCode - Código HTTP (default: 500)
 * @param {string} code - Código de error
 * @param {Array} details - Detalles adicionales del error
 */
export const sendError = (
  res,
  message,
  statusCode = 500,
  code = 'INTERNAL_ERROR',
  details = null
) => {
  const response = {
    success: false,
    error: {
      message,
      code,
    },
  };

  if (details) {
    response.error.details = details;
  }

  return res.status(statusCode).json(response);
};

/**
 * Envía una respuesta de creación exitosa
 * @param {Object} res - Objeto response de Express
 * @param {Object} data - Datos creados
 * @param {string} message - Mensaje opcional
 */
export const sendCreated = (res, data, message = 'Recurso creado exitosamente') => {
  return sendSuccess(res, data, message, 201);
};

/**
 * Envía una respuesta de eliminación exitosa
 * @param {Object} res - Objeto response de Express
 * @param {string} message - Mensaje opcional
 */
export const sendDeleted = (res, message = 'Recurso eliminado exitosamente') => {
  return sendSuccess(res, null, message, 200);
};

/**
 * Envía una respuesta de no encontrado
 * @param {Object} res - Objeto response de Express
 * @param {string} message - Mensaje opcional
 */
export const sendNotFound = (res, message = 'Recurso no encontrado') => {
  return sendError(res, message, 404, 'NOT_FOUND');
};

/**
 * Envía una respuesta de validación fallida
 * @param {Object} res - Objeto response de Express
 * @param {Array} details - Detalles de los errores de validación
 */
export const sendValidationError = (res, details) => {
  return sendError(res, 'Error de validación', 400, 'VALIDATION_ERROR', details);
};
