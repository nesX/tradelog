import { evaluateAlert, isWithinNearBand, HOUR_MS } from '../priceAlertEvaluator.js';

/**
 * Casos de §3.3 y escenarios de §3.2 de la spec de recordatorios de análisis.
 * Todas las horas en UTC.
 */

const t = (iso) => Date.parse(iso);

// Vela de 1h. Si no se dan, high/low/close quedan "neutros" alrededor de `base`.
const candle = (iso, { high, low, close, base = 100 } = {}) => ({
  openTime: t(iso),
  high: high ?? base,
  low: low ?? base,
  close: close ?? base,
});

const alert = (overrides = {}) => ({
  direction: 'above',
  target_price: 100,
  is_invalidation: false,
  near_pct: null,
  near_at: null,
  armed_at: '2027-03-01T10:20:00Z',
  ...overrides,
});

describe('evaluateAlert — recordatorio normal (toque)', () => {
  it('dispara por la mecha de una vela posterior al armado', () => {
    const candles = [
      candle('2027-03-01T10:00:00Z', { base: 95 }),
      candle('2027-03-01T11:00:00Z', { high: 100.5, low: 96, close: 97 }),
    ];

    const { hit, hitValue } = evaluateAlert(alert(), candles, t('2027-03-01T12:10:00Z'));

    expect(hit.openTime).toBe(t('2027-03-01T11:00:00Z'));
    expect(hitValue).toBe(100.5);
  });

  it('en la vela del armado ignora la mecha previa y solo mira el close', () => {
    const wickOnly = [candle('2027-03-01T10:00:00Z', { high: 105, low: 94, close: 95 })];
    expect(evaluateAlert(alert(), wickOnly, t('2027-03-01T10:40:00Z')).hit).toBeNull();

    const closeBeyond = [candle('2027-03-01T10:00:00Z', { high: 105, low: 94, close: 101 })];
    const { hit, hitValue } = evaluateAlert(alert(), closeBeyond, t('2027-03-01T10:40:00Z'));
    expect(hit.openTime).toBe(t('2027-03-01T10:00:00Z'));
    expect(hitValue).toBe(101);
  });

  it('ignora las velas que cerraron antes del armado (re-armado sobre un checkpoint viejo)', () => {
    const rearmed = alert({ armed_at: '2027-03-01T12:00:00Z' });
    const candles = [
      candle('2027-03-01T10:00:00Z', { high: 120, close: 110 }),
      candle('2027-03-01T11:00:00Z', { high: 120, close: 110 }),
      // Contiene armed_at (12:00 exacto): solo cuenta su close
      candle('2027-03-01T12:00:00Z', { high: 104, close: 98 }),
    ];

    expect(evaluateAlert(rearmed, candles, t('2027-03-01T12:30:00Z')).hit).toBeNull();
  });

  it('dirección below dispara por el low', () => {
    const below = alert({ direction: 'below', target_price: 60000 });
    const candles = [candle('2027-03-01T11:00:00Z', { high: 61000, low: 59990, close: 60500 })];
    expect(evaluateAlert(below, candles, t('2027-03-01T12:10:00Z')).hit).not.toBeNull();
  });

  it('da la cercanía sin toque', () => {
    const near = alert({ near_pct: 3 }); // banda desde 97
    const candles = [candle('2027-03-01T11:00:00Z', { high: 98, low: 95, close: 96 })];

    const result = evaluateAlert(near, candles, t('2027-03-01T12:10:00Z'));

    expect(result.near.openTime).toBe(t('2027-03-01T11:00:00Z'));
    expect(result.nearValue).toBe(98);
    expect(result.hit).toBeNull();
  });

  it('cercanía y toque en la misma vela devuelve las dos (el job emite solo el disparo)', () => {
    const near = alert({ near_pct: 3 });
    const candles = [candle('2027-03-01T11:00:00Z', { high: 101, low: 95, close: 96 })];

    const result = evaluateAlert(near, candles, t('2027-03-01T12:10:00Z'));

    expect(result.near).toBe(candles[0]);
    expect(result.hit).toBe(candles[0]);
  });

  it('con near_at ya relleno no repite la cercanía', () => {
    const near = alert({ near_pct: 3, near_at: '2027-03-01T11:30:00Z' });
    const candles = [candle('2027-03-01T11:00:00Z', { high: 98 }), candle('2027-03-01T12:00:00Z', { high: 99 })];

    expect(evaluateAlert(near, candles, t('2027-03-01T12:40:00Z')).near).toBeNull();
  });

  it('catch-up de 48 velas: el disparo es la primera vela que toca, no la última', () => {
    const below = alert({ direction: 'below', target_price: 60000, armed_at: '2027-02-20T00:00:00Z' });
    const start = t('2027-03-01T00:00:00Z');
    const candles = Array.from({ length: 48 }, (_, i) => ({
      openTime: start + i * HOUR_MS,
      high: 63000,
      low: i === 20 || i === 30 ? 59000 : 62000,
      close: 62500,
    }));

    const { hit } = evaluateAlert(below, candles, start + 48 * HOUR_MS + 10 * 60_000);

    expect(hit.openTime).toBe(start + 20 * HOUR_MS);
  });

  it('no dispara si ninguna vela cumple', () => {
    const candles = [candle('2027-03-01T11:00:00Z', { high: 99.9 })];
    expect(evaluateAlert(alert(), candles, t('2027-03-01T12:10:00Z'))).toEqual({
      near: null,
      hit: null,
      nearValue: null,
      hitValue: null,
    });
  });
});

