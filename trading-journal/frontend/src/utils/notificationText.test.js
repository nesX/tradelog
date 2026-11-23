import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Textos de las tarjetas, compartidos con el service worker.
 *
 * Corre en Node, sin jsdom: si este módulo (o algo que importa) tocara `window`,
 * `document` o `localStorage` al cargarse, el import fallaría aquí igual que
 * fallaría la instalación del SW.
 *
 * Corre con: `npm test` (node:test, sin runner extra).
 */

const { describe, VARIANT_LABELS } = await import('./notificationText.js');

// Tipos con aviso push y recorte del payload: copia a mano de PUSH_TYPES,
// OMITTED_PAYLOAD_FIELDS y TRIMMED_PAYLOAD_FIELDS de
// backend/src/services/pushMessage.js. Si cambian allí, cambiarlas aquí.
const PUSH_TYPES = [
  'price_alert_hit',
  'price_alert_near',
  'price_alert_deadline',
  'price_alert_delisted',
  'date_reminder_due',
];
const OMITTED_PAYLOAD_FIELDS = ['sibling_alerts', 'block_excerpt'];
const TRIMMED_PAYLOAD_FIELDS = ['message', 'note_title'];
const TRIM_LENGTH = 200;

const trimPayload = (payload) => {
  const trimmed = { ...payload };
  for (const field of OMITTED_PAYLOAD_FIELDS) delete trimmed[field];
  for (const field of TRIMMED_PAYLOAD_FIELDS) {
    const chars = typeof trimmed[field] === 'string' ? Array.from(trimmed[field]) : null;
    if (chars && chars.length > TRIM_LENGTH) trimmed[field] = `${chars.slice(0, TRIM_LENGTH).join('')}…`;
  }
  return trimmed;
};

// Payload completo, como lo guarda el job (notificationPayload.js del backend)
const alertPayload = (overrides = {}) => ({
  symbol: 'BTCUSDT',
  contract_type: 'PERPETUAL',
  direction: 'below',
  target_price: 60000,
  is_invalidation: false,
  near_pct: 3,
  price_at_creation: 71234.5,
  armed_at: '2027-02-01T10:00:00.000Z',
  deadline_at: '2027-03-31T22:00:00.000Z',
  candle_open_time: '2027-03-04T03:00:00.000Z',
  candle_value: 59870.5,
  last_price: 59900,
  message: 'Zona de demanda semanal',
  note_id: 10,
  note_title: 'Análisis macro BTC 2026',
  block_id: 20,
  block_excerpt: 'El precio vuelve a la zona de 60k, donde…',
  sibling_alerts: [{ id: 6, symbol: 'BTCUSDT', direction: 'above', target_price: 80000, is_invalidation: true }],
  ...overrides,
});
const PAYLOADS = {
  price_alert_hit: alertPayload(),
  price_alert_near: alertPayload({ candle_value: 61200 }),
  price_alert_deadline: alertPayload({ candle_open_time: null, candle_value: null }),
  price_alert_delisted: alertPayload({ candle_open_time: null, candle_value: null }),
  date_reminder_due: {
    remind_at: '2027-03-04T07:00:00.000Z',
    message: 'Revisar tras el cierre trimestral',
    note_id: 10,
    note_title: 'Análisis macro BTC 2026',
    block_id: null,
    block_excerpt: 'Texto del bloque',
  },
};

test('carga sin window, document ni localStorage', () => {
  assert.equal(typeof globalThis.window, 'undefined');
  assert.equal(typeof describe, 'function');
});

test('hay etiqueta para los seis tipos de tarjeta', () => {
  assert.deepEqual(Object.keys(VARIANT_LABELS).sort(), [...PUSH_TYPES, 'price_alert_invalidation'].sort());
});

for (const type of PUSH_TYPES) {
  test(`paridad push: ${type} da el mismo texto con el payload recortado`, () => {
    const full = describe({ type, payload: PAYLOADS[type] });
    const pushed = describe({ type, payload: trimPayload(PAYLOADS[type]) });

    assert.deepEqual(pushed, full);
    assert.ok(full.headline && !full.headline.includes('undefined'), full.headline);
  });
}

test('textos de ejemplo', () => {
  assert.equal(describe({ type: 'price_alert_hit', payload: PAYLOADS.price_alert_hit }).headline, 'BTCUSDT tocó 60.000');
  assert.equal(
    describe({ type: 'price_alert_near', payload: PAYLOADS.price_alert_near }).headline,
    'BTCUSDT a 2.0% de 60.000'
  );
  assert.equal(
    describe({ type: 'price_alert_delisted', payload: PAYLOADS.price_alert_delisted }).headline,
    'BTCUSDT dejó de cotizar en Binance Futures'
  );
  assert.equal(
    describe({ type: 'date_reminder_due', payload: PAYLOADS.date_reminder_due }).headline,
    'Revisar tras el cierre trimestral'
  );
  assert.equal(describe({ type: 'date_reminder_due', payload: {} }).headline, 'Revisar este análisis');
});

test('un tipo desconocido lanza', () => {
  assert.throws(() => describe({ type: 'foo', payload: {} }), /desconocido/);
});
