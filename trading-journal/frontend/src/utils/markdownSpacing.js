/**
 * Preserva los saltos de línea en blanco que el usuario escribe en un bloque
 * de texto.
 *
 * Markdown colapsa el espacio vertical: las líneas en blanco iniciales se
 * descartan y varias líneas en blanco seguidas se reducen a un único salto de
 * párrafo. Combinado con `remark-breaks` (que convierte cada `\n` en un `<br>`),
 * basta con que las líneas vacías dejen de estar "vacías" para que sobrevivan:
 * aquí cada línea en blanco se reemplaza por una con un espacio duro (U+00A0),
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
 * Tampoco se toca la línea en blanco que precede a un separador (`---`, `***`,
 * `___`): un `---` necesita una línea en blanco real arriba; si la sustituimos
 * por el espacio duro, Markdown lo interpreta como subrayado de encabezado
 * setext (`<h2>`) en vez de como regla horizontal (`<hr>`).
 *
 * Es una transformación solo de render: el `content` almacenado conserva los
 * `\n` reales, así que la edición muestra exactamente lo que el usuario tecleó.
 */
const NBSP = String.fromCharCode(0xa0); // espacio duro (U+00A0): una linea con esto NO es "blanca" para Markdown
const FENCE = /^\s*(```|~~~)/;
const THEMATIC_BREAK = /^ {0,3}([-_*])(?:[ \t]*\1){2,}[ \t]*$/;

export default function preserveBlankLines(markdown) {
  if (!markdown) return markdown;

  const lines = markdown.split('\n');
  let inFence = false;

  return lines
    .map((line, i) => {
      if (FENCE.test(line)) inFence = !inFence;
      if (inFence || line.trim() !== '') return line;
      // Conservar la línea en blanco si abajo hay un separador (`---`/`***`/`___`),
      // de lo contrario el espacio duro lo degrada a encabezado setext.
      if (THEMATIC_BREAK.test(lines[i + 1] ?? '')) return line;
      return NBSP;
    })
    .join('\n');
}
