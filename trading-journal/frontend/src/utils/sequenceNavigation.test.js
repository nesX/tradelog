import test from 'node:test';
import assert from 'node:assert/strict';

import { keyToAction, isEditableTarget, clampIndex } from './sequenceNavigation.js';

/**
 * Teclado del visor de repaso de bloques.
 *
 * Corre con: `npm test` (node:test, sin runner extra).
 */

// Elemento mínimo: `closest` responde según el selector que lo contiene.
const element = ({ tag = 'div', editable = false } = {}) => ({
  isContentEditable: editable,
  closest: (selector) => (selector.split(', ').includes(tag) ? {} : null),
});
const key = (k, extra = {}) => ({ key: k, target: element(), ...extra });

test('flechas navegan y Esc sale', () => {
  assert.equal(keyToAction(key('ArrowRight')), 'next');
  assert.equal(keyToAction(key('ArrowLeft')), 'prev');
  assert.equal(keyToAction(key('Escape')), 'exit');
  assert.equal(keyToAction(key('Enter')), null);
});

test('con el foco en un campo editable no hace nada (escribir en el picker no navega)', () => {
  for (const tag of ['input', 'textarea', 'select']) {
    assert.equal(keyToAction(key('ArrowRight', { target: element({ tag }) })), null, tag);
  }
  assert.equal(keyToAction(key('Escape', { target: element({ editable: true }) })), null);
  assert.equal(isEditableTarget(null), false);
});

test('con modificadores no hace nada (atajos del navegador)', () => {
  assert.equal(keyToAction(key('ArrowLeft', { altKey: true })), null);
  assert.equal(keyToAction(key('ArrowRight', { metaKey: true })), null);
  assert.equal(keyToAction(key('ArrowRight', { shiftKey: true })), null);
});

test('clampIndex no da la vuelta', () => {
  assert.equal(clampIndex(5, 3), 2);
  assert.equal(clampIndex(-1, 3), 0);
  assert.equal(clampIndex(3, 0), 0);
});
