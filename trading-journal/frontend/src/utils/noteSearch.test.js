import test from 'node:test';
import assert from 'node:assert/strict';

import { hasSearchText, formatSearchSummary, buildSearchTitle } from './noteSearch.js';

/**
 * Página /buscar: cuándo hay texto, el resumen y el título del visor.
 *
 * Corre con: `npm test` (node:test, sin runner extra).
 */

test('hasSearchText: hace falta al menos una letra o un dígito', () => {
  assert.equal(hasSearchText('proyec'), true);
  assert.equal(hasSearchText('"trade perdido"'), true);
  assert.equal(hasSearchText('ñ'), true);
  assert.equal(hasSearchText('2026'), true);
  assert.equal(hasSearchText('???'), false);
  assert.equal(hasSearchText('  '), false);
  assert.equal(hasSearchText(''), false);
  assert.equal(hasSearchText(undefined), false);
});

test('formatSearchSummary: totales con singular y plural', () => {
  const notes = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));
  assert.equal(formatSearchSummary({ notes: notes(14), total_notes: 14, total_blocks: 52 }), '14 notas · 52 bloques');
  assert.equal(formatSearchSummary({ notes: notes(1), total_notes: 1, total_blocks: 1 }), '1 nota · 1 bloque');
  assert.equal(formatSearchSummary({ notes: notes(1), total_notes: 1, total_blocks: 0 }), '1 nota · 0 bloques');
});

test('formatSearchSummary: más notas que las devueltas', () => {
  const notes = Array.from({ length: 30 }, (_, i) => ({ id: i }));
  assert.equal(
    formatSearchSummary({ notes, total_notes: 45, total_blocks: 120 }),
    'mostrando 30 de 45 notas · 120 bloques'
  );
});

test('buildSearchTitle: texto y tags agrupados', () => {
  const groups = [
    { id: 10, name: 'Activo', color: '#3B82F6' },
    { id: 11, name: 'Tipo', color: '#F59E0B' },
  ];
  const tags = [
    { id: 3, name: 'Swing', group_id: 11 },
    { id: 1, name: 'NQ', group_id: 10 },
    { id: 4, name: 'Scalping', group_id: 11 },
  ];
  assert.equal(buildSearchTitle(' proyec ', tags, groups), 'Búsqueda · “proyec” · NQ · Scalping, Swing');
  assert.equal(buildSearchTitle('', tags, groups), 'Búsqueda · NQ · Scalping, Swing');
  assert.equal(buildSearchTitle('???', []), 'Búsqueda');
  assert.equal(buildSearchTitle('nq', []), 'Búsqueda · “nq”');
});
