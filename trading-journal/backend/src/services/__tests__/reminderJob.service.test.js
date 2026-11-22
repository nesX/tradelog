import { jest } from '@jest/globals';

/**
 * Tick del job de recordatorios con pool, repositorios y cliente de Binance
 * mockeados. `pauseMs: 0` para no esperar 1 s entre peticiones.
 */

class BinanceBackoffError extends Error {
  constructor(retryAfter) {
    super('backoff');
    this.retryAfter = retryAfter;
  }
}
class BinanceInvalidSymbolError extends Error {}

const HOUR = 3_600_000;

const mockBinance = {
  getHourlyKlines: jest.fn(),
  getUsedWeight: jest.fn(() => 10),
  setBackoffUntil: jest.fn(),
  BinanceBackoffError,
  BinanceInvalidSymbolError,
};
const mockSymbolRepo = { findWatched: jest.fn(), updateCheckpoint: jest.fn() };
const mockAlertRepo = {
  findActiveBySymbolsForUpdate: jest.fn(),
  findDueDeadlinesForUpdate: jest.fn(),
  findActiveByAnchor: jest.fn(),
  markTriggered: jest.fn(),
  markNear: jest.fn(),
  clearDeadline: jest.fn(),
};
const mockReminderRepo = { findDueForUpdate: jest.fn(), markSent: jest.fn() };
const mockNotificationRepo = { insert: jest.fn() };
const mockJobStateRepo = { get: jest.fn(), setLastRunAt: jest.fn(), setBackoffUntil: jest.fn() };
const mockCatalog = { syncCatalog: jest.fn(), delistSymbols: jest.fn() };
const mockLockClient = { query: jest.fn(), release: jest.fn() };
const mockTxClient = { query: jest.fn() };

