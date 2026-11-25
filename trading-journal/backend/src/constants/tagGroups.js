// Grupos fijos de los tags de notas (columna note_tags.group_key). Tiene que
// coincidir con el CHECK de database/030_migration_block_tags.sql: agregar un
// grupo implica una migración nueva más esta lista y la del frontend
// (frontend/src/constants/tagGroups.js). El orden es el canónico de los tags.
export const TAG_GROUPS = ['activo', 'tipo', 'estrategia', 'resultado', 'libre'];
export const DEFAULT_TAG_GROUP = 'libre';

// Topes del repaso por tag (GET /api/notes/blocks/by-tags).
export const TAG_REVIEW_MAX_ITEMS = 500;
export const TAG_REVIEW_MAX_TAGS = 50;

// Color con el que nace un tag creado en cada grupo (desde el TagPicker o el
// script de migración). Igual que los defaultColor de frontend/src/constants/tagGroups.js.
export const TAG_GROUP_COLORS = {
  activo: '#3B82F6',
  tipo: '#F59E0B',
  estrategia: '#8B5CF6',
  resultado: '#10B981',
  libre: '#6B7280',
};
