import test from 'node:test';
import assert from 'node:assert/strict';

import { base64UrlToUint8Array, arrayBufferToBase64Url, keyMatches } from './push.js';

/**
 * Claves de las suscripciones push: la del servidor viaja en base64url y el
 * navegador devuelve la suya como ArrayBuffer.
 *
 * Corre con: `npm test` (node:test, sin runner extra).
 */

// Clave pública VAPID de ejemplo (65 bytes, base64url sin relleno)
const PUBLIC_KEY = 'BOHFgRDdldoppqKRnQjylx1he8uCK7c6hW6faoZNGtgEa8ni08dVeBOuIQzlg4oDHKavw79SJ8fVZBD49WejONI';

test('base64url ↔ bytes, ida y vuelta', () => {
  const bytes = base64UrlToUint8Array(PUBLIC_KEY);

  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 0x04); // punto P-256 sin comprimir
  assert.equal(arrayBufferToBase64Url(bytes.buffer), PUBLIC_KEY);
});

test('keyMatches compara la clave del navegador con la del servidor', () => {
  const subscription = (key) => ({ options: { applicationServerKey: key } });
  const other = base64UrlToUint8Array(PUBLIC_KEY);
  other[1] ^= 0xff;

  assert.equal(keyMatches(subscription(base64UrlToUint8Array(PUBLIC_KEY).buffer), PUBLIC_KEY), true);
  assert.equal(keyMatches(subscription(other.buffer), PUBLIC_KEY), false);
  // Si el navegador no expone la clave, cuenta como coincidente (si no, se resuscribiría en cada carga)
  assert.equal(keyMatches(subscription(null), PUBLIC_KEY), true);
  assert.equal(keyMatches({}, PUBLIC_KEY), true);
});
