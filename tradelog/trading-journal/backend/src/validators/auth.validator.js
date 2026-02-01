import Joi from 'joi';

export const googleLoginSchema = Joi.object({
  idToken: Joi.string().required().messages({
    'string.empty': 'El token de Google es requerido',
    'any.required': 'El token de Google es requerido',
  }),
});