jest.unstable_mockModule('../../clients/binanceFutures.js', () => mockBinance);
jest.unstable_mockModule('../../repositories/marketSymbol.repository.js', () => mockSymbolRepo);
jest.unstable_mockModule('../../repositories/priceAlert.repository.js', () => mockAlertRepo);
jest.unstable_mockModule('../../repositories/dateReminder.repository.js', () => mockReminderRepo);
jest.unstable_mockModule('../../repositories/notification.repository.js', () => mockNotificationRepo);
jest.unstable_mockModule('../../repositories/reminderJobState.repository.js', () => mockJobStateRepo);
jest.unstable_mockModule('../marketSymbol.service.js', () => mockCatalog);
jest.unstable_mockModule('../../config/database.js', () => ({
  getClient: async () => mockLockClient,
  withTransaction: (fn) => fn(mockTxClient),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { runTick, computeFirstDelay } = await import('../reminderJob.service.js');

const floorHour = (ms) => Math.floor(ms / HOUR) * HOUR;
const symbol = (name, checkedUntil = new Date(floorHour(Date.now()) - HOUR)) => ({
  symbol: name,
  checked_until: checkedUntil,
});
const candlesFrom = (startMs, count, values = {}) =>
  Array.from({ length: count }, (_, i) => ({
    openTime: startMs + i * HOUR,
    high: values.high ?? 100,
    low: values.low ?? 100,
    close: values.close ?? 100,
  }));

beforeEach(() => {
  jest.clearAllMocks();
  mockLockClient.query.mockImplementation(async (sql) =>
    sql.includes('pg_try_advisory_lock') ? { rows: [{ locked: true }] } : { rows: [] }
  );
  mockJobStateRepo.get.mockResolvedValue({
    last_run_at: null,
    catalog_synced_at: new Date(), // catálogo al día: no se sincroniza
    backoff_until: null,
  });
  mockReminderRepo.findDueForUpdate.mockResolvedValue([]);
  mockAlertRepo.findDueDeadlinesForUpdate.mockResolvedValue([]);
  mockAlertRepo.findActiveBySymbolsForUpdate.mockResolvedValue([]);
  mockAlertRepo.findActiveByAnchor.mockResolvedValue([]);
  mockSymbolRepo.findWatched.mockResolvedValue([]);
  mockBinance.getUsedWeight.mockReturnValue(10);
  mockBinance.getHourlyKlines.mockImplementation(async (_s, from) => candlesFrom(from, 2));
});

describe('runTick', () => {
  it('sin el advisory lock no hace nada', async () => {
    mockLockClient.query.mockResolvedValue({ rows: [{ locked: false }] });

    expect(await runTick({ pauseMs: 0 })).toEqual({ skipped: true });
    expect(mockJobStateRepo.setLastRunAt).not.toHaveBeenCalled();
    expect(mockLockClient.release).toHaveBeenCalled();
  });

  it('usa la forma de dos enteros del advisory lock y lo libera', async () => {
    await runTick({ pauseMs: 0 });

    const sqls = mockLockClient.query.mock.calls.map(([sql]) => sql);
    expect(sqls[0]).toMatch(/pg_try_advisory_lock\(\$1::int, 0\)/);
    expect(sqls.some((s) => /pg_advisory_unlock\(\$1::int, 0\)/.test(s))).toBe(true);
    expect(mockLockClient.release).toHaveBeenCalled();
  });

  it('sin alertas activas no pide velas', async () => {
    const summary = await runTick({ pauseMs: 0 });

    expect(mockBinance.getHourlyKlines).not.toHaveBeenCalled();
    expect(mockJobStateRepo.setLastRunAt).toHaveBeenCalled();
    expect(summary.symbols).toBe(0);
  });

  it('con backoff vigente envía recordatorios y fechas límite, pero no llama a Binance', async () => {
    mockJobStateRepo.get.mockResolvedValue({ backoff_until: new Date(Date.now() + 60_000) });
    mockReminderRepo.findDueForUpdate.mockResolvedValue([
      { id: 1, user_id: 1, remind_at: '2027-03-01T13:00:00Z', note_id: 10, block_id: null },
    ]);
    mockAlertRepo.findDueDeadlinesForUpdate.mockResolvedValue([
      { id: 2, user_id: 1, symbol: 'BTCUSDT', direction: 'below', target_price: 60000, note_id: 10, block_id: 20 },
    ]);
    mockSymbolRepo.findWatched.mockResolvedValue([symbol('BTCUSDT')]);

    const summary = await runTick({ pauseMs: 0 });

    expect(summary).toMatchObject({ dateReminders: 1, deadlines: 1 });
    expect(mockReminderRepo.markSent).toHaveBeenCalledWith(1, mockTxClient);
    expect(mockAlertRepo.clearDeadline).toHaveBeenCalledWith(2, mockTxClient);
    const types = mockNotificationRepo.insert.mock.calls.map(([n]) => n.type);
    expect(types).toEqual(['date_reminder_due', 'price_alert_deadline']);
    expect(mockCatalog.syncCatalog).not.toHaveBeenCalled();
    expect(mockSymbolRepo.findWatched).not.toHaveBeenCalled();
    expect(mockBinance.getHourlyKlines).not.toHaveBeenCalled();
  });

  it('sincroniza el catálogo si el último sync tiene más de 24 h', async () => {
    mockJobStateRepo.get.mockResolvedValue({ catalog_synced_at: new Date(Date.now() - 25 * HOUR) });
    await runTick({ pauseMs: 0 });
    expect(mockCatalog.syncCatalog).toHaveBeenCalledTimes(1);
  });

  it('un disparo marca la alerta, crea la tarjeta y avanza el checkpoint', async () => {
    const start = floorHour(Date.now()) - HOUR;
    mockSymbolRepo.findWatched.mockResolvedValue([symbol('BTCUSDT', new Date(start))]);
    mockBinance.getHourlyKlines.mockResolvedValue([
      { openTime: start, high: 100, low: 59000, close: 61000 },
      { openTime: start + HOUR, high: 62000, low: 60500, close: 61500 },
    ]);
    mockAlertRepo.findActiveBySymbolsForUpdate.mockResolvedValue([
      {
        id: 5,
        user_id: 1,
        symbol: 'BTCUSDT',
        direction: 'below',
        target_price: 60000,
        is_invalidation: false,
        near_pct: 3,
        near_at: null,
        armed_at: new Date(start - 10 * HOUR),
        note_id: 10,
        block_id: 20,
      },
    ]);

    const summary = await runTick({ pauseMs: 0 });

    expect(summary.cards).toBe(1);
    expect(mockAlertRepo.markTriggered).toHaveBeenCalledWith(5, new Date(start), mockTxClient);
    const card = mockNotificationRepo.insert.mock.calls[0][0];
    expect(card).toMatchObject({ type: 'price_alert_hit', priceAlertId: 5, userId: 1 });
    expect(card.payload).toMatchObject({ candle_value: 59000, last_price: 61500 });
    expect(mockSymbolRepo.updateCheckpoint).toHaveBeenCalledWith(
      'BTCUSDT',
      { checkedUntil: new Date(start + HOUR), lastPrice: 61500 },
      mockTxClient
    );
  });

  it('pide las velas desde checked_until con limit = horas transcurridas + 1', async () => {
    const start = floorHour(Date.now()) - 8 * HOUR;
    mockSymbolRepo.findWatched.mockResolvedValue([symbol('BTCUSDT', new Date(start))]);

    await runTick({ pauseMs: 0 });

    expect(mockBinance.getHourlyKlines).toHaveBeenCalledWith('BTCUSDT', start, 9);
  });

  it('con el peso por encima del umbral tras el primer símbolo, el segundo no se pide', async () => {
    mockSymbolRepo.findWatched.mockResolvedValue([symbol('BTCUSDT'), symbol('ETHUSDT')]);
    mockBinance.getUsedWeight.mockReturnValue(5000);

    const summary = await runTick({ pauseMs: 0 });

    expect(mockBinance.getHourlyKlines).toHaveBeenCalledTimes(1);
    expect(mockSymbolRepo.updateCheckpoint).toHaveBeenCalledTimes(1); // procesa lo ya leído
    expect(summary.symbols).toBe(1);
  });

  it('BinanceInvalidSymbolError en A → A se deslista y B se procesa', async () => {
    mockSymbolRepo.findWatched.mockResolvedValue([symbol('AAAUSDT'), symbol('BBBUSDT')]);
    mockBinance.getHourlyKlines.mockImplementation(async (s, from) => {
      if (s === 'AAAUSDT') throw new BinanceInvalidSymbolError('AAAUSDT');
      return candlesFrom(from, 2);
    });

    await runTick({ pauseMs: 0 });

    expect(mockCatalog.delistSymbols).toHaveBeenCalledWith(['AAAUSDT']);
    expect(mockSymbolRepo.updateCheckpoint).toHaveBeenCalledWith('BBBUSDT', expect.anything(), mockTxClient);
  });

  it('error de red en A → B se procesa y el checkpoint de A no cambia', async () => {
    mockSymbolRepo.findWatched.mockResolvedValue([symbol('AAAUSDT'), symbol('BBBUSDT')]);
    mockBinance.getHourlyKlines.mockImplementation(async (s, from) => {
      if (s === 'AAAUSDT') throw new Error('fetch failed');
      return candlesFrom(from, 2);
    });

    const summary = await runTick({ pauseMs: 0 });

    const updated = mockSymbolRepo.updateCheckpoint.mock.calls.map(([s]) => s);
    expect(updated).toEqual(['BBBUSDT']);
    expect(summary.errors).toBe(1);
  });

  it('BinanceBackoffError persiste backoff_until y corta el tick', async () => {
    const retryAfter = new Date(Date.now() + 120_000);
    mockSymbolRepo.findWatched.mockResolvedValue([symbol('AAAUSDT'), symbol('BBBUSDT')]);
    mockBinance.getHourlyKlines.mockRejectedValue(new BinanceBackoffError(retryAfter));

    await runTick({ pauseMs: 0 });

    expect(mockJobStateRepo.setBackoffUntil).toHaveBeenCalledWith(retryAfter);
    expect(mockBinance.getHourlyKlines).toHaveBeenCalledTimes(1);
  });

  it('un hueco de más de 1000 h pagina desde la última vela + 1 h', async () => {
    const start = floorHour(Date.now()) - 1500 * HOUR;
    mockSymbolRepo.findWatched.mockResolvedValue([symbol('BTCUSDT', new Date(start))]);
    mockBinance.getHourlyKlines.mockImplementation(async (_s, from, limit) => candlesFrom(from, limit));

    await runTick({ pauseMs: 0 });

    const calls = mockBinance.getHourlyKlines.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(['BTCUSDT', start, 1000]);
    expect(calls[1][1]).toBe(start + 1000 * HOUR);
    expect(calls[1][2]).toBe(501);
    expect(mockSymbolRepo.updateCheckpoint.mock.calls[0][1].checkedUntil).toEqual(new Date(floorHour(Date.now())));
  });

  it('no avanza el checkpoint más allá de la vela abierta al pedir (cierre a mitad de petición)', async () => {
    const current = floorHour(Date.now());
    mockSymbolRepo.findWatched.mockResolvedValue([symbol('BTCUSDT', new Date(current))]);
    // La respuesta trae una vela que abrió después de `nowMs`
    mockBinance.getHourlyKlines.mockResolvedValue(candlesFrom(current, 2));

    await runTick({ pauseMs: 0 });

    expect(mockSymbolRepo.updateCheckpoint.mock.calls[0][1].checkedUntil).toEqual(new Date(current));
  });
});

describe('computeFirstDelay', () => {
  const interval = 30 * 60_000;
  const now = Date.parse('2027-03-01T10:00:00Z');

  it('último tick hace 10 min → espera 20', () => {
    expect(computeFirstDelay(new Date(now - 10 * 60_000), interval, now)).toBe(20 * 60_000);
  });

  it('último tick hace 2 h → 1 min', () => {
    expect(computeFirstDelay(new Date(now - 2 * HOUR), interval, now)).toBe(60_000);
  });

  it('sin last_run_at → 1 min', () => {
    expect(computeFirstDelay(null, interval, now)).toBe(60_000);
  });
});
