// Grupos de tags de cada usuario (tabla note_tag_groups, migración 031). Un tag
// sin grupo (note_tags.group_id NULL) está en "Libre": no es una fila, no se
// puede crear, renombrar ni borrar, y va siempre al final.
export const TAG_GROUPS_MAX = 20;
export const FREE_GROUP_NAME = 'Libre';
// Color de Libre: el de un tag creado sin grupo (frontend: FREE_GROUP en utils/tagGroups.js).
export const FREE_GROUP_COLOR = '#6B7280';

// Topes del repaso por tag (GET /api/notes/blocks/by-tags) y de la búsqueda.
export const TAG_REVIEW_MAX_ITEMS = 500;
export const TAG_REVIEW_MAX_TAGS = 50;
