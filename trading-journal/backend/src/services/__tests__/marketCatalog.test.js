import { jest } from '@jest/globals';

/**
 * Sync del catálogo de perpetuos, caché de precios y payload de las tarjetas,
 * con cliente de Binance y repositorios mockeados (sin BD ni red).
 */

class BinanceBackoffError extends Error {
  constructor(retryAfter) {
    super('backoff');
    this.retryAfter = retryAfter;
  }
}

const mockBinance = {
  getExchangeInfo: jest.fn(),
  getAllPrices: jest.fn(),
  getBackoffUntil: jest.fn(() => null),
  getUsedWeight: jest.fn(() => 0),
  BinanceBackoffError,
};
const mockSymbolRepo = {
  listActiveSymbols: jest.fn(),
  upsertMany: jest.fn(),
  markInvalid: jest.fn(),
  findBySymbol: jest.fn(),
};
const mockJobStateRepo = { setCatalogSyncedAt: jest.fn(), setBackoffUntil: jest.fn() };
const mockAlertRepo = { findActiveBySymbolsForUpdate: jest.fn() };
const mockNotificationRepo = { insert: jest.fn() };
const mockClient = { query: jest.fn() };

jest.unstable_mockModule('../../clients/binanceFutures.js', () => mockBinance);
jest.unstable_mockModule('../../repositories/marketSymbol.repository.js', () => mockSymbolRepo);
jest.unstable_mockModule('../../repositories/reminderJobState.repository.js', () => mockJobStateRepo);
jest.unstable_mockModule('../../repositories/priceAlert.repository.js', () => mockAlertRepo);
jest.unstable_mockModule('../../repositories/notification.repository.js', () => mockNotificationRepo);
jest.unstable_mockModule('../../config/database.js', () => ({
  withTransaction: (fn) => fn(mockClient),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { syncCatalog } = await import('../marketSymbol.service.js');
const { getPrice, resetPriceCache, CACHE_TTL_MS } = await import('../marketPrice.service.js');
const { buildExcerpt, stripMarkdown, buildPriceAlertPayload } = await import('../notificationPayload.js');

const contract = (symbol, overrides = {}) => ({
  symbol,
  contractType: 'PERPETUAL',
  status: 'TRADING',
  baseAsset: symbol.replace(/USDT$/, ''),
  quoteAsset: 'USDT',
  tickSize: '0.01',
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockBinance.getBackoffUntil.mockReturnValue(null);
  mockBinance.getUsedWeight.mockReturnValue(0);
  mockSymbolRepo.markInvalid.mockImplementation(async (symbols) => symbols);
  mockAlertRepo.findActiveBySymbolsForUpdate.mockResolvedValue([]);
});

describe('syncCatalog', () => {
  it('el primer sync (catálogo vacío) solo inserta perpetuos cripto y TradFi en TRADING', async () => {
    mockBinance.getExchangeInfo.mockResolvedValue([
      contract('BTCUSDT'),
      contract('XAUUSDT', { contractType: 'TRADIFI_PERPETUAL' }),
      contract('BTCUSDT_261225', { contractType: 'CURRENT_QUARTER' }),
      contract('OLDUSDT', { status: 'SETTLING' }),
    ]);
    mockSymbolRepo.listActiveSymbols.mockResolvedValue([]);

    const result = await syncCatalog();

    expect(result).toEqual({ skipped: false, total: 2, delisted: 0 });
    const upserted = mockSymbolRepo.upsertMany.mock.calls[0][0].map((c) => c.symbol);
    expect(upserted).toEqual(['BTCUSDT', 'XAUUSDT']);
    expect(mockSymbolRepo.markInvalid).not.toHaveBeenCalled();
    expect(mockJobStateRepo.setCatalogSyncedAt).toHaveBeenCalled();
  });

  it('salvaguarda: con menos del 50% de los vigentes no toca nada', async () => {
    mockBinance.getExchangeInfo.mockResolvedValue([contract('BTCUSDT')]);
    mockSymbolRepo.listActiveSymbols.mockResolvedValue(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);

    const result = await syncCatalog();

    expect(result.skipped).toBe(true);
    expect(mockSymbolRepo.upsertMany).not.toHaveBeenCalled();
    expect(mockSymbolRepo.markInvalid).not.toHaveBeenCalled();
    expect(mockJobStateRepo.setCatalogSyncedAt).not.toHaveBeenCalled();
  });

  it('deslistado: marca invalid_at y crea una tarjeta por alerta activa', async () => {
    mockBinance.getExchangeInfo.mockResolvedValue([contract('BTCUSDT'), contract('ETHUSDT')]);
    mockSymbolRepo.listActiveSymbols.mockResolvedValue(['BTCUSDT', 'ETHUSDT', 'GONEUSDT']);
    mockAlertRepo.findActiveBySymbolsForUpdate.mockResolvedValue([
      { id: 7, user_id: 1, symbol: 'GONEUSDT', direction: 'above', target_price: 2, note_id: 3, block_id: 9 },
      { id: 8, user_id: 2, symbol: 'GONEUSDT', direction: 'below', target_price: 1, note_id: 4, block_id: null },
    ]);

    const result = await syncCatalog();

    expect(result.delisted).toBe(1);
    expect(mockSymbolRepo.markInvalid).toHaveBeenCalledWith(['GONEUSDT'], mockClient);
    expect(mockNotificationRepo.insert).toHaveBeenCalledTimes(2);
    const card = mockNotificationRepo.insert.mock.calls[0][0];
    expect(card).toMatchObject({ userId: 1, type: 'price_alert_delisted', priceAlertId: 7 });
    expect(card.payload.candle_open_time).toBeNull();
    expect(card.payload.candle_value).toBeNull();
  });

  it('re-listado: el upsert recibe el símbolo y no se marca como deslistado', async () => {
    mockBinance.getExchangeInfo.mockResolvedValue([contract('BTCUSDT'), contract('BACKUSDT')]);
    // BACKUSDT tenía invalid_at: no está entre los vigentes
    mockSymbolRepo.listActiveSymbols.mockResolvedValue(['BTCUSDT']);

    await syncCatalog();

    expect(mockSymbolRepo.upsertMany.mock.calls[0][0].map((c) => c.symbol)).toContain('BACKUSDT');
    expect(mockSymbolRepo.markInvalid).not.toHaveBeenCalled();
  });

  it('BinanceBackoffError: persiste backoff_until y propaga', async () => {
    const retryAfter = new Date(Date.now() + 60_000);
    mockBinance.getExchangeInfo.mockRejectedValue(new BinanceBackoffError(retryAfter));

    await expect(syncCatalog()).rejects.toBeInstanceOf(BinanceBackoffError);
    expect(mockJobStateRepo.setBackoffUntil).toHaveBeenCalledWith(retryAfter);
  });
});

describe('getPrice (caché de 60 s)', () => {
  beforeEach(() => {
    resetPriceCache();
    jest.useRealTimers();
  });

  it('dos llamadas concurrentes generan una sola petición a Binance', async () => {
    let resolve;
    mockBinance.getAllPrices.mockReturnValue(new Promise((r) => (resolve = r)));

    const a = getPrice('BTCUSDT');
    const b = getPrice('ETHUSDT');
    resolve(
      new Map([
        ['BTCUSDT', { price: 92000, time: 1700000000000 }],
        ['ETHUSDT', { price: 3100, time: 1700000000000 }],
      ])
    );

    expect((await a).price).toBe(92000);
    expect((await b).price).toBe(3100);
    expect(mockBinance.getAllPrices).toHaveBeenCalledTimes(1);
  });

  it('dentro del TTL no vuelve a pedir; pasado el TTL sí', async () => {
    jest.useFakeTimers({ now: new Date('2027-03-01T10:00:00Z') });
    mockBinance.getAllPrices.mockResolvedValue(new Map([['BTCUSDT', { price: 92000, time: 0 }]]));

    await getPrice('BTCUSDT');
    jest.setSystemTime(new Date(Date.now() + CACHE_TTL_MS - 1000));
    await getPrice('BTCUSDT');
    expect(mockBinance.getAllPrices).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date(Date.now() + 2000));
    await getPrice('BTCUSDT');
    expect(mockBinance.getAllPrices).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('con el breaker abierto usa el last_price del catálogo', async () => {
    mockBinance.getBackoffUntil.mockReturnValue(new Date(Date.now() + 60_000));
    mockSymbolRepo.findBySymbol.mockResolvedValue({ last_price: 91000, last_price_at: '2027-03-01T09:30:00Z' });

    const result = await getPrice('BTCUSDT');

    expect(mockBinance.getAllPrices).not.toHaveBeenCalled();
    expect(result).toEqual({ price: 91000, as_of: '2027-03-01T09:30:00.000Z' });
  });

  it('con el peso por encima del umbral no llama a Binance', async () => {
    mockBinance.getUsedWeight.mockReturnValue(5000);
    mockSymbolRepo.findBySymbol.mockResolvedValue(null);

    expect(await getPrice('BTCUSDT')).toEqual({ price: null });
    expect(mockBinance.getAllPrices).not.toHaveBeenCalled();
  });

  it('si la llamada falla devuelve el último precio cacheado', async () => {
    jest.useFakeTimers({ now: new Date('2027-03-01T10:00:00Z') });
    mockBinance.getAllPrices.mockResolvedValueOnce(new Map([['BTCUSDT', { price: 92000, time: 0 }]]));
    await getPrice('BTCUSDT');

    jest.setSystemTime(new Date(Date.now() + CACHE_TTL_MS + 1000));
    mockBinance.getAllPrices.mockRejectedValueOnce(new Error('timeout'));
    const result = await getPrice('BTCUSDT');

    expect(result.price).toBe(92000);
    expect(mockSymbolRepo.findBySymbol).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('un 429 persiste el backoff', async () => {
    const retryAfter = new Date(Date.now() + 30_000);
    mockBinance.getAllPrices.mockRejectedValue(new BinanceBackoffError(retryAfter));
    mockJobStateRepo.setBackoffUntil.mockResolvedValue();
    mockSymbolRepo.findBySymbol.mockResolvedValue(null);

    expect(await getPrice('BTCUSDT')).toEqual({ price: null });
    expect(mockJobStateRepo.setBackoffUntil).toHaveBeenCalledWith(retryAfter);
  });
});

describe('payload de las tarjetas', () => {
  it('quita el markdown, las directivas ::: y deja el texto de los links', () => {
    const md = '## Escenario\n\n:::more[Detalle]\n- **soporte** en [74k](https://x.y)\n- `60k`\n:::\n> cita';
    expect(stripMarkdown(md)).toBe('Escenario Detalle soporte en 74k 60k cita');
  });

  it('corta el extracto a ~280 caracteres en un límite de palabra', () => {
    const excerpt = buildExcerpt('palabra '.repeat(100));
    expect(excerpt.length).toBeLessThanOrEqual(281);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt).not.toMatch(/\s…$/);
  });

  it('contenido vacío → null', () => {
    expect(buildExcerpt('')).toBeNull();
    expect(buildExcerpt(null)).toBeNull();
  });

  it('arma la foto de §3.6 con sibling_alerts solo si se pasan', () => {
    const alert = {
      symbol: 'BTCUSDT',
      contract_type: 'PERPETUAL',
      direction: 'above',
      target_price: 110000,
      is_invalidation: true,
      near_pct: 3,
      price_at_creation: 92350.12,
      armed_at: '2026-11-20T15:42:00Z',
      deadline_at: null,
      message: 'invalidación',
      note_id: 123,
      note_title: 'Análisis macro BTC 2026',
      block_id: 456,
      anchor_content: 'Si pierde el **soporte** semanal de 74k',
    };
    const candle = { openTime: Date.parse('2027-03-04T23:00:00Z'), high: 1, low: 1, close: 110600 };

    const payload = buildPriceAlertPayload({
      alert,
      candle,
      candleValue: 110600,
      lastPrice: 110480,
      siblings: [{ id: 88, symbol: 'BTCUSDT', direction: 'below', target_price: 60000, is_invalidation: false }],
    });

    expect(payload).toMatchObject({
      symbol: 'BTCUSDT',
      target_price: 110000,
      candle_open_time: '2027-03-04T23:00:00.000Z',
      candle_value: 110600,
      last_price: 110480,
      note_id: 123,
      block_id: 456,
      block_excerpt: 'Si pierde el soporte semanal de 74k',
    });
    expect(payload.sibling_alerts).toHaveLength(1);
    expect(buildPriceAlertPayload({ alert }).sibling_alerts).toBeUndefined();
  });
});