describe('evaluateAlert — invalidación (cierre diario)', () => {
  const invalidation = (overrides = {}) =>
    alert({
      target_price: 110000,
      is_invalidation: true,
      near_pct: 3, // banda desde 106,700
      armed_at: '2027-02-20T15:42:00Z',
      ...overrides,
    });

  it('una mecha más allá con cierre diario por debajo no dispara, pero da la cercanía', () => {
    const candles = [
      candle('2027-03-03T15:00:00Z', { high: 110400, low: 108000, close: 109000 }),
      candle('2027-03-03T23:00:00Z', { high: 109500, low: 107000, close: 107800 }),
    ];

    const result = evaluateAlert(invalidation(), candles, t('2027-03-04T00:10:00Z'));

    expect(result.hit).toBeNull();
    expect(result.near.openTime).toBe(t('2027-03-03T15:00:00Z'));
    expect(result.nearValue).toBe(110400);
  });

  it('la vela de 23:00 todavía abierta con close más allá no dispara', () => {
    const candles = [candle('2027-03-04T23:00:00Z', { high: 110700, low: 109000, close: 110600 })];
    expect(evaluateAlert(invalidation(), candles, t('2027-03-04T23:10:00Z')).hit).toBeNull();
  });

  it('una vela que cierra mientras la petición viaja no cuenta (nowMs previo a la petición)', () => {
    const candles = [
      candle('2027-03-04T23:00:00Z', { high: 110700, low: 109000, close: 110600 }),
      candle('2027-03-05T00:00:00Z', { base: 110500 }),
    ];
    expect(evaluateAlert(invalidation(), candles, t('2027-03-04T23:59:59Z')).hit).toBeNull();
  });

  it('la vela de 23:00 cerrada más allá dispara con esa vela y su close', () => {
    const candles = [
      candle('2027-03-04T22:00:00Z', { high: 111000, close: 109900 }),
      candle('2027-03-04T23:00:00Z', { high: 110700, low: 109000, close: 110600 }),
      candle('2027-03-05T00:00:00Z', { base: 110500 }),
    ];

    const { hit, hitValue } = evaluateAlert(invalidation(), candles, t('2027-03-05T00:10:00Z'));

    expect(hit.openTime).toBe(t('2027-03-04T23:00:00Z'));
    expect(hitValue).toBe(110600);
  });

  it('armada a las 23:30 UTC cuenta el cierre de las 00:00', () => {
    const candles = [
      candle('2027-03-04T23:00:00Z', { high: 110700, low: 109000, close: 110600 }),
      candle('2027-03-05T00:00:00Z', { base: 110500 }),
    ];
    const armedLate = invalidation({ armed_at: '2027-03-04T23:30:00Z' });

    const { hit } = evaluateAlert(armedLate, candles, t('2027-03-05T00:10:00Z'));

    expect(hit.openTime).toBe(t('2027-03-04T23:00:00Z'));
  });

  it('dirección below compara el close con el nivel', () => {
    const below = invalidation({ direction: 'below', target_price: 74000, near_pct: null });
    const candles = [candle('2027-03-04T23:00:00Z', { high: 75000, low: 73000, close: 73900 })];
    expect(evaluateAlert(below, candles, t('2027-03-05T00:10:00Z')).hit).not.toBeNull();
  });
});

