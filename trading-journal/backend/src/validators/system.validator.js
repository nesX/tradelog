import Joi from 'joi';

/**
 * Schema para crear un sistema con sus señales
 */
export const createSystemSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.empty': 'El nombre del sistema es requerido',
      'string.max': 'El nombre no puede tener más de 100 caracteres',
    }),

  description: Joi.string()
    .trim()
    .max(1000)
    .allow('', null)
    .optional(),

  signals: Joi.array()
    .items(
      Joi.object({
        name: Joi.string()
          .trim()
          .min(1)
          .max(100)
          .required()
          .messages({
            'string.empty': 'El nombre de la señal es requerido',
            'string.max': 'El nombre de la señal no puede tener más de 100 caracteres',
          }),
        uses_scale: Joi.boolean()
          .default(false),
      })
    )
    .min(1)
    .required()
    .messages({
      'array.min': 'El sistema debe tener al menos una señal',
      'any.required': 'Las señales son requeridas',
    }),
});

/**
 * Schema para editar nombre de un sistema
 */
export const updateSystemNameSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.empty': 'El nombre del sistema es requerido',
      'string.max': 'El nombre no puede tener más de 100 caracteres',
    }),
});

/**
 * Schema para crear un timeframe
 */
export const createTimeframeSchema = Joi.object({
  label: Joi.string()
    .trim()
    .min(1)
    .max(20)
    .required()
    .messages({
      'string.empty': 'El label del timeframe es requerido',
      'string.max': 'El label no puede tener más de 20 caracteres',
    }),

  sort_order: Joi.number()
    .integer()
    .min(0)
    .default(0),
});
