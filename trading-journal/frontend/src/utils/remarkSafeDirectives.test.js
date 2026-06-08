import test from 'node:test';
import assert from 'node:assert/strict';

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkDirective from 'remark-directive';
import remarkDirectiveRehype from 'remark-directive-rehype';
import remarkRehype from 'remark-rehype';
import { visit } from 'unist-util-visit';

import remarkSafeDirectives from './remarkSafeDirectives.js';
import remarkMore from './remarkMore.js';

/**
 * Tests del plugin que neutraliza directivas accidentales causadas por `:` en
 * texto cotidiano (horas, ratios, clave:valor). Ver remarkSafeDirectives.js.
 *
 * Corre con: `npm test` (node:test, sin runner extra).
 */

/** Parsea markdown y aplica directive + safeDirectives → árbol mdast. */
function toMdast(md) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(remarkMore)
    .use(remarkSafeDirectives);
  return processor.runSync(processor.parse(md), { value: md });
}

/** Recorre todo el texto plano de un árbol mdast/hast. */
function collectText(tree) {
  let out = '';
  visit(tree, 'text', (n) => {
    out += n.value;
  });
  return out;
}

/** ¿Quedó alguna directiva de texto/hoja sin neutralizar? */
function hasStrayDirective(tree) {
  let found = false;
  visit(tree, (n) => {
    if (n.type === 'textDirective' || n.type === 'leafDirective') found = true;
    if (n.type === 'containerDirective' && n.name !== 'more') found = true;
  });
  return found;
}

// --- Casos que ANTES rompían o corrompían el render ---------------------------

// `text` = texto plano esperado tras renderizar (sin los markers de markdown,
// p.ej. `**` se consume como negrita y no aparece en el texto).
const colonCases = [
  {
    name: 'hora HH:MM:SS dentro de negrita',
    md: '**BTCUSDT 15/04/2026 19:44:50**',
    text: 'BTCUSDT 15/04/2026 19:44:50',
  },
  { name: 'hora simple HH:MM', md: 'Entrada a las 09:30 en punto', text: 'Entrada a las 09:30 en punto' },
  { name: 'ratio riesgo/beneficio 1:2', md: 'Riesgo 1:2 en la operacion', text: 'Riesgo 1:2 en la operacion' },
  {
    name: 'clave:valor (nombre alfabetico)',
    md: 'estado:abierto y motivo:breakout',
    text: 'estado:abierto y motivo:breakout',
  },
  { name: 'multiples colons seguidos', md: 'rango 10:00:00 - 12:30:45 hoy', text: 'rango 10:00:00 - 12:30:45 hoy' },
  { name: 'colon al final de palabra', md: 'Nota: revisar despues', text: 'Nota: revisar despues' },
  { name: 'directiva con label y atributos', md: 'texto :foo[bar]{x=1} fin', text: 'texto :foo[bar]{x=1} fin' },
];

for (const { name, md, text } of colonCases) {
  test(`neutraliza directiva accidental: ${name}`, () => {
    const tree = toMdast(md);
    assert.equal(hasStrayDirective(tree), false, 'no debe quedar ninguna directiva');
    assert.equal(collectText(tree), text, 'el texto literal debe preservarse intacto');
  });
}

// --- La directiva legitima :::more NO debe tocarse ---------------------------

test('preserva la directiva contenedora :::more', () => {
  const md = ':::more[Detalles]\nContenido oculto\n:::';
  const tree = toMdast(md);

  let moreNode = null;
  visit(tree, 'containerDirective', (n) => {
    if (n.name === 'more') moreNode = n;
  });

  assert.ok(moreNode, 'el contenedor more debe sobrevivir');
  assert.match(collectText(tree), /Contenido oculto/);
});

// --- Integracion: el árbol hast no debe tener tags HTML inválidos ------------

const VALID_TAG = /^[a-zA-Z][a-zA-Z0-9-]*$/;

/** Pipeline completo hasta hast, como hace react-markdown. */
function toHast(md) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(remarkMore)
    .use(remarkSafeDirectives)
    .use(remarkDirectiveRehype)
    .use(remarkRehype, { allowDangerousHtml: true });
  return processor.runSync(processor.parse(md), { value: md });
}

test('el timestamp 19:44:50 no produce el tag invalido <50>', () => {
  // Reproduce el crash original: document.createElement('50') -> DOMException.
  const tree = toHast('**BTCUSDT 15/04/2026 19:44:50**');
  const invalid = [];
  visit(tree, 'element', (n) => {
    if (!VALID_TAG.test(n.tagName)) invalid.push(n.tagName);
  });
  assert.deepEqual(invalid, [], `tags invalidos encontrados: ${invalid.join(', ')}`);
  assert.match(collectText(tree), /BTCUSDT 15\/04\/2026 19:44:50/);
});
