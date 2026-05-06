/**
 * Agrupa los nodos raíz por secciones (modelo posicional estilo TradingView).
 * Una nota pertenece a la última sección que la precede en el orden raíz.
 * Las notas anteriores a la primera sección quedan en un grupo con section=null.
 *
 * @param {Array} rootNodes - Notas y secciones del nivel raíz, ordenadas por position
 * @returns {Array<{ section: object|null, items: Array }>}
 */
export function groupBySections(rootNodes) {
  const groups = [];
  let current = { section: null, items: [] };

  for (const node of rootNodes) {
    if (node.type === 'section') {
      groups.push(current);
      current = { section: node, items: [] };
    } else {
      current.items.push(node);
    }
  }

  groups.push(current);
  return groups;
}
