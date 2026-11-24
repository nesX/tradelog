import test from 'node:test';
import assert from 'node:assert/strict';

import { sortByLastModified } from './fileOrder.js';

/**
 * Orden de las imágenes elegidas en el selector: del más viejo al más reciente.
 *
 * Corre con: `npm test` (node:test, sin runner extra).
 */

const file = (name, lastModified) => ({ name, lastModified });
const names = (files) => files.map((f) => f.name);

test('ordena por lastModified ascendente, sin importar el orden del selector', () => {
  // Windows devuelve primero el último archivo marcado.
  const picked = [file('c.png', 300), file('a.png', 100), file('b.png', 200)];
  assert.deepEqual(names(sortByLastModified(picked)), ['a.png', 'b.png', 'c.png']);
});

test('a igual fecha desempata por nombre, con números en orden natural', () => {
  const picked = [file('captura 10.png', 100), file('captura 2.png', 100), file('captura 1.png', 100)];
  assert.deepEqual(names(sortByLastModified(picked)), ['captura 1.png', 'captura 2.png', 'captura 10.png']);
});

test('acepta un FileList (iterable) y no muta la entrada', () => {
  const picked = [file('b.png', 200), file('a.png', 100)];
  const iterable = {
    *[Symbol.iterator]() {
      yield* picked;
    },
    length: picked.length,
  };
  assert.deepEqual(names(sortByLastModified(iterable)), ['a.png', 'b.png']);
  assert.deepEqual(names(picked), ['b.png', 'a.png']);
});
