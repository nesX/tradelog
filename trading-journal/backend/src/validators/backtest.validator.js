import Joi from 'joi';

const TIMEFRAMES = [
  '1S', '5S', '10S', '30S',
  '1m', '2m', '3m', '5m', '15m', '30m',
  '1h', '2h', '4h', '6h', '8h', '12h',
  '1d', '3d', '1w',
];

const TRADE_RESULTS = ['long_win', 'long_loss', 'short_win', 'short_loss', 'break_even'];

export const createSessionSchema = Joi.object({
  symbol: Joi.string().max(20).uppercase().trim().required()
    .messages({ 'any.required': 'El símbolo es obligatorio' }),
  timeframe: Joi.string().valid(...TIMEFRAMES).required()
    .messages({ 'any.only': 'Timeframe no válido', 'any.required': 'El timeframe es obligatorio' }),
  period_date: Joi.date().required()
    .messages({ 'any.required': 'La fecha del período es obligatoria' }),
  mood_start_score: Joi.number().integer().min(1).max(5).required()
    .messages({ 'any.required': 'El estado anímico inicial es obligatorio' }),
  mood_start_comment: Joi.string().max(1000).allow('', null).optional(),
  description: Joi.string().max(2000).allow('', null).optional(),
  parent_session_id: Joi.number().integer().positive().optional(),
});

export const closeSessionSchema = Joi.object({
  period_end_date: Joi.date().required()
    .messages({ 'any.required': 'La fecha final del período es obligatoria' }),
  mood_end_score: Joi.number().integer().min(1).max(5).required()
    .messages({ 'any.required': 'El estado anímico final es obligatorio' }),
  mood_end_comment: Joi.string().max(1000).allow('', null).optional(),
  closing_comment: Joi.string().trim().min(1).required()
    .messages({ 'any.required': 'El comentario de cierre es obligatorio', 'string.min': 'El comentario de cierre no puede estar vacío' }),
});

export const addTradeSchema = Joi.object({
  result: Joi.string().valid(...TRADE_RESULTS).required()
    .messages({ 'any.only': 'Resultado no válido', 'any.required': 'El resultado es obligatorio' }),
  comment: Joi.string().trim().min(1).max(2000).required()
    .messages({ 'any.required': 'El comentario es obligatorio', 'string.min': 'El comentario no puede estar vacío' }),
});
