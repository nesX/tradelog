import { visit, SKIP } from 'unist-util-visit';

/**
 * Neutraliza directivas accidentales de `remark-directive`.
 *
 * `remark-directive` interpreta cualquier `:` seguido de un nombre como una
 * directiva inline (`textDirective`) o de hoja (`leafDirective`). Eso rompe
 * texto cotidiano como horas (`19:44:50`), ratios (`1:2`) o `clave:valor`,
 * porque `remark-directive-rehype` luego convierte cada directiva en un
 * elemento cuyo tag es el nombre de la directiva. Un nombre como `50` produce
 * `<50>`, y React lanza `DOMException: Invalid element name` al hacer
 * `document.createElement('50')` (los tags no pueden empezar por dígito).
 *
 * La app solo usa la directiva contenedora `:::more`, así que toda directiva
 * de texto/hoja —y cualquier contenedora distinta de `more`— es siempre
 * involuntaria. Este transformer las revierte a su texto literal de origen
 * usando los offsets de posición del nodo (react-markdown siempre parsea desde
 * string, por lo que los offsets están presentes). Debe correr ANTES de
 * `remark-directive-rehype`.
 */
const ALLOWED_CONTAINER_NAMES = new Set(['more']);

export default function remarkSafeDirectives() {
  return (tree, file) => {
    const source = typeof file?.value === 'string' ? file.value : String(file?.value ?? '');

    visit(tree, (node, index, parent) => {
      if (parent == null || index == null) return;

      const isText = node.type === 'textDirective';
      const isLeaf = node.type === 'leafDirective';
      const isStrayContainer =
        node.type === 'containerDirective' && !ALLOWED_CONTAINER_NAMES.has(node.name);

      if (!isText && !isLeaf && !isStrayContainer) return;

      parent.children[index] = {
        type: 'text',
        value: literalFor(node, source, isLeaf ? '::' : isText ? ':' : ':::'),
        position: node.position,
      };
      // No descender en los hijos del nodo ya reemplazado.
      return [SKIP, index];
    });
  };
}

/** Reconstruye el texto original de una directiva, con fallback sin offsets. */
function literalFor(node, source, marker) {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (typeof start === 'number' && typeof end === 'number' && source) {
    return source.slice(start, end);
  }
  return marker + (node.name || '');
}
