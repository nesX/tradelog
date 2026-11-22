import { jest } from '@jest/globals';

/**
 * Test del cliente de Binance Futures con `fetch` mockeado: ninguna petición
 * sale a la red.
 */

const {
  getHourlyKlines,
  getExchangeInfo,
  getAllPrices,
  getUsedWeight,
  setBackoffUntil,
  getBackoffUntil,
  BinanceBackoffError,
  BinanceInvalidSymbolError,
} = await import('../binanceFutures.js');

const jsonResponse = (body, { status = 200, headers = {} } = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

beforeEach(() => {
  global.fetch = jest.fn();
  setBackoffUntil(null);
});

describe('binanceFutures client', () => {
  it('convierte las klines a objetos numéricos y guarda el peso usado', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse(
        [[1700000000000, '100.0', '110.5', '95.25', '105.75', '12', 1700003599999, '0', 1, '0', '0', '0']],
        { headers: { 'x-mbx-used-weight-1m': '37' } }
      )
    );

    const candles = await getHourlyKlines('BTCUSDT', 1700000000000, 1);

    expect(candles).toEqual([{ openTime: 1700000000000, high: 110.5, low: 95.25, close: 105.75 }]);
    expect(getUsedWeight()).toBe(37);
    const url = global.fetch.mock.calls[0][0];
    expect(url).toBe(
      'https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1h&startTime=1700000000000&limit=1'
    );
    expect(global.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('429 con Retry-After abre el breaker y la llamada siguiente no toca la red', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({ code: -1003, msg: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '30' } })
    );

    const before = Date.now();
    const err = await getHourlyKlines('BTCUSDT', 0, 1).catch((e) => e);

    expect(err).toBeInstanceOf(BinanceBackoffError);
    const delta = err.retryAfter.getTime() - before;
    expect(delta).toBeGreaterThanOrEqual(30_000);
    expect(delta).toBeLessThan(31_000);

    await expect(getAllPrices()).rejects.toBeInstanceOf(BinanceBackoffError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('429 sin Retry-After espera 60 s', async () => {
    global.fetch.mockResolvedValue(jsonResponse({}, { status: 429 }));
    const before = Date.now();
    const err = await getExchangeInfo().catch((e) => e);
    const delta = err.retryAfter.getTime() - before;
    expect(delta).toBeGreaterThanOrEqual(60_000);
    expect(delta).toBeLessThan(61_000);
  });

  it('418 sin Retry-After espera 5 min', async () => {
    global.fetch.mockResolvedValue(jsonResponse({}, { status: 418 }));
    const before = Date.now();
    const err = await getExchangeInfo().catch((e) => e);
    expect(err).toBeInstanceOf(BinanceBackoffError);
    const delta = err.retryAfter.getTime() - before;
    expect(delta).toBeGreaterThanOrEqual(300_000);
    expect(delta).toBeLessThan(301_000);
  });

  it('400 con código -1121 lanza BinanceInvalidSymbolError', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ code: -1121, msg: 'Invalid symbol.' }, { status: 400 }));
    const err = await getHourlyKlines('NOPEUSDT', 0, 1).catch((e) => e);
    expect(err).toBeInstanceOf(BinanceInvalidSymbolError);
    expect(err.symbol).toBe('NOPEUSDT');
  });

  it('otro 400 lanza un error genérico con el status', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ code: -1100, msg: 'Illegal characters' }, { status: 400 }));
    const err = await getHourlyKlines('BTCUSDT', 0, 1).catch((e) => e);
    expect(err).not.toBeInstanceOf(BinanceInvalidSymbolError);
    expect(err).not.toBeInstanceOf(BinanceBackoffError);
    expect(err.status).toBe(400);
  });

  it('setBackoffUntil en el futuro bloquea; en el pasado no', async () => {
    setBackoffUntil(new Date(Date.now() + 60_000));
    await expect(getAllPrices()).rejects.toBeInstanceOf(BinanceBackoffError);
    expect(global.fetch).not.toHaveBeenCalled();

    setBackoffUntil(new Date(Date.now() - 1000));
    expect(getBackoffUntil()).toBeNull();
    global.fetch.mockResolvedValue(jsonResponse([{ symbol: 'BTCUSDT', price: '92350.12', time: 1700000000000 }]));
    const prices = await getAllPrices();
    expect(prices.get('BTCUSDT')).toEqual({ price: 92350.12, time: 1700000000000 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('getExchangeInfo toma el tickSize de PRICE_FILTER', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({
        symbols: [
          {
            symbol: 'XAUUSDT',
            contractType: 'TRADIFI_PERPETUAL',
            status: 'TRADING',
            baseAsset: 'XAU',
            quoteAsset: 'USDT',
            pricePrecision: 2,
            filters: [
              { filterType: 'LOT_SIZE', stepSize: '0.001' },
              { filterType: 'PRICE_FILTER', tickSize: '0.01', minPrice: '0.01' },
            ],
          },
        ],
      })
    );

    const contracts = await getExchangeInfo();

    expect(contracts).toEqual([
      {
        symbol: 'XAUUSDT',
        contractType: 'TRADIFI_PERPETUAL',
        status: 'TRADING',
        baseAsset: 'XAU',
        quoteAsset: 'USDT',
        tickSize: '0.01',
      },
    ]);
  });
});
