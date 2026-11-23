import test from 'node:test';
import assert from 'node:assert/strict';

import { safeNext } from './safeNext.js';

/**
 * `?next=` tras el login: solo rutas de la app, nunca una redirección abierta.
 *
 * Corre con: `npm test` (node:test, sin runner extra).
 */

const ORIGIN = 'https://tradelog.nesx.co';
const next = (value) => safeNext(value, ORIGIN);

test('acepta rutas de la app con su query y su hash', () => {
  assert.equal(next('/recordatorios?card=812'), '/recordatorios?card=812');
  assert.equal(next('/notes/10?highlight=20#block-20'), '/notes/10?highlight=20#block-20');
  assert.equal(next('/'), '/');
});

test('rechaza destinos fuera de la app', () => {
  for (const value of [
    '//evil.com',
    '/\\evil.com',
    '/\\/evil.com',
    'https://evil.com',
    'http://tradelog.nesx.co.evil.com/',
    'javascript:alert(1)',
    '/\t/evil.com',
    '/\n/evil.com',
    'evil.com',
    '',
    null,
    undefined,
    42,
  ]) {
    assert.equal(next(value), '/', `debería rechazar ${JSON.stringify(value)}`);
  }
});

test('no vuelve a /login', () => {
  assert.equal(next('/login?next=%2Frecordatorios'), '/');
});
