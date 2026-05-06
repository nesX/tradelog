import Joi from 'joi';

export const createUserSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required().messages({
    'string.email': 'Email inválido',
    'any.required': 'El email es obligatorio',
  }),
  role: Joi.string().valid('user', 'admin').default('user').messages({
    'any.only': 'El rol debe ser "user" o "admin"',
  }),
});

export const updateUserRoleSchema = Joi.object({
  role: Joi.string().valid('user', 'admin').required().messages({
    'any.only': 'El rol debe ser "user" o "admin"',
    'any.required': 'El rol es obligatorio',
  }),
});

export const listUsersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  role: Joi.string().valid('user', 'admin', 'super_admin').optional(),
  includeDeleted: Joi.boolean().default(false),
});
