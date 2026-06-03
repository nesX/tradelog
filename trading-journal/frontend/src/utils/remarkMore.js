import { visit } from 'unist-util-visit';

/**
 * Plugin remark mínimo para la directiva `:::more[Título]`.
 *
 * `remark-directive` parsea el label `[Título]` como un primer hijo de tipo
 * `paragraph` marcado con `data.directiveLabel`. Ese flag se pierde al pasar a
 * hast, por lo que el label terminaría renderizándose como un párrafo más del
 * contenido. Este transformer corre ANTES de `remark-directive-rehype` y:
 *
 *   1. Extrae el texto del párrafo-label a `hProperties['data-more-title']`.
 *   2. Elimina ese párrafo de los hijos para que no aparezca en el contenido.
 *
 * El título queda así disponible como prop en el componente mapeado
 * (`<more data-more-title="…">`). Si no hay label, no se añade nada y el
 * componente usa su fallback ("Ver más").
 *
 * No soporta anidamiento: un `:::more` dentro de otro lo parsea `remark-directive`
 * como contenido normal del externo, sin romperlo.
 */
export default function remarkMore() {
  return (tree) => {
    visit(tree, 'containerDirective', (node) => {
      if (node.name !== 'more') return;

      const children = node.children || [];
      const first = children[0];
      const isLabel = first?.type === 'paragraph' && first.data?.directiveLabel;

      if (isLabel) {
        const title = toText(first).trim();
        node.children = children.slice(1);
        if (title) {
          node.attributes = { ...(node.attributes || {}), 'data-more-title': title };
        }
      }
    });
  };
}

/** Concatena el texto plano de un nodo mdast (suficiente para el label). */
function toText(node) {
  if (node.type === 'text') return node.value;
  if (!node.children) return '';
  return node.children.map(toText).join('');
}