describe('isWithinNearBand', () => {
  it('above: dentro desde target × (1 − near_pct)', () => {
    const a = { direction: 'above', target_price: 100, near_pct: 3 };
    expect(isWithinNearBand(a, 96.9)).toBe(false);
    expect(isWithinNearBand(a, 97)).toBe(true);
    expect(isWithinNearBand(a, 105)).toBe(true);
  });

  it('below: dentro hasta target × (1 + near_pct)', () => {
    const a = { direction: 'below', target_price: 60000, near_pct: 3 };
    expect(isWithinNearBand(a, 61801)).toBe(false);
    expect(isWithinNearBand(a, 61800)).toBe(true);
  });

  it('sin aviso previo o sin precio → false', () => {
    expect(isWithinNearBand({ direction: 'above', target_price: 100, near_pct: null }, 99)).toBe(false);
    expect(isWithinNearBand({ direction: 'above', target_price: 100, near_pct: 3 }, null)).toBe(false);
  });
});

describe('escenarios de §3.2', () => {
  it('tick normal: re-evaluar la vela de las 14:00 no repite la cercanía ni dispara dos veces', () => {
    const a = alert({ target_price: 100, near_pct: 3, armed_at: '2027-03-01T09:00:00Z' });

    // 14:10 → vela 14:00 abierta, entra en la banda
    const first = evaluateAlert(a, [candle('2027-03-01T14:00:00Z', { high: 98, close: 97.5 })], t('2027-03-01T14:10:00Z'));
    expect(first.near).not.toBeNull();
    a.near_at = '2027-03-01T14:10:00Z';

    // 14:40 → misma vela con high/low actualizados
    const second = evaluateAlert(a, [candle('2027-03-01T14:00:00Z', { high: 98.5, close: 98 })], t('2027-03-01T14:40:00Z'));
    expect(second).toEqual({ near: null, hit: null, nearValue: null, hitValue: null });

    // 15:10 → 14:00 cerrada + 15:00 abierta, que toca
    const third = evaluateAlert(
      a,
      [candle('2027-03-01T14:00:00Z', { high: 98.5 }), candle('2027-03-01T15:00:00Z', { high: 100.2 })],
      t('2027-03-01T15:10:00Z')
    );
    expect(third.hit.openTime).toBe(t('2027-03-01T15:00:00Z'));
  });

  it('recuperación tras 8 h: 9 velas en una petición y el disparo en la vela de las 05:00', () => {
    const a = alert({ direction: 'below', target_price: 60000, armed_at: '2027-02-15T08:00:00Z' });
    const start = t('2027-03-01T02:00:00Z');
    const candles = Array.from({ length: 9 }, (_, i) => ({
      openTime: start + i * HOUR_MS,
      high: 62000,
      low: i === 3 ? 59870 : 61000,
      close: 61500,
    }));

    const { hit, hitValue } = evaluateAlert(a, candles, t('2027-03-01T10:21:00Z'));

    expect(hit.openTime).toBe(t('2027-03-01T05:00:00Z'));
    expect(hitValue).toBe(59870);
  });

  it('invalidación: tabla miércoles / jueves / viernes', () => {
    const a = alert({
      target_price: 110000,
      is_invalidation: true,
      near_pct: 3,
      armed_at: '2027-02-20T15:42:00Z',
    });

    // Mié 15:10 — mecha a 110,400: no dispara, sí da la cercanía
    const wed15 = evaluateAlert(
      a,
      [candle('2027-03-03T15:00:00Z', { high: 110400, low: 108500, close: 109200 })],
      t('2027-03-03T15:10:00Z')
    );
    expect(wed15.hit).toBeNull();
    expect(wed15.near).not.toBeNull();
    a.near_at = '2027-03-03T15:10:00Z';

    // Mié 23:10 — vela de 23:00 abierta: su cierre todavía no cuenta
    const wed23 = evaluateAlert(
      a,
      [candle('2027-03-03T23:00:00Z', { high: 110300, low: 108000, close: 110100 })],
      t('2027-03-03T23:10:00Z')
    );
    expect(wed23.hit).toBeNull();

    // Jue 00:10 — la vela de 23:00 cerró en 107,800 → no dispara
    const thu00 = evaluateAlert(
      a,
      [
        candle('2027-03-03T23:00:00Z', { high: 110300, low: 107500, close: 107800 }),
        candle('2027-03-04T00:00:00Z', { base: 107900 }),
      ],
      t('2027-03-04T00:10:00Z')
    );
    expect(thu00.hit).toBeNull();
    expect(thu00.near).toBeNull();

    // Vie 00:10 — la vela de 23:00 del jueves cerró en 110,600 → invalidada
    const fri00 = evaluateAlert(
      a,
      [
        candle('2027-03-04T23:00:00Z', { high: 110800, low: 109800, close: 110600 }),
        candle('2027-03-05T00:00:00Z', { base: 110500 }),
      ],
      t('2027-03-05T00:10:00Z')
    );
    expect(fri00.hit.openTime).toBe(t('2027-03-04T23:00:00Z'));
    expect(fri00.hitValue).toBe(110600);
  });
});
