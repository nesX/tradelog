import { generateKeyBetween } from 'fractional-indexing';
import { withUserLock } from '../config/database.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import * as repo from '../repositories/todo.repository.js';
import * as noteRepo from '../repositories/note.repository.js';

// El contenido de cada item vive en una nota oculta (notes.type = 'todo') y se
// edita con los endpoints de bloques de notas. Ver 027_migration_todos.sql.

// ============================================================
// LISTAS
// ============================================================

export const getLists = async (userId) => {
  return repo.getLists(userId);
};

export const createList = async (userId, { name }) => {
  // Bajo advisory lock: leer la última posición + INSERT atómicos.
  return withUserLock(userId, (client) => repo.createList(userId, name, client));
};

export const updateList = async (userId, listId, { name }) => {
  const list = await repo.updateListName(userId, listId, name);
  if (!list) throw new NotFoundError('Lista no encontrada');
  return list;
};

export const deleteList = async (userId, listId) => {
  return withUserLock(userId, async (client) => {
    const list = await repo.getListById(userId, listId, client);
    if (!list) throw new NotFoundError('Lista no encontrada');
    await repo.softDeleteListNotes(listId, client);
    await repo.deleteList(listId, client);
  });
};

// ============================================================
// ITEMS
// ============================================================

export const getItems = async (userId, listId) => {
  const list = await repo.getListById(userId, listId);
  if (!list) throw new NotFoundError('Lista no encontrada');
  return repo.getItems(listId);
};

/**
 * Crea el item junto con su nota de contenido, que arranca con un bloque de
 * texto vacío (el campo por defecto al desplegar el item).
 */
export const createItem = async (userId, listId, { title }) => {
  return withUserLock(userId, async (client) => {
    const list = await repo.getListById(userId, listId, client);
    if (!list) throw new NotFoundError('Lista no encontrada');

    const note = await noteRepo.create(userId, { title, type: 'todo' }, client);
    await noteRepo.createBlock(note.id, { block_type: 'text' }, client);
    return repo.createItem(listId, note.id, title, client);
  });
};

export const updateItem = async (userId, itemId, { title, completed }) => {
  const item = await repo.getItemById(userId, itemId);
  if (!item) throw new NotFoundError('Pendiente no encontrado');
  return repo.updateItem(itemId, { title, completed });
};

/**
 * Reordena un item dentro de su lista con fractional indexing (un único UPDATE).
 * @param {'sibling-above'|'sibling-below'} params.dropType
 */
export const moveItem = async ({ itemId, targetId, dropType, userId }) => {
  if (itemId === targetId) {
    throw new ValidationError('No puedes mover un pendiente sobre sí mismo');
  }

  return withUserLock(userId, async (client) => {
    const [item, target] = await Promise.all([
      repo.getItemById(userId, itemId, client),
      repo.getItemById(userId, targetId, client),
    ]);
    if (!item) throw new NotFoundError('Pendiente no encontrado');
    if (!target) throw new NotFoundError('Pendiente destino no encontrado');
    if (item.list_id !== target.list_id) {
      throw new ValidationError('Solo se puede reordenar dentro de la misma lista');
    }

    const side = dropType === 'sibling-above' ? 'above' : 'below';
    const { before, after } = await repo.getSiblingItemPositions(
      target.list_id,
      target.position,
      side,
      itemId,
      client
    );
    const updated = await repo.updateItemPosition(itemId, generateKeyBetween(before, after), client);
    if (!updated) throw new NotFoundError('No se pudo mover el pendiente');
    return updated;
  });
};

/**
 * Borra el item y hace soft-delete de su nota de contenido: la purga diferida
 * de notas elimina después los bloques y los archivos de imagen.
 */
export const deleteItem = async (userId, itemId) => {
  return withUserLock(userId, async (client) => {
    const item = await repo.getItemById(userId, itemId, client);
    if (!item) throw new NotFoundError('Pendiente no encontrado');
    await repo.deleteItem(itemId, client);
    await noteRepo.softDelete(userId, item.note_id, client);
  });
};
