import { ValidationError } from './errorHandler.js';

/**
 * Middleware factory para validación con Joi
 * @param {Object} schema - Schema de Joi
 * @param {string} property - Propiedad a validar ('body', 'query', 'params')
 * @returns {Function} Middleware de validación
 */
export const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const dataToValidate = req[property];

    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false, // Retorna todos los errores, no solo el primero
      stripUnknown: true, // Elimina campos no definidos en el schema
      convert: true, // Convierte tipos automáticamente
    });

    if (error) {
      const details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/"/g, ''),
      }));

      throw new ValidationError('Error de validación', details);
    }

    // Reemplazar datos con los validados y sanitizados
    req[property] = value;
    next();
  };
};

/**
 * Middleware para validar múltiples propiedades
 * @param {Object} schemas - Objeto con schemas para cada propiedad
 * @returns {Function} Middleware de validación
 */
export const validateMultiple = (schemas) => {
  return (req, res, next) => {
    const allErrors = [];

    for (const [property, schema] of Object.entries(schemas)) {
      const { error, value } = schema.validate(req[property], {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
      });

      if (error) {
        const details = error.details.map((detail) => ({
          field: `${property}.${detail.path.join('.')}`,
          message: detail.message.replace(/"/g, ''),
        }));
        allErrors.push(...details);
      } else {
        req[property] = value;
      }
    }

    if (allErrors.length > 0) {
      throw new ValidationError('Error de validación', allErrors);
    }

    next();
  };
};
