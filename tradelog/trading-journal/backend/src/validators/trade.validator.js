import Joi from 'joi';
import { TRADE_TYPES, TRADE_STATUS, SORTABLE_FIELDS, SORT_DIRECTIONS } from '../models/trade.model.js';

/**
 * Schema para crear un trade
 */
export const createTradeSchema = Joi.object({
  symbol: Joi.string()
    .uppercase()
    .trim()
    .min(1)
    .max(20)
    .required()
    .messages({
      'string.empty': 'El símbolo es requerido',
      'string.max': 'El símbolo no puede tener más de 20 caracteres',
    }),

  trade_type: Joi.string()
    .uppercase()
    .valid(...Object.values(TRADE_TYPES))
    .required()
    .messages({
      'any.only': 'El tipo debe ser LONG o SHORT',
      'any.required': 'El tipo de trade es requerido',
    }),

  entry_price: Joi.number()
    .positive()
    .required()
    .messages({
      'number.positive': 'El precio de entrada debe ser positivo',
      'any.required': 'El precio de entrada es requerido',
    }),

  exit_price: Joi.number()
    .positive()
    .allow(null)
    .optional()
    .messages({
      'number.positive': 'El precio de salida debe ser positivo',
    }),

  quantity: Joi.number()
    .positive()
    .required()
    .messages({
      'number.positive': 'La cantidad debe ser positiva',
      'any.required': 'La cantidad es requerida',
    }),

  entry_date: Joi.date()
    .iso()
    .required()
    .messages({
      'date.base': 'La fecha de entrada debe ser una fecha válida',
      'any.required': 'La fecha de entrada es requerida',
    }),

  exit_date: Joi.date()
    .iso()
    .allow(null)
    .optional()
    .when('exit_price', {
      is: Joi.number().positive().required(),
      then: Joi.date().required(),
      otherwise: Joi.date().optional(),
    })
    .messages({
      'date.base': 'La fecha de salida debe ser una fecha válida',
    }),

  commission: Joi.number()
    .min(0)
    .default(0)
    .messages({
      'number.min': 'La comisión no puede ser negativa',
    }),

  notes: Joi.string()
    .trim()
    .max(2000)
    .allow('', null)
    .optional()
    .messages({
      'string.max': 'Las notas no pueden exceder 2000 caracteres',
    }),
});

/**
 * Schema para actualizar un trade
 */
export const updateTradeSchema = Joi.object({
  symbol: Joi.string()
    .uppercase()
    .trim()
    .min(1)
    .max(20)
    .optional(),

  trade_type: Joi.string()
    .uppercase()
    .valid(...Object.values(TRADE_TYPES))
    .optional(),

  entry_price: Joi.number()
    .positive()
    .optional(),

  exit_price: Joi.number()
    .positive()
    .allow(null)
    .optional(),

  quantity: Joi.number()
    .positive()
    .optional(),

  entry_date: Joi.date()
    .iso()
    .optional(),

  exit_date: Joi.date()
    .iso()
    .allow(null)
    .optional(),

  commission: Joi.number()
    .min(0)
    .optional(),

  notes: Joi.string()
    .trim()
    .max(2000)
    .allow('', null)
    .optional(),
}).min(1).messages({
  'object.min': 'Debe proporcionar al menos un campo para actualizar',
});

/**
 * Schema para query params de listado
 */
export const listTradesQuerySchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),

  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20),

  sortBy: Joi.string()
    .valid(...SORTABLE_FIELDS)
    .default('entry_date'),

  sortDir: Joi.string()
    .uppercase()
    .valid(...SORT_DIRECTIONS)
    .default('DESC'),

  status: Joi.string()
    .uppercase()
    .valid(...Object.values(TRADE_STATUS))
    .optional(),

  symbol: Joi.string()
    .uppercase()
    .trim()
    .optional(),

  trade_type: Joi.string()
    .uppercase()
    .valid(...Object.values(TRADE_TYPES))
    .optional(),

  dateFrom: Joi.date()
    .iso()
    .optional(),

  dateTo: Joi.date()
    .iso()
    .optional(),
});

/**
 * Schema para ID en params
 */
export const idParamSchema = Joi.object({
  id: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({
      'number.base': 'El ID debe ser un número',
      'number.positive': 'El ID debe ser positivo',
    }),
});

/**
 * Schema para importación CSV - validación de una línea
 */
export const csvLineSchema = Joi.object({
  entry_date: Joi.date()
    .required()
    .messages({
      'date.base': 'Fecha inválida',
      'any.required': 'La fecha es requerida',
    }),

  symbol: Joi.string()
    .uppercase()
    .trim()
    .min(1)
    .max(20)
    .required(),

  trade_type: Joi.string()
    .uppercase()
    .valid('LONG', 'SHORT')
    .required()
    .messages({
      'any.only': 'Tipo debe ser LONG o SHORT',
    }),

  entry_price: Joi.number()
    .positive()
    .required(),

  exit_price: Joi.number()
    .positive()
    .allow(null, '')
    .optional(),

  quantity: Joi.number()
    .positive()
    .required(),

  commission: Joi.number()
    .min(0)
    .default(0),

  notes: Joi.string()
    .trim()
    .max(2000)
    .allow('', null)
    .optional(),
});

/**
 * Schema para el body del import CSV
 */
export const csvImportSchema = Joi.object({
  csvData: Joi.string()
    .required()
    .messages({
      'any.required': 'Los datos CSV son requeridos',
      'string.empty': 'Los datos CSV no pueden estar vacíos',
    }),
});
