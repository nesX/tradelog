import { ChevronRight } from 'lucide-react';

/**
 * Bloque colapsable renderizado desde la directiva `:::more[Título]`.
 *
 * Componente puramente presentacional: SIN estado, SIN efectos, SIN persistencia.
 * Usa `<details>`/`<summary>` nativos (accesibilidad por teclado + ARIA gratis) y
 * NUNCA pasa el atributo `open`, por lo que siempre arranca cerrado (y al recargar
 * vuelve a cerrado, comportamiento nativo esperado).
 *
 * El título llega vía `node.properties.dataMoreTitle` (lo inyecta el plugin
 * `remarkMore` a partir del label de la directiva). Si falta, usa "Ver más".
 * `children` es el contenido ya renderizado por react-markdown.
 */
const MoreBlock = ({ node, children }) => {
  const title = node?.properties?.dataMoreTitle || 'Ver más';

  return (
    <details
      className="group/more rounded-xl
                 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary
        className="flex items-center gap-1.5 cursor-pointer select-none list-none
                   py-2 text-sm font-semibold
                   text-gray-700 dark:text-gray-200
                   hover:text-gray-900 dark:hover:text-white transition-colors"
      >
        <ChevronRight
          className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 transition-transform duration-150
                     group-open/more:rotate-90"
        />
        <span className="truncate">{title}</span>
      </summary>
      <div className="pb-3 pt-1">{children}</div>
    </details>
  );
};

export default MoreBlock;
