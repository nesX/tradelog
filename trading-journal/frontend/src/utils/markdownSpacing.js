/**
 * Preserva los saltos de línea en blanco que el usuario escribe en un bloque
 * de texto.
 *
 * Markdown colapsa el espacio vertical: las líneas en blanco iniciales se
 * descartan y varias líneas en blanco seguidas se reducen a un único salto de
 * párrafo. Combinado con `remark-breaks` (que convierte cada `\n` en un `<br>`),
 * basta con que las líneas vacías dejen de estar "vacías" para que sobrevivan:
 * aquí cada línea en blanco se reemplaza por una con un espacio duro (` `),
 * de modo que se renderiza como una línea vacía visible.
 *
 * Resultado WYSIWYG, como un editor de texto plano:
 *   1 Enter  → salto de línea (vía remark-breaks)
 *   2 Enter  → una línea en blanco de separación
 *   N Enter  → N-1 líneas en blanco
 *
 * Las líneas dentro de un bloque de código cercado (``` o ~~~) se dejan
 * intactas para no corromper el contenido literal.
 *
 * Es una transformación solo de render: el `content` almacenado conserva los
 * `\n` reales, así que la edición muestra exactamente lo que el usuario tecleó.
 */
const NBSP = ' ';
const FENCE = /^\s*(```|~~~)/;

export default function preserveBlankLines(markdown) {
  if (!markdown) return markdown;

  const lines = markdown.split('\n');
  let inFence = false;

  return lines
    .map((line) => {
      if (FENCE.test(line)) inFence = !inFence;
      if (!inFence && line.trim() === '') return NBSP;
      return line;
    })
    .join('\n');
}
