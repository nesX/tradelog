import { PUSH_TYPES, MAX_AGE_MS, buildPushMessages, trimPayload, tagFor, ttlFor, topicFor } from '../pushMessage.js';

/**
 * Mensajes push a partir de las tarjetas nuevas: filtro de tipos, descarte por
 * antigüedad, tags, colapso por alerta, umbral del resumen y recorte del payload.
 */

const NOW = Date.parse('2027-03-04T04:00:00.000Z');
const HOUR = 3_600_000;

let nextId = 100;
const card = (overrides = {}) => ({
  id: (nextId += 1),
  user_id: 1,
  type: 'price_alert_hit',
  price_alert_id: 77,
  date_reminder_id: null,
  created_at: new Date(NOW - 60_000),
  payload: {
    symbol: 'BTCUSDT',
    direction: 'below',
    target_price: 60000,
    candle_value: 59870.5,
    candle_open_time: '2027-03-04T03:00:00.000Z',
    note_title: 'Análisis macro BTC 2026',
    message: null,
  },
  ...overrides,
});
const reminderCard = (overrides = {}) =>
  card({
    type: 'date_reminder_due',
    price_alert_id: null,
    date_reminder_id: 9,
    payload: { remind_at: '2027-03-04T08:00:00.000Z', message: 'Revisar', note_title: 'Nota' },
    ...overrides,
  });

describe('buildPushMessages', () => {
  it('genera un mensaje por cada uno de los cinco tipos con aviso', () => {
    const cards = PUSH_TYPES.map((type, i) =>
      type === 'date_reminder_due'
        ? reminderCard({ user_id: i + 1 })
        : card({ type, user_id: i + 1, price_alert_id: i + 1 })
    );

    const messages = buildPushMessages(cards, NOW);

    expect([...messages.values()].flat().map((m) => m.type)).toEqual(PUSH_TYPES);
  });

  it('la tesis invalidada no genera aviso', () => {
    const messages = buildPushMessages([card({ type: 'price_alert_invalidation' })], NOW);

    expect(messages.size).toBe(0);
  });

  it('descarta las tarjetas de más de 24 h', () => {
    const old = card({ created_at: new Date(NOW - MAX_AGE_MS - 1), price_alert_id: 1 });
    const recent = card({ created_at: new Date(NOW - MAX_AGE_MS + 60_000), price_alert_id: 2 });

    const messages = buildPushMessages([old, recent], NOW);

    expect(messages.get(1).map((m) => m.id)).toEqual([recent.id]);
  });

  it('mensaje de tarjeta: versión, id, tipo, tag, created_at y payload', () => {
    const hit = card();

    const [message] = buildPushMessages([hit], NOW).get(1);

    expect(message).toEqual({
      v: 1,
      kind: 'card',
      id: hit.id,
      type: 'price_alert_hit',
      tag: 'pa-77',
      created_at: hit.created_at.toISOString(),
      payload: hit.payload,
    });
  });

  it('agrupa por usuario', () => {
    const messages = buildPushMessages(
      [
        card({ user_id: 1, price_alert_id: 1 }),
        card({ user_id: 2, price_alert_id: 2 }),
        card({ user_id: 1, price_alert_id: 3 }),
      ],
      NOW
    );

    expect(messages.get(1)).toHaveLength(2);
    expect(messages.get(2)).toHaveLength(1);
  });

  describe('colapso por alerta', () => {
    it('fecha límite + toque de la misma alerta → solo el toque', () => {
      const messages = buildPushMessages(
        [card({ type: 'price_alert_deadline' }), card({ type: 'price_alert_hit' })],
        NOW
      );

      expect(messages.get(1).map((m) => m.type)).toEqual(['price_alert_hit']);
    });

    it('fecha límite + cercanía → la cercanía, en cualquier orden', () => {
      const a = buildPushMessages([card({ type: 'price_alert_deadline' }), card({ type: 'price_alert_near' })], NOW);
      const b = buildPushMessages([card({ type: 'price_alert_near' }), card({ type: 'price_alert_deadline' })], NOW);

      expect(a.get(1).map((m) => m.type)).toEqual(['price_alert_near']);
      expect(b.get(1).map((m) => m.type)).toEqual(['price_alert_near']);
    });

    it('prioridad: toque > deslistado > cercanía > fecha límite', () => {
      const types = ['price_alert_deadline', 'price_alert_near', 'price_alert_delisted', 'price_alert_hit'];

      expect(
        buildPushMessages(
          types.map((type) => card({ type })),
          NOW
        ).get(1)[0].type
      ).toBe('price_alert_hit');
      expect(
        buildPushMessages(
          types.slice(0, 3).map((type) => card({ type })),
          NOW
        ).get(1)[0].type
      ).toBe('price_alert_delisted');
    });

    it('a igual tipo gana la tarjeta más nueva', () => {
      const first = card({ type: 'price_alert_near' });
      const second = card({ type: 'price_alert_near' });

      expect(buildPushMessages([first, second], NOW).get(1)[0].id).toBe(second.id);
    });

    it('alertas distintas no se colapsan', () => {
      const messages = buildPushMessages([card({ price_alert_id: 1 }), card({ price_alert_id: 2 })], NOW);

      expect(messages.get(1)).toHaveLength(2);
    });
  });

  describe('umbral', () => {
    it('hasta 3 mensajes → uno por tarjeta', () => {
      const cards = [1, 2, 3].map((id) => card({ price_alert_id: id }));

      expect(
        buildPushMessages(cards, NOW)
          .get(1)
          .map((m) => m.kind)
      ).toEqual(['card', 'card', 'card']);
    });

    it('cuenta los mensajes tras colapsar: 4 tarjetas de 3 alertas → 3 mensajes', () => {
      const cards = [
        card({ price_alert_id: 1, type: 'price_alert_deadline' }),
        card({ price_alert_id: 1, type: 'price_alert_hit' }),
        card({ price_alert_id: 2 }),
        card({ price_alert_id: 3 }),
      ];

      expect(buildPushMessages(cards, NOW).get(1)).toHaveLength(3);
    });

    it('más de 3 → un resumen sin tag, con hasta 3 símbolos distintos por importancia', () => {
      const cards = [
        card({ price_alert_id: 1, type: 'price_alert_near', payload: { symbol: 'ETHUSDT' } }),
        reminderCard({ date_reminder_id: 1 }),
        card({ price_alert_id: 2, type: 'price_alert_hit', payload: { symbol: 'XAUUSDT' } }),
        card({ price_alert_id: 3, type: 'price_alert_near', payload: { symbol: 'ETHUSDT' } }),
        card({ price_alert_id: 4, type: 'price_alert_deadline', payload: { symbol: 'SOLUSDT' } }),
        card({ price_alert_id: 5, type: 'price_alert_hit', payload: { symbol: 'BTCUSDT' } }),
      ];

      const messages = buildPushMessages(cards, NOW).get(1);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        v: 1,
        kind: 'summary',
        count: 6,
        symbols: ['XAUUSDT', 'BTCUSDT', 'ETHUSDT'],
      });
      expect(messages[0]).not.toHaveProperty('tag');
    });

    it('el resumen lleva la hora de la tarjeta más reciente y admite cero símbolos', () => {
      const latest = new Date(NOW - 1_000);
      const cards = [1, 2, 3, 4].map((id) =>
        reminderCard({ date_reminder_id: id, created_at: id === 3 ? latest : new Date(NOW - HOUR) })
      );

      const [summary] = buildPushMessages(cards, NOW).get(1);

      expect(summary).toMatchObject({ count: 4, symbols: [], created_at: latest.toISOString() });
    });
  });
});

