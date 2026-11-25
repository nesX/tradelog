import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTagIdsParam,
  formatTagIdsParam,
  parseOrderParam,
  shuffle,
  sortReviewItems,
  buildReviewTitle,
} from './tagReview.js';

/**
 * Pestaña "Por tag" de Repaso: URL, orden y título del visor.
 *
 * Corre con: `npm test` (node:test, sin runner extra).
 */

const item = (block_id, created_at) => ({ block_id, created_at });
const ids = (items) => items.map((i) => i.block_id);

test('parseTagIdsParam ignora basura y repetidos', () => {
  assert.deepEqual(parseTagIdsParam('4,1,4'), [4, 1]);
  assert.deepEqual(parseTagIdsParam('1,abc,,-3,0,2.5,7'), [1, 7]);
  assert.deepEqual(parseTagIdsParam(null), []);
  assert.deepEqual(parseTagIdsParam(''), []);
});

test('formatTagIdsParam ordena para que la misma selección dé la misma URL', () => {
  assert.equal(formatTagIdsParam([7, 1, 4, 1]), '1,4,7');
  assert.equal(formatTagIdsParam([]), '');
});

test('parseOrderParam cae en cronológico con un valor desconocido', () => {
  assert.equal(parseOrderParam('random'), 'random');
  assert.equal(parseOrderParam('recent'), 'recent');
  assert.equal(parseOrderParam('xyz'), 'chrono');
  assert.equal(parseOrderParam(null), 'chrono');
});

test('shuffle es Fisher-Yates sobre una copia', () => {
  const input = [1, 2, 3, 4];
  // random() = 0 siempre: cada i se cambia con el 0 → [2, 3, 4, 1]
  assert.deepEqual(shuffle(input, () => 0), [2, 3, 4, 1]);
  assert.deepEqual(input, [1, 2, 3, 4]);
  // random() casi 1: j = i, nada se mueve
  assert.deepEqual(shuffle(input, () => 0.999), [1, 2, 3, 4]);
});

test('sortReviewItems: cronológico, recientes primero y aleatorio estable', () => {
  const items = [item(3, '2026-11-03'), item(1, '2026-11-01'), item(2, '2026-11-02')];
  assert.deepEqual(ids(sortReviewItems(items, 'chrono')), [1, 2, 3]);
  assert.deepEqual(ids(sortReviewItems(items, 'recent')), [3, 2, 1]);
  assert.deepEqual(ids(sortReviewItems(items, 'random', [2, 3, 1])), [2, 3, 1]);
  // un item nuevo que no estaba al barajar va al final
  assert.deepEqual(ids(sortReviewItems([...items, item(9, '2026-10-01')], 'random', [2, 3, 1])), [2, 3, 1, 9]);
});

test('a igual fecha, cronológico desempata por id', () => {
  const items = [item(5, '2026-11-01'), item(4, '2026-11-01')];
  assert.deepEqual(ids(sortReviewItems(items, 'chrono')), [4, 5]);
});

test('buildReviewTitle separa grupos con " · " y tags del mismo grupo con ", "', () => {
  const selected = [
    { id: 2, name: 'trade perdido', group_key: 'tipo' },
    { id: 1, name: 'NQ', group_key: 'activo' },
    { id: 3, name: 'proyección', group_key: 'tipo' },
  ];
  assert.equal(buildReviewTitle(selected), 'NQ · proyección, trade perdido');
  assert.equal(buildReviewTitle([]), '');
});
