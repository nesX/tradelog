// Grupos de los tags de notas. Cada usuario tiene los suyos (GET
// /api/notes/tag-groups, ya en orden); un tag apunta a su grupo por `group_id`, y
// sin grupo (null, o un id que no está en la lista) está en Libre, que no es una
// fila: va siempre al final y no se puede renombrar ni borrar.
//
// Los helpers reciben la lista de grupos de la API. `groups` null/undefined
// significa "todavía no cargó": los tags van en una sola lista por nombre, sin
// encabezado, en vez de aparecer todos bajo Libre y reacomodarse al llegar.
//
// Sin window/document: lo prueba `node --test` (tagGroups.test.js).

export const FREE_GROUP = { id: null, label: 'Libre', color: '#6B7280' };

const toGroup = ({ id, name, color }) => ({ id, label: name, color });

/** Grupo de un tag como `{ id, label, color }`; Libre si el id es null o desconocido. */
export const getTagGroup = (groups, groupId) => {
  const group = groupId == null ? null : groups?.find((g) => g.id === groupId);
  return group ? toGroup(group) : FREE_GROUP;
};

/** Grupos del usuario más Libre al final, como `{ id, label, color }` (selectores de grupo). */
export const listTagGroups = (groups) => [...(groups ?? []).map(toGroup), FREE_GROUP];

const byName = (a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });

/**
 * Copia de `tags` en orden canónico: por el orden de su grupo (Libre al final) y
 * luego por nombre. Sin grupos cargados, solo por nombre.
 */
export const sortTags = (tags = [], groups) => {
  if (!groups) return [...tags].sort(byName);
  const index = new Map(groups.map((g, i) => [g.id, i]));
  const at = (tag) => index.get(tag.group_id) ?? groups.length;
  return [...tags].sort((a, b) => at(a) - at(b) || byName(a, b));
};

/**
 * `[{ id, label, color, tags }]` en orden canónico, con Libre al final. Sin los
 * grupos vacíos, salvo con `includeEmpty` (la página de tags muestra todos). Sin
 * grupos cargados, un solo grupo sin encabezado (`label: null`).
 */
export const groupTags = (tags = [], groups, { includeEmpty = false } = {}) => {
  if (!groups) return tags.length > 0 ? [{ id: undefined, label: null, color: null, tags: sortTags(tags) }] : [];
  const result = listTagGroups(groups).map((group) => ({ ...group, tags: [] }));
  const byId = new Map(result.map((group) => [group.id, group]));
  for (const tag of sortTags(tags, groups)) (byId.get(tag.group_id ?? null) ?? byId.get(null)).tags.push(tag);
  return includeEmpty ? result : result.filter((group) => group.tags.length > 0);
};

/** Lista de grupos con `groupId` una posición más arriba (-1) o más abajo (+1). */
export const moveTagGroup = (groups, groupId, delta) => {
  const from = groups.findIndex((g) => g.id === groupId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= groups.length) return groups;
  const result = [...groups];
  [result[from], result[to]] = [result[to], result[from]];
  return result;
};

// Minúsculas y sin tildes: "proyeccion" encuentra "proyección".
export const normalizeTagName = (text = '') =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/** Tags cuyo nombre contiene `text` (sin distinguir mayúsculas ni tildes). */
export const filterTags = (tags = [], text = '') => {
  const needle = normalizeTagName(text);
  if (!needle) return tags;
  return tags.filter((t) => normalizeTagName(t.name).includes(needle));
};
