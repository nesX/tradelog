import Joi from 'joi';
import { SYMBOL_PATTERN } from './marketSymbol.validator.js';

// Validadores de alertas de precio, recordatorios por fecha y tarjetas de la
// bandeja (recordatorios de análisis).

// Fechas ISO 8601 CON zona (Z u offset): sin zona, el servidor (en UTC) las
// interpretaría corridas respecto a la hora local del usuario.
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/;

/** Fecha futura (al menos `minAheadMs` desde ahora); se convierte a Date. */
const futureDate = (minAheadMs = 0) =>
  Joi.string()
    .pattern(ISO_WITH_ZONE)
    .custom((value, helpers) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return helpers.error('any.invalid');
      if (date.getTime() < Date.now() + minAheadMs) return helpers.error('date.future');
      return date;
    })
    .messages({
      'string.pattern.base': '{#label} debe ser una fecha ISO 8601 con zona horaria',
      'any.invalid': '{#label} no es una fecha válida',
      'date.future':
        minAheadMs > 0 ? '{#label} debe ser al menos 1 minuto en el futuro' : '{#label} debe ser una fecha futura',
    });

const anchor = {
  block_id: Joi.number().integer().positive(),
  note_id: Joi.number().integer().positive(),
};
const anchorMessages = {
  'object.xor': 'Indica block_id o note_id, no ambos',
  'object.missing': 'Indica block_id o note_id',
};

const message = Joi.string().trim().max(500).allow('', null);

export const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

// ---------- Alertas de precio ----------

const priceFields = {
  target_price: Joi.number().positive().precision(8).messages({
    'number.positive': 'El nivel debe ser mayor que 0',
  }),
  direction: Joi.string().valid('above', 'below'),
  is_invalidation: Joi.boolean(),
  near_pct: Joi.number().min(0.1).max(50).precision(2).allow(null).messages({
    'number.min': 'El aviso previo debe estar entre 0.1% y 50%',
    'number.max': 'El aviso previo debe estar entre 0.1% y 50%',
  }),
  deadline_at: futureDate().allow(null),
  message,
};

export const createPriceAlertSchema = Joi.object({
  ...anchor,
  symbol: Joi.string().trim().uppercase().pattern(SYMBOL_PATTERN).required().messages({
    'string.pattern.base': 'Símbolo inválido',
  }),
  ...priceFields,
  target_price: priceFields.target_price.required(),
  direction: priceFields.direction.required(),
  is_invalidation: priceFields.is_invalidation.default(false),
  near_pct: priceFields.near_pct.default(null),
  deadline_at: priceFields.deadline_at.default(null),
})
  .xor('block_id', 'note_id')
  .messages(anchorMessages);

export const updatePriceAlertSchema = Joi.object(priceFields).min(1);

export const listPriceAlertsSchema = Joi.object({
  status: Joi.string().valid('active', 'triggered'),
});

// ---------- Recordatorios por fecha ----------

export const createDateReminderSchema = Joi.object({
  ...anchor,
  remind_at: futureDate(60_000).required(),
  message,
})
  .xor('block_id', 'note_id')
  .messages(anchorMessages);

export const updateDateReminderSchema = Joi.object({
  remind_at: futureDate(60_000),
  message,
}).min(1);

export const listDateRemindersSchema = Joi.object({
  status: Joi.string().valid('pending', 'sent'),
});

// ---------- Bandeja ----------

export const listNotificationsSchema = Joi.object({
  status: Joi.string().valid('open', 'resolved').default('open'),
  before: Joi.number().integer().positive(),
});

export const resolveNotificationSchema = Joi.object({
  resolution: Joi.string().valid('dismissed').default('dismissed'),
  delete_sibling_alerts: Joi.boolean().default(false),
});
