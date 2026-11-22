import Joi from 'joi';

export const todoListSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
});

export const createTodoItemSchema = Joi.object({
  title: Joi.string().trim().min(1).max(500).required(),
});

export const updateTodoItemSchema = Joi.object({
  title: Joi.string().trim().min(1).max(500).optional(),
  completed: Joi.boolean().optional(),
}).min(1);

export const moveTodoItemSchema = Joi.object({
  targetId: Joi.number().integer().positive().required(),
  dropType: Joi.string().valid('sibling-above', 'sibling-below').required(),
});
