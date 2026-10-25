/**
 * Permite anidar directivas contenedoras (`:::more` dentro de `:::more`)
 * escribiéndolas todas con `:::`, como lo haría el usuario intuitivamente.
 *
 * `remark-directive` sí soporta anidamiento, pero solo si el contenedor externo
 * usa MÁS `:` que el interno:
 *
 *   ::::more[Externo]
 *   :::more[Interno]
 *   ...
 *   :::
 *   ::::
 *
 * Con el mismo número de `:` en ambos, el primer `:::` de cierre cierra el
 * EXTERNO y el resto del contenido sale como texto suelto. Esta función empareja
 * aperturas y cierres por profundidad (como paréntesis) y reescribe el número de
 * `:` de cada valla para que todo contenedor tenga uno más que el más largo de
 * sus hijos. Así el markdown anterior puede escribirse con `:::` en todas las
 * líneas y se parsea igual.
 *
 * Si el usuario ya escribió más `:` a mano se respetan (nunca se reducen), y un
 * cierre con menos `:` que su apertura se deja intacto, igual que hace
 * `remark-directive`. Un contenedor sin cierre llega hasta el final del texto.
 *
 * Las líneas dentro de un bloque de código cercado (``` o ~~~) se ignoran.
 *
 * Es una transformación solo de render: el `content` almacenado conserva lo que
 * el usuario tecleó.
 */
const FENCE = /^\s*(```|~~~)/;
const OPEN = /^ {0,3}(:{3,})[a-zA-Z][\w-]*(\[.*\])?(\{.*\})?[ \t]*$/;
const CLOSE = /^ {0,3}(:{3,})[ \t]*$/;

export default function normalizeDirectiveNesting(markdown) {
  if (!markdown || !markdown.includes(':::')) return markdown;

  const lines = markdown.split('\n');
  const stack = []; // contenedores abiertos: { open, colons, inner }
  const fences = []; // { open, close, colons } listos para reescribir
  let inFence = false;

  // Al cerrar un contenedor fija su nº de `:` y lo propaga al padre.
  const finish = (node, close) => {
    const colons = Math.max(node.colons, node.inner + 1);
    fences.push({ open: node.open, close, colons });
    const parent = stack.at(-1);
    if (parent) parent.inner = Math.max(parent.inner, colons);
  };

  lines.forEach((line, i) => {
    if (FENCE.test(line)) inFence = !inFence;
    if (inFence) return;

    const close = CLOSE.exec(line);
    if (close) {
      if (stack.length && close[1].length >= stack.at(-1).colons) finish(stack.pop(), i);
      return;
    }

    const open = OPEN.exec(line);
    if (open) stack.push({ open: i, colons: open[1].length, inner: 0 });
  });
  while (stack.length) finish(stack.pop(), null);

  for (const { open, close, colons } of fences) {
    lines[open] = lines[open].replace(/:{3,}/, ':'.repeat(colons));
    if (close !== null) lines[close] = lines[close].replace(/:{3,}/, ':'.repeat(colons));
  }
  return lines.join('\n');
}
