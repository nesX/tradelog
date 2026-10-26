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

/**
 * Ids del subtree de una nota (incluyéndola) a partir de la lista plana del tree.
 *
 * @param {Array} flat - Lista plana de notas (treeData.flat)
 * @param {number} rootId - Id de la nota raíz del subtree
 * @returns {Set<number>}
 */
export function subtreeIds(flat, rootId) {
  const childrenByParent = new Map();
  for (const n of flat) {
    if (!childrenByParent.has(n.parent_note_id)) childrenByParent.set(n.parent_note_id, []);
    childrenByParent.get(n.parent_note_id).push(n.id);
  }
  const ids = new Set([rootId]);
  const stack = [rootId];
  while (stack.length) {
    for (const childId of childrenByParent.get(stack.pop()) ?? []) {
      if (!ids.has(childId)) {
        ids.add(childId);
        stack.push(childId);
      }
    }
  }
  return ids;
}
