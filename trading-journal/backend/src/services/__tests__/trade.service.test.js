import { jest } from '@jest/globals';

/**
 * Test de service con repositorios mockeados (sin BD).
 *
 * En ESM hay que registrar los mocks con `jest.unstable_mockModule` ANTES
 * de importar dinámicamente el módulo bajo prueba.
 */

const mockTradeRepo = {
  getTradeTagsByIds: jest.fn(),
  create: jest.fn(),
  addImages: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
};

const mockSystemRepo = {
  validateSignalsBelongToSystem: jest.fn(),
};

jest.unstable_mockModule(
  '../../repositories/trade.repository.js',
  () => mockTradeRepo,
);
jest.unstable_mockModule(
  '../../repositories/system.repository.js',
  () => mockSystemRepo,
);

const { createTrade, updateTrade, getTradeById } = await import(
  '../trade.service.js'
);
const { ValidationError, NotFoundError } = await import(
  '../../middleware/errorHandler.js'
);

const baseData = () => ({
  symbol: 'BTCUSDT',
  trade_type: 'LONG',
  entry_price: 42000,
  quantity: 0.1,
  entry_date: new Date('2026-01-15T10:30:00Z'),
});

describe('trade.service', () => {
  describe('createTrade', () => {
    it('crea el trade cuando no hay señales ni tags', async () => {
      const data = baseData();
      mockTradeRepo.create.mockResolvedValue({ id: 99, ...data });

      const result = await createTrade(1, data, []);

      expect(result.id).toBe(99);
      expect(mockTradeRepo.create).toHaveBeenCalledWith(1, data);
      expect(mockSystemRepo.validateSignalsBelongToSystem).not.toHaveBeenCalled();
    });

    it('rechaza tag_ids que no pertenecen al usuario', async () => {
      const data = { ...baseData(), tag_ids: [1, 2, 3] };
      // Sólo se encuentran 2 de los 3 tags pedidos
      mockTradeRepo.getTradeTagsByIds.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      await expect(createTrade(1, data)).rejects.toBeInstanceOf(ValidationError);
      await expect(createTrade(1, data)).rejects.toThrow(
        /no existen o no te pertenecen/i,
      );
      expect(mockTradeRepo.create).not.toHaveBeenCalled();
    });

    it('acepta tag_ids cuando todos pertenecen al usuario', async () => {
      const data = { ...baseData(), tag_ids: [1, 2] };
      mockTradeRepo.getTradeTagsByIds.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      mockTradeRepo.create.mockResolvedValue({ id: 5, ...data });

      const result = await createTrade(1, data);
      expect(result.id).toBe(5);
      expect(mockTradeRepo.getTradeTagsByIds).toHaveBeenCalledWith(1, [1, 2]);
    });

    it('rechaza señales que no pertenecen al sistema primario', async () => {
      const data = {
        ...baseData(),
        primary_system_id: 7,
        primary_signals: [{ signal_id: 10, value: 1 }],
      };
      mockSystemRepo.validateSignalsBelongToSystem.mockResolvedValue(false);

      await expect(createTrade(1, data)).rejects.toBeInstanceOf(ValidationError);
      await expect(createTrade(1, data)).rejects.toThrow(/sistema primario/i);
      expect(mockSystemRepo.validateSignalsBelongToSystem).toHaveBeenCalledWith(
        7,
        [10],
      );
      expect(mockTradeRepo.create).not.toHaveBeenCalled();
    });

    it('calcula exit_date automáticamente si hay exit_price y falta exit_date', async () => {
      const data = { ...baseData(), exit_price: 43000 };
      mockTradeRepo.create.mockResolvedValue({ id: 1, ...data });

      await createTrade(1, data);

      const passed = mockTradeRepo.create.mock.calls[0][1];
      expect(passed.exit_date).toBeInstanceOf(Date);
    });
  });

  describe('getTradeById', () => {
    it('lanza NotFoundError si el trade no existe', async () => {
      mockTradeRepo.findById.mockResolvedValue(null);
      await expect(getTradeById(1, 123)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('devuelve el trade si existe', async () => {
      mockTradeRepo.findById.mockResolvedValue({ id: 123 });
      await expect(getTradeById(1, 123)).resolves.toEqual({ id: 123 });
    });
  });

  describe('updateTrade', () => {
    it('lanza NotFoundError si el trade a actualizar no existe', async () => {
      mockTradeRepo.findById.mockResolvedValue(null);
      await expect(
        updateTrade(1, 55, { symbol: 'ETHUSDT' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(mockTradeRepo.update).not.toHaveBeenCalled();
    });
  });
});
