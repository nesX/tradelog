import {
  createTradeSchema,
  updateTradeSchema,
  listTradesQuerySchema,
} from '../trade.validator.js';

describe('trade.validator', () => {
  const baseTrade = {
    symbol: 'btcusdt',
    trade_type: 'long',
    entry_price: 42000.5,
    quantity: 0.1,
    entry_date: '2026-01-15T10:30:00.000Z',
  };

  describe('createTradeSchema', () => {
    it('acepta un trade válido y normaliza symbol/trade_type a mayúsculas', () => {
      const { error, value } = createTradeSchema.validate(baseTrade);
      expect(error).toBeUndefined();
      expect(value.symbol).toBe('BTCUSDT');
      expect(value.trade_type).toBe('LONG');
      // commission tiene default 0
      expect(value.commission).toBe(0);
    });

    it('rechaza cuando falta un campo requerido (entry_price)', () => {
      const { entry_price, ...withoutPrice } = baseTrade;
      const { error } = createTradeSchema.validate(withoutPrice);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('entry_price');
    });

    it('rechaza trade_type que no es LONG/SHORT', () => {
      const { error } = createTradeSchema.validate({
        ...baseTrade,
        trade_type: 'SIDEWAYS',
      });
      expect(error).toBeDefined();
    });

    it('rechaza entry_price no positivo', () => {
      const { error } = createTradeSchema.validate({
        ...baseTrade,
        entry_price: -1,
      });
      expect(error).toBeDefined();
    });

    it('acepta tag_ids como array de enteros positivos', () => {
      const { error, value } = createTradeSchema.validate({
        ...baseTrade,
        tag_ids: [1, 2, 3],
      });
      expect(error).toBeUndefined();
      expect(value.tag_ids).toEqual([1, 2, 3]);
    });

    it('rechaza tag_ids con valores no positivos', () => {
      const { error } = createTradeSchema.validate({
        ...baseTrade,
        tag_ids: [1, 0, -3],
      });
      expect(error).toBeDefined();
    });

    it('rechaza sistema secundario sin sistema primario (regla custom)', () => {
      const { error } = createTradeSchema.validate({
        ...baseTrade,
        secondary_system_id: 5,
      });
      expect(error).toBeDefined();
    });

    it('acepta primary_signals con value dentro de rango', () => {
      const { error, value } = createTradeSchema.validate({
        ...baseTrade,
        primary_system_id: 1,
        primary_signals: [{ signal_id: 10, value: 3 }],
      });
      expect(error).toBeUndefined();
      expect(value.primary_signals[0].value).toBe(3);
    });

    it('aplica default value=1 a una señal sin value', () => {
      const { error, value } = createTradeSchema.validate({
        ...baseTrade,
        primary_system_id: 1,
        primary_signals: [{ signal_id: 10 }],
      });
      expect(error).toBeUndefined();
      expect(value.primary_signals[0].value).toBe(1);
    });
  });

  describe('updateTradeSchema', () => {
    it('rechaza un objeto vacío (requiere al menos un campo)', () => {
      const { error } = updateTradeSchema.validate({});
      expect(error).toBeDefined();
      expect(error.message).toMatch(/al menos un campo/i);
    });

    it('acepta actualización parcial con tag_ids', () => {
      const { error, value } = updateTradeSchema.validate({ tag_ids: [7] });
      expect(error).toBeUndefined();
      expect(value.tag_ids).toEqual([7]);
    });
  });

  describe('listTradesQuerySchema', () => {
    it('aplica defaults de paginación y orden', () => {
      const { error, value } = listTradesQuerySchema.validate({});
      expect(error).toBeUndefined();
      expect(value.page).toBe(1);
      expect(value.limit).toBe(20);
      expect(value.sortBy).toBe('entry_date');
      expect(value.sortDir).toBe('DESC');
    });

    it('acepta tag_ids como CSV de enteros', () => {
      const { error, value } = listTradesQuerySchema.validate({
        tag_ids: '1,2,3',
      });
      expect(error).toBeUndefined();
      expect(value.tag_ids).toBe('1,2,3');
    });

    it('rechaza tag_ids CSV mal formado', () => {
      expect(listTradesQuerySchema.validate({ tag_ids: '1,,2' }).error).toBeDefined();
      expect(listTradesQuerySchema.validate({ tag_ids: 'a,b' }).error).toBeDefined();
      expect(listTradesQuerySchema.validate({ tag_ids: '1,2,' }).error).toBeDefined();
    });

    it('rechaza limit fuera de rango', () => {
      expect(listTradesQuerySchema.validate({ limit: 0 }).error).toBeDefined();
      expect(listTradesQuerySchema.validate({ limit: 101 }).error).toBeDefined();
    });
  });
});
