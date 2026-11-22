import { jest } from '@jest/globals';

/**
 * Test del todo.service con los repositorios mockeados (sin BD). Mismo enfoque
 * que note.service.test.js: los mocks se registran con `jest.unstable_mockModule`
 * ANTES de importar el módulo.
 */

const mockTodoRepo = {
  getListById: jest.fn(),
  softDeleteListNotes: jest.fn(),
  deleteList: jest.fn(),
  getItemById: jest.fn(),
  createItem: jest.fn(),
  updateItem: jest.fn(),
  getSiblingItemPositions: jest.fn(),
  updateItemPosition: jest.fn(),
  deleteItem: jest.fn(),
};

const mockNoteRepo = {
  create: jest.fn(),
  createBlock: jest.fn(),
  softDelete: jest.fn(),
};

const mockClient = { query: jest.fn() };

jest.unstable_mockModule('../../repositories/todo.repository.js', () => mockTodoRepo);
jest.unstable_mockModule('../../repositories/note.repository.js', () => mockNoteRepo);
jest.unstable_mockModule('../../config/database.js', () => ({
  withUserLock: (_userId, fn) => fn(mockClient),
}));

const { createItem, updateItem, moveItem, deleteItem, deleteList } = await import('../todo.service.js');
const { NotFoundError, ValidationError } = await import('../../middleware/errorHandler.js');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('todo.service', () => {
  describe('createItem', () => {
    it('crea la nota oculta con un bloque de texto vacío y luego el item', async () => {
      mockTodoRepo.getListById.mockResolvedValue({ id: 5, user_id: 1 });
      mockNoteRepo.create.mockResolvedValue({ id: 40 });
      const item = { id: 7, note_id: 40, title: 'Revisar BTC' };
      mockTodoRepo.createItem.mockResolvedValue(item);

      const result = await createItem(1, 5, { title: 'Revisar BTC' });

      expect(result).toBe(item);
      expect(mockNoteRepo.create).toHaveBeenCalledWith(1, { title: 'Revisar BTC', type: 'todo' }, mockClient);
      expect(mockNoteRepo.createBlock).toHaveBeenCalledWith(40, { block_type: 'text' }, mockClient);
      expect(mockTodoRepo.createItem).toHaveBeenCalledWith(5, 40, 'Revisar BTC', mockClient);
    });

    it('lanza NotFoundError si la lista no es del usuario, sin crear la nota', async () => {
      mockTodoRepo.getListById.mockResolvedValue(null);

      await expect(createItem(1, 99, { title: 'x' })).rejects.toBeInstanceOf(NotFoundError);
      expect(mockNoteRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('updateItem', () => {
    it('lanza NotFoundError si el item no existe o es ajeno', async () => {
      mockTodoRepo.getItemById.mockResolvedValue(null);

      await expect(updateItem(1, 3, { completed: true })).rejects.toBeInstanceOf(NotFoundError);
      expect(mockTodoRepo.updateItem).not.toHaveBeenCalled();
    });

    it('propaga título y estado al repositorio', async () => {
      mockTodoRepo.getItemById.mockResolvedValue({ id: 3 });
      mockTodoRepo.updateItem.mockResolvedValue({ id: 3, completed_at: 'now' });

      await updateItem(1, 3, { completed: true });

      expect(mockTodoRepo.updateItem).toHaveBeenCalledWith(3, { title: undefined, completed: true });
    });
  });

  describe('moveItem', () => {
    it('rechaza mover sobre sí mismo', async () => {
      await expect(
        moveItem({ itemId: 2, targetId: 2, dropType: 'sibling-above', userId: 1 })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('rechaza mover entre listas distintas', async () => {
      mockTodoRepo.getItemById
        .mockResolvedValueOnce({ id: 2, list_id: 1, position: 'a0' })
        .mockResolvedValueOnce({ id: 3, list_id: 2, position: 'a1' });

      await expect(
        moveItem({ itemId: 2, targetId: 3, dropType: 'sibling-below', userId: 1 })
      ).rejects.toThrow(/misma lista/i);
    });

    it('calcula una posición entre los vecinos del destino', async () => {
      mockTodoRepo.getItemById
        .mockResolvedValueOnce({ id: 2, list_id: 1, position: 'a0' })
        .mockResolvedValueOnce({ id: 3, list_id: 1, position: 'a1' });
      mockTodoRepo.getSiblingItemPositions.mockResolvedValue({ before: 'a1', after: 'a2' });
      mockTodoRepo.updateItemPosition.mockImplementation(async (id, position) => ({ id, position }));

      const result = await moveItem({ itemId: 2, targetId: 3, dropType: 'sibling-below', userId: 1 });

      expect(mockTodoRepo.getSiblingItemPositions).toHaveBeenCalledWith(1, 'a1', 'below', 2, mockClient);
      expect(result.position > 'a1' && result.position < 'a2').toBe(true);
    });
  });

  describe('deleteItem', () => {
    it('borra el item y hace soft-delete de su nota', async () => {
      mockTodoRepo.getItemById.mockResolvedValue({ id: 3, note_id: 40 });

      await deleteItem(1, 3);

      expect(mockTodoRepo.deleteItem).toHaveBeenCalledWith(3, mockClient);
      expect(mockNoteRepo.softDelete).toHaveBeenCalledWith(1, 40, mockClient);
    });
  });

  describe('deleteList', () => {
    it('hace soft-delete de las notas de los items antes de borrar la lista', async () => {
      mockTodoRepo.getListById.mockResolvedValue({ id: 5 });

      await deleteList(1, 5);

      expect(mockTodoRepo.softDeleteListNotes).toHaveBeenCalledWith(5, mockClient);
      expect(mockTodoRepo.deleteList).toHaveBeenCalledWith(5, mockClient);
    });

    it('lanza NotFoundError si la lista es ajena', async () => {
      mockTodoRepo.getListById.mockResolvedValue(null);

      await expect(deleteList(1, 5)).rejects.toBeInstanceOf(NotFoundError);
      expect(mockTodoRepo.deleteList).not.toHaveBeenCalled();
    });
  });
});
