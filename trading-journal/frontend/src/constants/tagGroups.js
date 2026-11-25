// Grupos fijos de los tags de notas (note_tags.group_key). Tiene que coincidir
// con TAG_GROUPS del backend (backend/src/constants/tagGroups.js) y con el CHECK
// de la migración 030. El orden es el canónico: primero por grupo, luego por
// nombre. `defaultColor` es el color con el que nace un tag creado en ese grupo
// (colores de la paleta de NoteTagManager).
//
// Sin window/document: lo prueba `node --test` (tagGroups.test.js).
export const TAG_GROUPS = [
  { key: 'activo', label: 'Activo', defaultColor: '#3B82F6' },
  { key: 'tipo', label: 'Tipo', defaultColor: '#F59E0B' },
  { key: 'estrategia', label: 'Estrategia', defaultColor: '#8B5CF6' },
  { key: 'resultado', label: 'Resultado', defaultColor: '#10B981' },
  { key: 'libre', label: 'Libre', defaultColor: '#6B7280' },
];

export const DEFAULT_TAG_GROUP = 'libre';

const GROUP_INDEX = new Map(TAG_GROUPS.map((g, i) => [g.key, i]));

// Un tag sin group_key (o con uno desconocido) cuenta como Libre.
const groupIndex = (key) => GROUP_INDEX.get(key) ?? GROUP_INDEX.get(DEFAULT_TAG_GROUP);

export const getTagGroup = (key) => TAG_GROUPS[groupIndex(key)];

const compareTags = (a, b) =>
  groupIndex(a.group_key) - groupIndex(b.group_key) ||
  a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });

/** Copia de `tags` en orden canónico: por grupo según TAG_GROUPS y luego por nombre. */
export const sortTags = (tags = []) => [...tags].sort(compareTags);

/** `[{ key, label, tags }]` en orden canónico, sin grupos vacíos. */
export const groupTags = (tags = []) => {
  const sorted = sortTags(tags);
  return TAG_GROUPS.map(({ key, label }) => ({
    key,
    label,
    tags: sorted.filter((t) => getTagGroup(t.group_key).key === key),
  })).filter((g) => g.tags.length > 0);
};

// Minúsculas y sin tildes: "proyeccion" encuentra "proyección".
export const normalizeTagName = (text = '') =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Tags cuyo nombre contiene `text` (sin distinguir mayúsculas ni tildes). */
export const filterTags = (tags = [], text = '') => {
  const needle = normalizeTagName(text);
  if (!needle) return tags;
  return tags.filter((t) => normalizeTagName(t.name).includes(needle));
};
