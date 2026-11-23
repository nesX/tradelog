import Joi from 'joi';

// Validadores de /api/push (dispositivos vinculados para los avisos push).
// `subscription.toJSON()` del navegador trae además `expirationTime`: la
// validación lo descarta (stripUnknown).

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

const endpoint = Joi.string()
  .uri({ scheme: ['https'] })
  .max(2048)
  .required()
  .messages({
    'string.uriCustomScheme': 'endpoint debe ser una URL https',
  });

const key = Joi.string().pattern(BASE64URL).max(256).required().messages({
  'string.pattern.base': '{#label} debe estar en base64url',
});

export const subscriptionSchema = Joi.object({
  endpoint,
  keys: Joi.object({ p256dh: key, auth: key }).required(),
  user_agent: Joi.string().trim().max(300).truncate().allow('', null),
});

export const endpointSchema = Joi.object({ endpoint });
