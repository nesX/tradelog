import Joi from 'joi';

export const SYMBOL_PATTERN = /^[A-Z0-9]{2,30}$/;

export const symbolParamSchema = Joi.object({
  symbol: Joi.string().uppercase().pattern(SYMBOL_PATTERN).required().messages({
    'string.pattern.base': 'Símbolo inválido',
  }),
});
