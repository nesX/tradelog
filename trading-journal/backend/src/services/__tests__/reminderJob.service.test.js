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
const mockPushService = { notifyNew: jest.fn() };
const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockLockClient = { query: jest.fn(), release: jest.fn() };
const mockTxClient = { query: jest.fn() };

jest.unstable_mockModule('../../clients/binanceFutures.js', () => mockBinance);
jest.unstable_mockModule('../../repositories/marketSymbol.repository.js', () => mockSymbolRepo);
jest.unstable_mockModule('../../repositories/priceAlert.repository.js', () => mockAlertRepo);
jest.unstable_mockModule('../../repositories/dateReminder.repository.js', () => mockReminderRepo);
jest.unstable_mockModule('../../repositories/notification.repository.js', () => mockNotificationRepo);
jest.unstable_mockModule('../../repositories/reminderJobState.repository.js', () => mockJobStateRepo);
jest.unstable_mockModule('../marketSymbol.service.js', () => mockCatalog);
jest.unstable_mockModule('../push.service.js', () => mockPushService);
jest.unstable_mockModule('../../config/database.js', () => ({
  getClient: async () => mockLockClient,
  withTransaction: (fn) => fn(mockTxClient),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({ logger: mockLogger }));

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
// Alerta `below` 60,000 sin aviso previo, armada mucho antes de las velas del test
const priceAlert = (overrides = {}) => ({
  id: 5,
  user_id: 1,
  symbol: 'BTCUSDT',
  direction: 'below',
  target_price: 60000,
  is_invalidation: false,
  near_pct: null,
  near_at: null,
  armed_at: new Date(floorHour(Date.now()) - 48 * HOUR),
  deadline_at: null,
  note_id: 10,
  block_id: 20,
  ...overrides,
});
const cardTypes = () => mockNotificationRepo.insert.mock.calls.map(([n]) => n.type);

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
  mockPushService.notifyNew.mockResolvedValue({ sent: 0, failed: 0, removed: 0 });
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

  it('con backoff vigente envía recordatorios y fechas límite de deslistados, pero no llama a Binance', async () => {
    mockJobStateRepo.get.mockResolvedValue({ backoff_until: new Date(Date.now() + 60_000) });
    mockReminderRepo.findDueForUpdate.mockResolvedValue([
      { id: 1, user_id: 1, remind_at: '2027-03-01T13:00:00Z', note_id: 10, block_id: null },
    ]);
    // El paso 4 solo devuelve alertas de símbolos deslistados
    mockAlertRepo.findDueDeadlinesForUpdate.mockResolvedValue([
      priceAlert({ id: 2, symbol: 'OLDUSDT', deadline_at: new Date(Date.now() - HOUR), symbol_invalid_at: new Date() }),
    ]);
    // La fecha límite vencida de un símbolo válido espera a que se lean sus velas
    mockSymbolRepo.findWatched.mockResolvedValue([symbol('BTCUSDT')]);
    mockAlertRepo.findActiveBySymbolsForUpdate.mockResolvedValue([
      priceAlert({ id: 3, deadline_at: new Date(Date.now() - HOUR) }),
    ]);

    const summary = await runTick({ pauseMs: 0 });

    expect(summary).toMatchObject({ dateReminders: 1, deadlines: 1 });
    expect(mockReminderRepo.markSent).toHaveBeenCalledWith(1, mockTxClient);
    expect(mockAlertRepo.clearDeadline.mock.calls).toEqual([[2, mockTxClient]]);
    expect(cardTypes()).toEqual(['date_reminder_due', 'price_alert_deadline']);
    expect(mockCatalog.syncCatalog).not.toHaveBeenCalled();
    expect(mockSymbolRepo.findWatched).not.toHaveBeenCalled();
    expect(mockAlertRepo.findActiveBySymbolsForUpdate).not.toHaveBeenCalled();
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

describe('runTick: avisos push', () => {
  it('avisa al final del tick, después de crear las tarjetas, y lo anota en el resumen', async () => {
    mockReminderRepo.findDueForUpdate.mockResolvedValue([
      { id: 1, user_id: 1, remind_at: '2027-03-01T13:00:00Z', note_id: 10, block_id: null },
    ]);
    mockPushService.notifyNew.mockResolvedValue({ sent: 1, failed: 0, removed: 0 });

    const summary = await runTick({ pauseMs: 0 });

    expect(mockPushService.notifyNew).toHaveBeenCalledTimes(1);
    const [insertedAt] = mockNotificationRepo.insert.mock.invocationCallOrder;
    expect(mockPushService.notifyNew.mock.invocationCallOrder[0]).toBeGreaterThan(insertedAt);
    expect(summary.push).toEqual({ sent: 1, failed: 0, removed: 0 });
  });

  it('sin el advisory lock no avisa', async () => {
    mockLockClient.query.mockResolvedValue({ rows: [{ locked: false }] });

    await runTick({ pauseMs: 0 });

    expect(mockPushService.notifyNew).not.toHaveBeenCalled();
  });

  it('con backoff vigente avisa de lo que sí se creó', async () => {
    mockJobStateRepo.get.mockResolvedValue({ backoff_until: new Date(Date.now() + 60_000) });

    const summary = await runTick({ pauseMs: 0 });

    expect(mockPushService.notifyNew).toHaveBeenCalledTimes(1);
    expect(summary.push).toBeDefined();
  });

  it('cuando Binance corta el tick por backoff, avisa igual', async () => {
    mockSymbolRepo.findWatched.mockResolvedValue([symbol('AAAUSDT')]);
    mockBinance.getHourlyKlines.mockRejectedValue(new BinanceBackoffError(new Date(Date.now() + 60_000)));

    await runTick({ pauseMs: 0 });

    expect(mockPushService.notifyNew).toHaveBeenCalledTimes(1);
  });

  it('si el tick falla a mitad, avisa igual y el error se propaga', async () => {
    mockReminderRepo.findDueForUpdate.mockRejectedValue(new Error('BD caída'));

    await expect(runTick({ pauseMs: 0 })).rejects.toThrow('BD caída');
    expect(mockPushService.notifyNew).toHaveBeenCalledTimes(1);
    expect(mockLockClient.release).toHaveBeenCalled();
  });

  it('el log del tick pasa a info si se envió o falló algún aviso', async () => {
    await runTick({ pauseMs: 0 });
    expect(mockLogger.debug).toHaveBeenCalledWith('Recordatorios: tick', expect.anything());

    mockPushService.notifyNew.mockResolvedValue({ sent: 0, failed: 2, removed: 0 });
    await runTick({ pauseMs: 0 });
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Recordatorios: tick',
      expect.objectContaining({ push: { sent: 0, failed: 2, removed: 0 } })
    );
  });
});

describe('runTick: fecha límite evaluada con las velas', () => {
  // `base` hace de las 08:00: ahora son las 12:xx, la vela de las 12:00 está abierta
  // y el checkpoint se queda atrasado en las 08:00. Velas sin toque de 60,000.
  let base;
  const at = (hours) => base + hours * HOUR;
  const withCandles = (candles) => {
    mockSymbolRepo.findWatched.mockResolvedValue([symbol('BTCUSDT', new Date(candles[0].openTime))]);
    mockBinance.getHourlyKlines.mockResolvedValue(candles);
  };
  const quietCandles = () => candlesFrom(base, 5, { high: 71000, low: 70000, close: 70500 });

  beforeEach(() => {
    base = floorHour(Date.now()) - 4 * HOUR;
  });

  it.each([
    ['toque en la vela de las 09:00, fecha límite 10:00', 1, 2],
    ['toque en la vela que contiene la fecha límite (10:30)', 2, 2.5],
  ])('%s → solo price_alert_hit', async (_name, touchHour, deadlineHour) => {
    const candles = quietCandles();
    candles[touchHour].low = 59500;
    withCandles(candles);
    mockAlertRepo.findActiveBySymbolsForUpdate.mockResolvedValue([
      priceAlert({ deadline_at: new Date(at(deadlineHour)) }),
    ]);

    const summary = await runTick({ pauseMs: 0 });

    expect(cardTypes()).toEqual(['price_alert_hit']);
    expect(mockAlertRepo.markTriggered).toHaveBeenCalledWith(5, new Date(at(touchHour)), mockTxClient);
    expect(mockAlertRepo.clearDeadline).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ cards: 1, deadlines: 0 });
  });

  it('sin toque y con la vela de la fecha límite cerrada → fecha límite y la alerta sigue activa', async () => {
    withCandles(quietCandles());
    mockAlertRepo.findActiveBySymbolsForUpdate.mockResolvedValue([priceAlert({ deadline_at: new Date(at(2)) })]);

    const summary = await runTick({ pauseMs: 0 });

    expect(cardTypes()).toEqual(['price_alert_deadline']);
    const card = mockNotificationRepo.insert.mock.calls[0][0];
    expect(card).toMatchObject({ priceAlertId: 5, userId: 1 });
    expect(card.payload).toMatchObject({
      deadline_at: new Date(at(2)).toISOString(),
      candle_open_time: null,
      candle_value: null,
    });
    expect(mockAlertRepo.clearDeadline).toHaveBeenCalledWith(5, mockTxClient);
    expect(mockAlertRepo.markTriggered).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ cards: 0, deadlines: 1 });
  });

  it('sin toque, con la vela de la fecha límite cerrada y cercanía → fecha límite y cercanía', async () => {
    const candles = quietCandles();
    candles[3].low = 61500; // dentro del 3% (61,800)
    withCandles(candles);
    mockAlertRepo.findActiveBySymbolsForUpdate.mockResolvedValue([
      priceAlert({ near_pct: 3, deadline_at: new Date(at(2)) }),
    ]);

    const summary = await runTick({ pauseMs: 0 });

    expect(cardTypes()).toEqual(['price_alert_deadline', 'price_alert_near']);
    expect(mockAlertRepo.clearDeadline).toHaveBeenCalledWith(5, mockTxClient);
    expect(mockAlertRepo.markNear).toHaveBeenCalledWith(5, mockTxClient);
    expect(mockAlertRepo.markTriggered).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ cards: 1, deadlines: 1 });
  });

  it('toque en una vela posterior a la fecha límite → fecha límite y después el toque', async () => {
    const candles = quietCandles();
    candles[3].low = 59500; // vela de las 11:00
    withCandles(candles);
    mockAlertRepo.findActiveBySymbolsForUpdate.mockResolvedValue([priceAlert({ deadline_at: new Date(at(2)) })]);

    const summary = await runTick({ pauseMs: 0 });

    expect(cardTypes()).toEqual(['price_alert_deadline', 'price_alert_hit']);
    const [[deadlineCard], [hitCard]] = mockNotificationRepo.insert.mock.calls;
    expect(deadlineCard.payload.deadline_at).toBe(new Date(at(2)).toISOString());
    expect(hitCard.payload).toMatchObject({ deadline_at: null, candle_open_time: new Date(at(3)).toISOString() });
    expect(mockAlertRepo.clearDeadline).toHaveBeenCalledWith(5, mockTxClient);
    expect(mockAlertRepo.markTriggered).toHaveBeenCalledWith(5, new Date(at(3)), mockTxClient);
    expect(summary).toMatchObject({ cards: 1, deadlines: 1 });
  });

  it('fecha límite en punto y toque en la vela abierta que empieza en ella → las dos tarjetas', async () => {
    const candles = quietCandles();
    candles[4].low = 59500; // vela de las 12:00, todavía abierta
    withCandles(candles);
    mockAlertRepo.findActiveBySymbolsForUpdate.mockResolvedValue([priceAlert({ deadline_at: new Date(at(4)) })]);

    await runTick({ pauseMs: 0 });

    // El checkpoint (12:00) no pasa la fecha límite, pero las velas anteriores
    // ya se evaluaron sin toque: no se tocó antes de las 12:00.
    expect(mockSymbolRepo.updateCheckpoint.mock.calls[0][1].checkedUntil).toEqual(new Date(at(4)));
    expect(cardTypes()).toEqual(['price_alert_deadline', 'price_alert_hit']);
  });

  it('fecha límite dentro de la vela todavía abierta y sin toque → ninguna tarjeta', async () => {
    withCandles(quietCandles());
    // Las 12:00: ya pasó según NOW(), pero la vela que la contiene no ha cerrado
    mockAlertRepo.findActiveBySymbolsForUpdate.mockResolvedValue([priceAlert({ deadline_at: new Date(at(4)) })]);

    const summary = await runTick({ pauseMs: 0 });

    expect(mockNotificationRepo.insert).not.toHaveBeenCalled();
    expect(mockAlertRepo.clearDeadline).not.toHaveBeenCalled();
    expect(mockSymbolRepo.updateCheckpoint).toHaveBeenCalledWith(
      'BTCUSDT',
      { checkedUntil: new Date(at(4)), lastPrice: 70500 },
      mockTxClient
    );
    expect(summary).toMatchObject({ cards: 0, deadlines: 0 });
  });

  it('símbolo deslistado con la fecha límite vencida → la emite el paso 4, sin pedir velas', async () => {
    mockAlertRepo.findDueDeadlinesForUpdate.mockResolvedValue([
      priceAlert({ id: 7, symbol: 'OLDUSDT', deadline_at: new Date(at(2)), symbol_invalid_at: new Date(at(0)) }),
    ]);

    const summary = await runTick({ pauseMs: 0 });

    expect(cardTypes()).toEqual(['price_alert_deadline']);
    expect(mockNotificationRepo.insert.mock.calls[0][0]).toMatchObject({ priceAlertId: 7, userId: 1 });
    expect(mockAlertRepo.clearDeadline).toHaveBeenCalledWith(7, mockTxClient);
    expect(mockBinance.getHourlyKlines).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ cards: 0, deadlines: 1 });
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
