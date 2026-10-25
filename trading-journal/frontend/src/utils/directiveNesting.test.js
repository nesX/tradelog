import test from 'node:test';
import assert from 'node:assert/strict';

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkDirective from 'remark-directive';

import normalizeDirectiveNesting from './directiveNesting.js';
import remarkMore from './remarkMore.js';
import remarkSafeDirectives from './remarkSafeDirectives.js';

/**
 * Tests del preprocesado que permite anidar `:::more` escribiendo todas las
 * vallas con `:::`. Ver directiveNesting.js.
 *
 * Corre con: `npm test` (node:test, sin runner extra).
 */

/** Preprocesa y parsea como en NoteTextBlock/NoteCalloutBlock → mdast. */
function toMdast(md) {
  const source = normalizeDirectiveNesting(md);
  const processor = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(remarkMore)
    .use(remarkSafeDirectives);
  return processor.runSync(processor.parse(source), { value: source });
}

/** Árbol reducido a { title, text, children } por cada `more`. */
function outline(node) {
  const out = [];
  for (const child of node.children || []) {
    if (child.type === 'containerDirective' && child.name === 'more') {
      out.push({
        title: child.attributes?.['data-more-title'] ?? null,
        text: ownText(child),
        children: outline(child),
      });
    } else {
      out.push(...outline(child));
    }
  }
  return out;
}

/** Texto del nodo sin entrar en los `more` hijos. */
function ownText(node) {
  return (node.children || [])
    .map((c) => {
      if (c.type === 'containerDirective' && c.name === 'more') return '';
      if (c.type === 'text') return c.value;
      return ownText(c);
    })
    .filter(Boolean)
    .join('|');
}

// --- Reescritura de vallas ---------------------------------------------------

test('sin directivas devuelve el texto intacto', () => {
  const md = 'Hola 19:44:50\n\n- item';
  assert.equal(normalizeDirectiveNesting(md), md);
  assert.equal(normalizeDirectiveNesting(''), '');
  assert.equal(normalizeDirectiveNesting(undefined), undefined);
});

test('un :::more sin anidar no cambia', () => {
  const md = ':::more[A]\nuno\n:::';
  assert.equal(normalizeDirectiveNesting(md), md);
});

test('el externo recibe un : más que el interno', () => {
  const md = ':::more[A]\nuno\n:::more[B]\ndos\n:::\ntres\n:::';
  assert.equal(
    normalizeDirectiveNesting(md),
    '::::more[A]\nuno\n:::more[B]\ndos\n:::\ntres\n::::'
  );
});

test('tres niveles: 5 / 4 / 3', () => {
  const md = ':::more[A]\n:::more[B]\n:::more[C]\nx\n:::\n:::\n:::';
  assert.equal(
    normalizeDirectiveNesting(md),
    ':::::more[A]\n::::more[B]\n:::more[C]\nx\n:::\n::::\n:::::'
  );
});

test('respeta vallas que el usuario ya alargó a mano', () => {
  const md = '::::more[A]\n:::more[B]\nx\n:::\n::::';
  assert.equal(normalizeDirectiveNesting(md), md);
});

test('ignora ::: dentro de bloques de código', () => {
  const md = ':::more[A]\n```\n:::more[B]\n:::\n```\n:::';
  assert.equal(normalizeDirectiveNesting(md), md);
});

// --- Parseo resultante -------------------------------------------------------

test('more anidado: el interno queda dentro del externo y nada se escapa', () => {
  const tree = toMdast(':::more[A]\nuno\n:::more[B]\ndos\n:::\ntres\n:::\nfuera');
  assert.deepEqual(outline(tree), [
    { title: 'A', text: 'uno|tres', children: [{ title: 'B', text: 'dos', children: [] }] },
  ]);
  assert.equal(ownText(tree), 'fuera', 'el texto tras el cierre queda fuera');
});

test('hermanos anidados y tres niveles', () => {
  const md = [
    ':::more[A]',
    ':::more[B]',
    ':::more[C]',
    'c',
    ':::',
    ':::',
    ':::more[D]',
    'd',
    ':::',
    ':::',
  ].join('\n');
  assert.deepEqual(outline(toMdast(md)), [
    {
      title: 'A',
      text: '',
      children: [
        { title: 'B', text: '', children: [{ title: 'C', text: 'c', children: [] }] },
        { title: 'D', text: 'd', children: [] },
      ],
    },
  ]);
});

test('externo sin cierre llega hasta el final sin perder el interno', () => {
  const tree = toMdast(':::more[A]\n:::more[B]\ndos\n:::\ntres');
  assert.deepEqual(outline(tree), [
    { title: 'A', text: 'tres', children: [{ title: 'B', text: 'dos', children: [] }] },
  ]);
});
