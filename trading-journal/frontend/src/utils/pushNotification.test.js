import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Notificación que muestra el service worker para cada mensaje push. Corre en
 * Node, sin jsdom (el módulo lo importa el SW).
 *
 * Corre con: `npm test` (node:test, sin runner extra).
 */

const { buildPushNotification, cardUrl } = await import('./pushNotification.js');

const CREATED_AT = '2027-03-04T03:41:12.000Z';
const cardMessage = (overrides = {}) => ({
  v: 1,
  kind: 'card',
  id: 812,
  type: 'price_alert_hit',
  tag: 'pa-77',
  created_at: CREATED_AT,
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
const build = (message) => buildPushNotification(JSON.stringify(message));

const assertGeneric = (result) => {
  assert.equal(result.title, 'Tienes recordatorios nuevos');
  assert.equal(result.options.data.url, '/recordatorios');
  assert.equal(result.options.tag, undefined);
  assert.equal(result.options.renotify, undefined);
};

test('tarjeta: titular, detalle + nota, tag con renotify, hora de la tarjeta y URL a la tarjeta', () => {
  const { title, options } = build(cardMessage());

  assert.equal(title, 'BTCUSDT tocó 60.000');
  assert.match(options.body, /^Vela .+: mínimo 59\.870,5\n📝 Análisis macro BTC 2026$/);
  assert.equal(options.tag, 'pa-77');
  assert.equal(options.renotify, true);
  assert.equal(options.timestamp, Date.parse(CREATED_AT));
  assert.equal(options.icon, '/pwa-192x192.png');
  assert.equal(options.badge, '/pwa-badge-96.png');
  assert.deepEqual(options.data, { url: '/recordatorios?card=812' });
});

test('tarjeta sin detalle ni nota → cuerpo vacío, sin "undefined"', () => {
  const { options } = build(
    cardMessage({ type: 'date_reminder_due', tag: 'dr-9', payload: { remind_at: CREATED_AT, message: 'Revisar' } })
  );

  assert.match(options.body, /^Programado para el /);
  assert.ok(!options.body.includes('undefined'));
  assert.ok(!options.body.includes('📝'));
});

test('tarjeta sin tag → sin renotify (Chrome lanza con renotify sin tag)', () => {
  const { options } = build(cardMessage({ tag: null }));

  assert.equal(options.tag, undefined);
  assert.equal(options.renotify, undefined);
});

test('resumen: título con el número, símbolos y "y N más", sin tag', () => {
  const { title, options } = build({
    v: 1,
    kind: 'summary',
    count: 6,
    symbols: ['BTCUSDT', 'ETHUSDT', 'XAUUSDT'],
    created_at: CREATED_AT,
  });

  assert.equal(title, '6 recordatorios nuevos');
  assert.equal(options.body, 'BTCUSDT, ETHUSDT, XAUUSDT y 3 más');
  assert.equal(options.tag, undefined);
  assert.equal(options.data.url, '/recordatorios');
});

test('resumen sin símbolos (solo recordatorios por fecha)', () => {
  const { options } = build({ v: 1, kind: 'summary', count: 4, symbols: [], created_at: CREATED_AT });

  assert.equal(options.body, 'Ábrelos en Recordatorios');
});

test('prueba', () => {
  const { title, options } = build({ v: 1, kind: 'test', created_at: CREATED_AT });

  assert.equal(title, 'Notificaciones activadas');
  assert.equal(options.body, 'Así se verán los avisos en este dispositivo');
  assert.equal(options.data.url, '/recordatorios');
});

test('cualquier cosa que no entiende → aviso genérico, sin lanzar', () => {
  assertGeneric(buildPushNotification(null));
  assertGeneric(buildPushNotification('no es JSON'));
  assertGeneric(buildPushNotification('null'));
  assertGeneric(build({ v: 2, kind: 'card' }));
  assertGeneric(build({ v: 1, kind: 'otra-cosa' }));
  assertGeneric(build({ v: 1, kind: 'toString' }));
  assertGeneric(build(cardMessage({ type: 'foo' })));
  assertGeneric(build({ type: 'foo' }));
  assertGeneric(build({ v: 1, kind: 'summary', count: 'muchos' }));
});

test('cardUrl escapa el id', () => {
  assert.equal(cardUrl(812), '/recordatorios?card=812');
  assert.equal(cardUrl('1&x=2'), '/recordatorios?card=1%26x%3D2');
});
