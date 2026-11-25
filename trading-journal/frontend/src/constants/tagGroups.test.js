import test from 'node:test';
import assert from 'node:assert/strict';

import { TAG_GROUPS, sortTags, groupTags, filterTags, getTagGroup } from './tagGroups.js';

/**
 * Orden canónico y agrupado de los tags de notas.
 *
 * Corre con: `npm test` (node:test, sin runner extra).
 */

const tag = (id, name, group_key) => ({ id, name, group_key });
const names = (tags) => tags.map((t) => t.name);

test('los grupos coinciden con los del backend y la migración 030', () => {
  assert.deepEqual(
    TAG_GROUPS.map((g) => g.key),
    ['activo', 'tipo', 'estrategia', 'resultado', 'libre']
  );
});

test('sortTags ordena por grupo y luego por nombre, sin mutar la entrada', () => {
  const input = [
    tag(1, 'zeta', 'libre'),
    tag(2, 'trade perdido', 'tipo'),
    tag(3, 'NQ', 'activo'),
    tag(4, 'Proyección', 'tipo'),
    tag(5, 'ES', 'activo'),
  ];
  assert.deepEqual(names(sortTags(input)), ['ES', 'NQ', 'Proyección', 'trade perdido', 'zeta']);
  assert.equal(input[0].name, 'zeta');
});

test('sortTags compara en español sin distinguir mayúsculas', () => {
  const input = [tag(1, 'ñandú', 'libre'), tag(2, 'Nube', 'libre'), tag(3, 'oso', 'libre')];
  assert.deepEqual(names(sortTags(input)), ['Nube', 'ñandú', 'oso']);
});

test('un tag sin group_key cuenta como Libre', () => {
  assert.equal(getTagGroup(undefined).key, 'libre');
  assert.deepEqual(names(sortTags([tag(1, 'a', undefined), tag(2, 'b', 'resultado')])), ['b', 'a']);
});

test('groupTags devuelve los grupos en orden, sin los vacíos', () => {
  const groups = groupTags([tag(1, 'zeta', 'libre'), tag(2, 'NQ', 'activo'), tag(3, 'ES', 'activo')]);
  assert.deepEqual(
    groups.map((g) => [g.key, g.label, names(g.tags)]),
    [
      ['activo', 'Activo', ['ES', 'NQ']],
      ['libre', 'Libre', ['zeta']],
    ]
  );
  assert.deepEqual(groupTags([]), []);
});

test('filterTags no distingue mayúsculas ni tildes', () => {
  const tags = [tag(1, 'Proyección', 'tipo'), tag(2, 'NQ', 'activo')];
  assert.deepEqual(names(filterTags(tags, 'proyeccion')), ['Proyección']);
  assert.deepEqual(names(filterTags(tags, ' nq ')), ['NQ']);
  assert.equal(filterTags(tags, '').length, 2);
});
