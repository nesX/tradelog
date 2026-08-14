import { jest } from '@jest/globals';

/**
 * Test de la lógica de "Repaso" (revisit) del note.service con el repositorio
 * mockeado (sin BD). Espejo del enfoque de trade.service.test.js: en ESM hay que
 * registrar los mocks con `jest.unstable_mockModule` ANTES de importar el módulo.
 */

const mockNoteRepo = {
  setRevisit: jest.fn(),
  findMarkedForRevisit: jest.fn(),
};

// El service importa también el repo de trades; se mockea vacío para no arrastrar BD.
jest.unstable_mockModule('../../repositories/note.repository.js', () => mockNoteRepo);
jest.unstable_mockModule('../../repositories/trade.repository.js', () => ({}));

const { toggleRevisit, getRevisitData } = await import('../note.service.js');
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
