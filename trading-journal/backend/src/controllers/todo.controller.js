import { sendSuccess, sendCreated, sendDeleted } from '../utils/response.js';
import * as todoService from '../services/todo.service.js';

// ============================================================
// LISTAS
// ============================================================

export const getLists = async (req, res) => {
  const data = await todoService.getLists(req.user.id);
  sendSuccess(res, data);
};

export const createList = async (req, res) => {
  const data = await todoService.createList(req.user.id, req.body);
  sendCreated(res, data, 'Lista creada');
};

export const updateList = async (req, res) => {
  const data = await todoService.updateList(req.user.id, parseInt(req.params.listId, 10), req.body);
  sendSuccess(res, data, 'Lista actualizada');
};

export const deleteList = async (req, res) => {
  await todoService.deleteList(req.user.id, parseInt(req.params.listId, 10));
  sendDeleted(res, 'Lista eliminada');
};

// ============================================================
// ITEMS
// ============================================================

export const getItems = async (req, res) => {
  const data = await todoService.getItems(req.user.id, parseInt(req.params.listId, 10));
  sendSuccess(res, data);
};

export const createItem = async (req, res) => {
  const data = await todoService.createItem(req.user.id, parseInt(req.params.listId, 10), req.body);
  sendCreated(res, data, 'Pendiente creado');
};

export const updateItem = async (req, res) => {
  const data = await todoService.updateItem(req.user.id, parseInt(req.params.itemId, 10), req.body);
  sendSuccess(res, data, 'Pendiente actualizado');
};

export const moveItem = async (req, res) => {
  const itemId = parseInt(req.params.itemId, 10);
  const { targetId, dropType } = req.body;
  const data = await todoService.moveItem({ itemId, targetId, dropType, userId: req.user.id });
  sendSuccess(res, data, 'Pendiente movido');
};

export const deleteItem = async (req, res) => {
  await todoService.deleteItem(req.user.id, parseInt(req.params.itemId, 10));
  sendDeleted(res, 'Pendiente eliminado');
};
