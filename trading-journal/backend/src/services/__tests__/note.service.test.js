import { jest } from '@jest/globals';

/**
 * Test de la lógica de "Repaso" (revisit) del note.service con el repositorio
 * mockeado (sin BD). Espejo del enfoque de trade.service.test.js: en ESM hay que
 * registrar los mocks con `jest.unstable_mockModule` ANTES de importar el módulo.
 */

const mockNoteRepo = {
  setRevisit: jest.fn(),
  findMarkedForRevisit: jest.fn(),
  getBlockById: jest.fn(),
  findNoteByIdAndUser: jest.fn(),
  softDelete: jest.fn(),
  deleteBlock: jest.fn(),
};

// Cliente ficticio de la transacción: withUserLock ejecuta el callback directo.
const mockClient = { query: jest.fn() };

// El service importa también el repo de trades; se mockea vacío para no arrastrar BD.
jest.unstable_mockModule('../../repositories/note.repository.js', () => mockNoteRepo);
jest.unstable_mockModule('../../repositories/trade.repository.js', () => ({}));
jest.unstable_mockModule('../../config/database.js', () => ({
  withUserLock: (_userId, fn) => fn(mockClient),
}));

const { toggleRevisit, getRevisitData, deleteBlock } = await import('../note.service.js');
const { NotFoundError } = await import('../../middleware/errorHandler.js');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('note.service — repaso', () => {
  describe('toggleRevisit', () => {
    it('marca un bloque para repaso y devuelve el bloque', async () => {
      const block = { id: 10, note_id: 3, marked_for_revisit: true };
      mockNoteRepo.setRevisit.mockResolvedValue(block);

      const result = await toggleRevisit(10, 1, true);

      expect(result).toBe(block);
      expect(mockNoteRepo.setRevisit).toHaveBeenCalledWith(10, 1, true);
    });

    it('lanza NotFoundError si el bloque no existe o no pertenece al usuario', async () => {
      mockNoteRepo.setRevisit.mockResolvedValue(null);

      await expect(toggleRevisit(999, 1, true)).rejects.toBeInstanceOf(NotFoundError);
      await expect(toggleRevisit(999, 1, true)).rejects.toThrow(/Bloque no encontrado/i);
    });
  });

  describe('getRevisitData', () => {
    it('devuelve los bloques marcados y pendingHours (null por defecto)', async () => {
      const blocks = [{ id: 1 }, { id: 2 }];
      mockNoteRepo.findMarkedForRevisit.mockResolvedValue(blocks);

      const result = await getRevisitData(1);

      expect(result).toEqual({ blocks, pendingHours: null });
      expect(mockNoteRepo.findMarkedForRevisit).toHaveBeenCalledWith(1, null);
    });

    it('propaga pendingHours al repositorio', async () => {
      mockNoteRepo.findMarkedForRevisit.mockResolvedValue([]);

      const result = await getRevisitData(1, 168);

      expect(result).toEqual({ blocks: [], pendingHours: 168 });
      expect(mockNoteRepo.findMarkedForRevisit).toHaveBeenCalledWith(1, 168);
    });
  });
});

describe('note.service — deleteBlock', () => {
  it('borrar el bloque de una sub-nota borra también la sub-nota y su subtree', async () => {
    mockNoteRepo.getBlockById.mockResolvedValue({
      id: 5, note_id: 10, user_id: 1, block_type: 'reference', linked_note_id: 20,
    });
    mockNoteRepo.findNoteByIdAndUser.mockResolvedValue({ id: 20, parent_note_id: 10 });
    mockNoteRepo.softDelete.mockResolvedValue([20, 21]);
    mockNoteRepo.deleteBlock.mockResolvedValue([]);

    const result = await deleteBlock(1, 5);

    expect(result).toEqual({ deleted_note_ids: [20, 21] });
    expect(mockNoteRepo.softDelete).toHaveBeenCalledWith(1, 20, mockClient);
    expect(mockNoteRepo.deleteBlock).toHaveBeenCalledWith(5, mockClient);
  });

  it('un enlace a una nota que no es hija de la nota del bloque solo borra el bloque', async () => {
    mockNoteRepo.getBlockById.mockResolvedValue({
      id: 5, note_id: 10, user_id: 1, block_type: 'reference', linked_note_id: 20,
    });
    mockNoteRepo.findNoteByIdAndUser.mockResolvedValue({ id: 20, parent_note_id: 99 });
    mockNoteRepo.deleteBlock.mockResolvedValue([]);

    const result = await deleteBlock(1, 5);

    expect(result).toEqual({ deleted_note_ids: [] });
    expect(mockNoteRepo.softDelete).not.toHaveBeenCalled();
    expect(mockNoteRepo.deleteBlock).toHaveBeenCalledWith(5, mockClient);
  });

  it('un bloque que no es reference no consulta notas enlazadas', async () => {
    mockNoteRepo.getBlockById.mockResolvedValue({ id: 6, note_id: 10, user_id: 1, block_type: 'text' });
    mockNoteRepo.deleteBlock.mockResolvedValue([]);

    const result = await deleteBlock(1, 6);

    expect(result).toEqual({ deleted_note_ids: [] });
    expect(mockNoteRepo.findNoteByIdAndUser).not.toHaveBeenCalled();
    expect(mockNoteRepo.softDelete).not.toHaveBeenCalled();
  });

  it('lanza NotFoundError si el bloque es de otro usuario y no borra nada', async () => {
    mockNoteRepo.getBlockById.mockResolvedValue({
      id: 5, note_id: 10, user_id: 2, block_type: 'reference', linked_note_id: 20,
    });

    await expect(deleteBlock(1, 5)).rejects.toBeInstanceOf(NotFoundError);
    expect(mockNoteRepo.softDelete).not.toHaveBeenCalled();
    expect(mockNoteRepo.deleteBlock).not.toHaveBeenCalled();
  });
});
