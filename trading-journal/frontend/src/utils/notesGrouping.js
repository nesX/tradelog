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

/**
 * Ruta de ancestros de una nota ("Abuelo › Padre") a partir de la lista plana del tree.
 * Sirve para distinguir sub-notas con títulos parecidos en listados planos (búsquedas).
 *
 * @param {string|null} parentId - parent_note_id de la nota
 * @param {Array} flat - Lista plana de notas (treeData.flat)
 * @returns {string|null} null si la nota es raíz
 */
export function buildBreadcrumb(parentId, flat) {
  if (!parentId || !flat) return null;
  const map = {};
  for (const n of flat) map[n.id] = n;

  const path = [];
  let current = map[parentId];
  while (current) {
    path.unshift(current.title || 'Sin título');
    current = current.parent_note_id ? map[current.parent_note_id] : null;
  }
  return path.length > 0 ? path.join(' › ') : null;
}
