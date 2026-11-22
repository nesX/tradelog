import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import * as ctrl from '../controllers/todo.controller.js';
import {
  todoListSchema,
  createTodoItemSchema,
  updateTodoItemSchema,
  moveTodoItemSchema,
} from '../validators/todo.validator.js';

const router = Router();
router.use(authenticate);

// Listas
router.get('/lists', ctrl.getLists);
router.post('/lists', validate(todoListSchema), ctrl.createList);
router.patch('/lists/:listId', validate(todoListSchema), ctrl.updateList);
router.delete('/lists/:listId', ctrl.deleteList);

// Items de una lista
router.get('/lists/:listId/items', ctrl.getItems);
router.post('/lists/:listId/items', validate(createTodoItemSchema), ctrl.createItem);

// Items (el contenido se edita con los endpoints de bloques de /api/notes)
router.patch('/items/:itemId', validate(updateTodoItemSchema), ctrl.updateItem);
router.patch('/items/:itemId/move', validate(moveTodoItemSchema), ctrl.moveItem);
router.delete('/items/:itemId', ctrl.deleteItem);

export default router;