describe('tagFor', () => {
  it('alerta, recordatorio y fallback a la tarjeta si la FK quedó en NULL', () => {
    expect(tagFor({ id: 1, price_alert_id: 77, date_reminder_id: null })).toBe('pa-77');
    expect(tagFor({ id: 1, price_alert_id: null, date_reminder_id: 9 })).toBe('dr-9');
    expect(tagFor({ id: 812, price_alert_id: null, date_reminder_id: null })).toBe('card-812');
  });
});

describe('trimPayload', () => {
  it('quita sibling_alerts y block_excerpt sin tocar el resto', () => {
    const payload = { symbol: 'BTCUSDT', sibling_alerts: [{ id: 1 }], block_excerpt: 'texto', note_id: 3 };

    expect(trimPayload(payload)).toEqual({ symbol: 'BTCUSDT', note_id: 3 });
    expect(payload).toHaveProperty('sibling_alerts'); // no muta el original
  });

  it('recorta message y note_title a 200 caracteres sin partir emojis', () => {
    const trimmed = trimPayload({ message: '😀'.repeat(500), note_title: 'a'.repeat(250), symbol: 'X' });

    expect(Array.from(trimmed.message)).toHaveLength(201); // 200 + '…'
    expect(trimmed.message.endsWith('😀…')).toBe(true);
    expect(trimmed.note_title).toBe(`${'a'.repeat(200)}…`);
    expect(trimPayload({ message: null }).message).toBeNull();
    expect(trimPayload({ message: 'corto' }).message).toBe('corto');
  });

  it('peor caso: el mensaje en JSON queda por debajo de 3 KB', () => {
    const worst = card({
      type: 'price_alert_near',
      price_alert_id: 2_147_483_647,
      payload: {
        symbol: 'X'.repeat(30),
        contract_type: 'TRADIFI_PERPETUAL',
        direction: 'above',
        target_price: 123456789.12345678,
        is_invalidation: false,
        near_pct: 49.99,
        price_at_creation: 123456789.12345678,
        armed_at: new Date(NOW).toISOString(),
        deadline_at: new Date(NOW).toISOString(),
        candle_open_time: new Date(NOW).toISOString(),
        candle_value: 123456789.12345678,
        last_price: 123456789.12345678,
        message: '😀'.repeat(500),
        note_id: 2_147_483_647,
        note_title: '🚀'.repeat(1000),
        block_id: 2_147_483_647,
        block_excerpt: 'x'.repeat(300),
        sibling_alerts: Array.from({ length: 50 }, (_, id) => ({ id, symbol: 'BTCUSDT' })),
      },
    });

    const [message] = buildPushMessages([worst], NOW).get(1);

    expect(Buffer.byteLength(JSON.stringify(message), 'utf8')).toBeLessThan(3 * 1024);
  });
});

describe('ttlFor y topicFor', () => {
  it('cercanía 4 h, resto y resumen 24 h', () => {
    expect(ttlFor({ kind: 'card', type: 'price_alert_near' })).toBe(4 * 3600);
    expect(ttlFor({ kind: 'card', type: 'price_alert_hit' })).toBe(24 * 3600);
    expect(ttlFor({ kind: 'summary', count: 5 })).toBe(24 * 3600);
  });

  it('el topic es el tag; el resumen va sin topic', () => {
    expect(topicFor({ kind: 'card', tag: 'pa-77' })).toBe('pa-77');
    expect(topicFor({ kind: 'summary', count: 5 })).toBeNull();
  });
});
