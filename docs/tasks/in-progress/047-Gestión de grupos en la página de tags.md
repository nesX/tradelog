# Task: frontend — grupos desde la API y gestión de grupos en `/tags`
2026-11-25 · Frontend · Búsqueda y tags 5/6 · Depende de: 045, 046

## Objetivo
Que el frontend lea los grupos del usuario desde la API en lugar de la lista
fija, y que la página `/tags` permita crear, renombrar, recolorear, ordenar y
borrar grupos.

## Alcance

### 1. `constants/tagGroups.js` → helpers sobre la lista de grupos
- Se van `TAG_GROUPS` y `DEFAULT_TAG_GROUP`. Los helpers pasan a recibir la
  lista de grupos del usuario:
  - `sortTags(tags, groups)`.
  - `groupTags(tags, groups)` → `[{ id, label, color, tags }]`, con Libre
    (`id: null`) siempre al final.
  - `getTagGroup(groups, groupId)`: un id desconocido o `null` cuenta como
    Libre.
- `FREE_GROUP = { id: null, label: 'Libre', color: '#6B7280' }`.
- `filterTags` y `normalizeTagName` no cambian.
- Sigue sin `window`/`document`. Actualizar `tagGroups.test.js`.
- Si el archivo deja de tener constantes, moverlo a `utils/tagGroups.js`.

### 2. Datos
- `api/endpoints.js`: `getTagGroups`, `createTagGroup`, `updateTagGroup`,
  `deleteTagGroup` y `reorderTagGroups`.
- `noteKeys.tagGroups()` = `[...noteKeys.all, 'tag-groups']` y
  `useTagGroups()`.
- Mutaciones:
  - Crear, renombrar y recolorear: invalidar `tagGroups`. Los tags apuntan al
    grupo por id, así que nombre y color salen de la lista de grupos.
  - Borrar: invalidar `tagGroups`, `tags`, `detail`, `block`,
    `revisitKeys.tags` y `search`. Los tags del grupo cambian de `group_id`.
  - Reordenar: optimistic sobre `tagGroups`, rollback en `onError`, e
    invalidar `tags` al terminar (el orden de los tags cambia en las
    respuestas).
- Los tags usan `group_id` en vez de `group_key` en todo: crear, editar,
  `TagPicker` (`:80`) y los caches optimistas de la 036.

### 3. Consumidores
Pasar `groups` (de `useTagGroups`) a todo lo que agrupa u ordena:
- `GroupedTagList`.
- `TagPicker`: el selector de grupo para crear y el color que propone.
- `utils/tagReview.js` (`:62`) y su test.
- La página de `/tags` (045) y la de `/buscar` (044).

Mientras los grupos cargan, mostrar los tags sin agrupar o un spinner, nunca
todos bajo Libre (sería un parpadeo).

### 4. Gestión en `/tags`
- Botón **Nuevo grupo**: nombre y color.
- En la cabecera de cada tarjeta de grupo:
  - Renombrar inline.
  - Color: también es el que se propone a los tags nuevos del grupo.
  - Subir y bajar con ↑/↓, que andan en táctil sin DnD.
  - Borrar con confirmación: "Sus N tags pasarán a Libre. No se quitan de
    ninguna nota ni bloque".
- La tarjeta Libre no tiene acciones y va siempre al final.
- El selector de grupo de las filas de tag lista los grupos del usuario más
  Libre.
- Errores del servidor en línea: nombre repetido, "Libre" reservado y el tope
  de 20.

## Criterios de aceptación
- Crear un grupo lo agrega al final. Se le pueden crear tags desde la tarjeta
  y desde el `TagPicker` de un bloque.
- Renombrar o recolorear un grupo se ve al momento en `/tags`, en el picker,
  en Repaso por tag y en `/buscar`.
- Reordenar grupos cambia el orden en todos lados y sobrevive a una recarga.
- Borrar un grupo deja sus tags en Libre, todavía asignados.
- Un link guardado de Repaso por tag (`?tab=tags&tags=…`) sigue funcionando
  tras renombrar grupos.
- A 375 px se usa sin zoom.
- `npm run lint`, `npm test` y `npm run build` limpios.

## Implementación (2026-11-25)
Hecha junto con la 045. Verificada en el navegador (ver 045): crear un grupo (va
al final y abre su formulario de tag), "Libre" y nombre repetido en línea,
renombrar, borrar ("Su tag pasará a Libre…", el tag queda en Libre), ↑/↓ con el
orden igual tras recargar, crear un tag en un grupo desde el TagPicker de una
nota (nace con el color del grupo y en orden canónico), Repaso por tag con un
link guardado y `/buscar` con los grupos del usuario. `npm run lint`, `npm test`
y `npm run build` limpios.

Desviaciones:
- Los helpers pasaron a `utils/tagGroups.js` (el archivo ya es de helpers;
  `FREE_GROUP` es lo único constante). `groups` sin cargar (`undefined`) da una
  sola lista por nombre sin encabezado; `[]` es "sin grupos", todo en Libre.
  Agrega `listTagGroups` (grupos + Libre, para los selectores) y `moveTagGroup`.
- `GroupedTagList` y `TagPicker` llaman a `useTagGroups()` ellos mismos: los
  consumidores no pasan `groups`. Los optimistic de tags leen los grupos del caché
  (`getCachedTagGroups`).
- Borrar y reordenar grupos invalidan `noteKeys.all` y el repaso por tag (un
  superconjunto de lo pedido: también la nota abierta, cuyo orden de tags cambia).
- Reordenar: `useMoveTagGroup` arma la lista entera desde la caché en el click y
  va en serie (`scope`), como `useToggleNoteTag`; rollback y refresco cuando no
  queda ninguno en curso.
- Un grupo nuevo propone el primer color de la paleta que no usa otro grupo.
- Crear un tag invalida también `tagGroups` (el `tag_count`).
