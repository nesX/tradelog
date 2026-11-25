import test from 'node:test';
import assert from 'node:assert/strict';

import { FREE_GROUP, sortTags, groupTags, filterTags, getTagGroup, listTagGroups, moveTagGroup } from './tagGroups.js';

/**
 * Orden canónico y agrupado de los tags de notas con los grupos del usuario.
 *
 * Corre con: `npm test` (node:test, sin runner extra).
 */

// Grupos como los devuelve la API, ya en orden.
const groups = [
  { id: 10, name: 'Activo', color: '#3B82F6', position: 0 },
  { id: 11, name: 'Tipo', color: '#F59E0B', position: 1 },
  { id: 12, name: 'Resultado', color: '#10B981', position: 2 },
];

const tag = (id, name, group_id) => ({ id, name, group_id });
const names = (tags) => tags.map((t) => t.name);

test('sortTags ordena por el orden de los grupos, Libre al final, y luego por nombre, sin mutar la entrada', () => {
  const input = [
    tag(1, 'zeta', null),
    tag(2, 'trade perdido', 11),
    tag(3, 'NQ', 10),
    tag(4, 'Proyección', 11),
    tag(5, 'ES', 10),
  ];
  assert.deepEqual(names(sortTags(input, groups)), ['ES', 'NQ', 'Proyección', 'trade perdido', 'zeta']);
  assert.equal(input[0].name, 'zeta');
});

test('sortTags sigue el orden de la lista, no el id ni la posición', () => {
  const reordered = [groups[2], groups[0], groups[1]];
  assert.deepEqual(names(sortTags([tag(1, 'NQ', 10), tag(2, 'ganador', 12), tag(3, 'swing', 11)], reordered)), [
    'ganador',
    'NQ',
    'swing',
  ]);
});

test('sortTags compara en español sin distinguir mayúsculas', () => {
  const input = [tag(1, 'ñandú', null), tag(2, 'Nube', null), tag(3, 'oso', null)];
  assert.deepEqual(names(sortTags(input, groups)), ['Nube', 'ñandú', 'oso']);
});

test('sin grupos cargados, sortTags ordena solo por nombre', () => {
  const input = [tag(1, 'zeta', 10), tag(2, 'alfa', null), tag(3, 'NQ', 11)];
  assert.deepEqual(names(sortTags(input, undefined)), ['alfa', 'NQ', 'zeta']);
});

test('un tag sin grupo o con un grupo desconocido (borrado) cuenta como Libre', () => {
  assert.equal(getTagGroup(groups, null), FREE_GROUP);
  assert.equal(getTagGroup(groups, 99), FREE_GROUP);
  assert.equal(getTagGroup(undefined, 10), FREE_GROUP);
  assert.deepEqual(getTagGroup(groups, 11), { id: 11, label: 'Tipo', color: '#F59E0B' });
  assert.deepEqual(names(sortTags([tag(1, 'a', 99), tag(2, 'b', 12)], groups)), ['b', 'a']);
});

test('groupTags devuelve los grupos en orden, Libre al final, sin los vacíos', () => {
  const result = groupTags([tag(1, 'zeta', null), tag(2, 'NQ', 10), tag(3, 'ES', 10), tag(4, 'x', 99)], groups);
  assert.deepEqual(
    result.map((g) => [g.id, g.label, names(g.tags)]),
    [
      [10, 'Activo', ['ES', 'NQ']],
      [null, 'Libre', ['x', 'zeta']],
    ]
  );
  assert.deepEqual(groupTags([], groups), []);
});

test('groupTags con includeEmpty muestra todos los grupos y Libre', () => {
  const result = groupTags([tag(1, 'NQ', 10)], groups, { includeEmpty: true });
  assert.deepEqual(
    result.map((g) => [g.label, g.color, g.tags.length]),
    [
      ['Activo', '#3B82F6', 1],
      ['Tipo', '#F59E0B', 0],
      ['Resultado', '#10B981', 0],
      ['Libre', '#6B7280', 0],
    ]
  );
  assert.deepEqual(
    groupTags([], [], { includeEmpty: true }).map((g) => g.label),
    ['Libre']
  );
});

test('sin grupos cargados, groupTags da una sola lista sin encabezado (nunca todo bajo Libre)', () => {
  const result = groupTags([tag(1, 'zeta', 10), tag(2, 'alfa', null)], undefined);
  assert.equal(result.length, 1);
  assert.equal(result[0].label, null);
  assert.deepEqual(names(result[0].tags), ['alfa', 'zeta']);
  assert.deepEqual(groupTags([], undefined), []);
});

test('listTagGroups agrega Libre al final', () => {
  assert.deepEqual(
    listTagGroups(groups).map((g) => g.label),
    ['Activo', 'Tipo', 'Resultado', 'Libre']
  );
  assert.deepEqual(listTagGroups(undefined), [FREE_GROUP]);
});

test('moveTagGroup sube y baja un grupo sin salirse de la lista', () => {
  const ids = (list) => list.map((g) => g.id);
  assert.deepEqual(ids(moveTagGroup(groups, 11, -1)), [11, 10, 12]);
  assert.deepEqual(ids(moveTagGroup(groups, 11, 1)), [10, 12, 11]);
  assert.equal(moveTagGroup(groups, 10, -1), groups);
  assert.equal(moveTagGroup(groups, 12, 1), groups);
  assert.equal(moveTagGroup(groups, 99, 1), groups);
});

test('filterTags no distingue mayúsculas ni tildes', () => {
  const tags = [tag(1, 'Proyección', 11), tag(2, 'NQ', 10)];
  assert.deepEqual(names(filterTags(tags, 'proyeccion')), ['Proyección']);
  assert.deepEqual(names(filterTags(tags, ' nq ')), ['NQ']);
  assert.equal(filterTags(tags, '').length, 2);
});
