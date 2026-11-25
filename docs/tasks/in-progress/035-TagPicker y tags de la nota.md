# Task: frontend — grupos, `TagPicker` y tags de la nota
2026-11-25 · Frontend · Tags por bloque 3/10 · Depende de: 033, 034

Spec: §5.1, §5.2 (parte), §5.3, §5.4 (tags de la nota) y §6 (puntos 1 y 2) de
[tags-bloques.md](../../features/specs/tags-bloques.md).

## Objetivo
La base del frontend: las constantes de grupos, el `TagPicker` (buscar, crear
eligiendo grupo y asignar en un solo flujo) y la fila de tags de la nota con
él, más "Aplicar a bloques existentes". Se corrige la carrera de `toggleTag`,
que ahora pesa más porque los tags de la nota alimentan los defaults de los
bloques. Los tags de cada bloque llegan en la 036.

## Alcance

### 1. `src/constants/tagGroups.js` (§5.1)
- `TAG_GROUPS` del spec con los colores llevados a la paleta de
  `NoteTagManager` (`DEFAULT_COLORS`): activo `#3B82F6`, tipo `#F59E0B`,
  estrategia `#8B5CF6`, resultado `#10B981`, libre `#6B7280`.
- `sortTags(tags)` (orden canónico, `localeCompare` en `'es'`) y
  `groupTags(tags)` (`[{ key, label, tags }]`, sin grupos vacíos).
- Sin `window`: test con `node --test`, como los de `src/utils/`.

### 2. `api/endpoints.js`
`applyNoteTagsToBlocks(noteId)`. `createNoteTag` y `updateNoteTag` ya pasan
`data` tal cual: basta mandar `group_key`. El resto de funciones del §5.1 va
con sus hooks (036, 038 y 039).

### 3. Hooks (`hooks/useNotes.js` y `hooks/useRevisit.js`)
- `noteKeys.block(id)` = `[...noteKeys.all, 'block', id]`. La query llega en la
  038, pero las mutaciones ya la actualizan si está en caché.
- `revisitKeys.tags` = `['revisit', 'tags']`. El spec propone
  `noteKeys.review`, pero en el código `reviewKeys` (`['review']`) es la página
  de Revisión, y Repaso usa `revisitKeys`. Colgando las keys del repaso por tag
  de `revisitKeys`, `useToggleRevisit`, que ya invalida `revisitKeys.all`,
  refresca también esa lista.
- `useApplyNoteTagsToBlocks(noteId)`: `mutationKey` bajo `noteKeys.all`;
  invalida `detail(noteId)` y `revisitKeys.tags`.
- **§6, punto 1: `useAssignTags`** (la carrera de `NoteEditor.jsx:160`):
  - La lista nueva se arma desde la caché
    (`qc.getQueryData(noteKeys.detail(noteId))`) al hacer el toggle, no desde
    lo renderizado. Conviene mover esa lógica al hook (p. ej.
    `mutate({ noteId, toggleTagId })`).
  - Optimistic con `cancelQueries`, snapshot y rollback, como
    `useMoveBlockDnd`. La caché guarda el body (`{ success, data }`): se
    actualiza `old.data`.
  - `scope: { id: 'note-tags-' + noteId }`: TanStack Query (5.90) ejecuta en
    serie las mutaciones del mismo scope. El endpoint es replace-all, y dos
    requests en paralelo podrían confirmarse en otro orden y perder el último
    tag.
  - Invalidar `detail(noteId)` solo cuando no quedan asignaciones de esa nota
    en curso. Si no, el refetch del primero pisa el optimistic del segundo.
    Dentro de `onSuccess`/`onSettled` la propia mutación todavía cuenta: la
    condición es `qc.isMutating({ mutationKey }) === 1`, con el `noteId` en la
    key.
- **§6, punto 2**: `useUpdateTag` y `useDeleteTag` invalidan `noteKeys.all`
  (más `revisitKeys.tags`): los tags se ven en el editor, en cada bloque y en
  el visor.

### 4. Componentes (§5.3)
- `NoteTagBadge`: prop `size="sm"`.
- `components/notes/GroupedTagList.jsx`, presentacional: props `tags`,
  `selectedIds`, `onToggle` y `filterText`. Encabezado por grupo, sin grupos
  vacíos.
- `components/notes/TagPicker.jsx`, popover con el comportamiento del §5.3:
  - Input "Buscar o crear tag…" que filtra en cliente sobre `useNoteTags`.
  - `GroupedTagList` con los seleccionados marcados; un click agrega o quita.
  - Si el texto (con `trim`, sin distinguir mayúsculas) no coincide con ningún
    tag: **Crear «texto» en:** con un botón por grupo y Libre resaltado. Crea
    con `group_key` y el color del grupo, agrega el tag a la caché de
    `noteKeys.tags()` con la respuesta y llama a `onToggle(tag)`, todo en el
    mismo flujo. Si el servidor responde "Ya existe un tag con ese nombre", lo
    muestra el toast global.
  - ↑/↓, Enter (alternar o crear) y Esc (cerrar). Click fuera cierra, como el
    dropdown actual.

### 5. Tags de la nota en `pages/NoteEditor.jsx` (§5.4)
- `TagPicker` en lugar del dropdown de la fila de tags (`:259`); badges en
  orden canónico.
- Texto de ayuda junto a la fila: "Se agregan a los bloques nuevos de esta
  nota".
- Botón **Aplicar a bloques existentes**:
  - Visible si la nota tiene tags y al menos un bloque que no es `reference`.
  - Confirmación inline con el patrón del borrado de `NoteTagManager`: "Se
    agregarán los tags de la nota a sus N bloques. Los tags que ya tengan se
    mantienen."
  - Al terminar, toast (`useToast`) "Tags aplicados a X bloques" con
    `blocks_updated`. Con 0, mejor algo como "Los bloques ya tenían estos
    tags".
- Quitar "Créalos con el ícono Tags en el sidebar".

## Criterios de aceptación
- Desde el picker de la nota se crea un tag eligiendo el grupo: queda con el
  color del grupo, asignado a la nota y visible en el gestor del sidebar.
- Alternar dos tags de la nota rápido (DevTools → Network → Slow 3G) → los dos
  persisten tras recargar.
- "Aplicar a bloques existentes" muestra el toast con el número de bloques, y
  `GET /api/notes/:id` confirma los tags en cada bloque.
- Renombrar un tag en el gestor se refleja en la nota abierta sin recargar.
- El picker se usa solo con teclado.
- `npm run lint`, `npm test` y `npm run build` limpios.

## Notas
- Los tags de bloque todavía no se ven en el editor (036): para comprobarlos,
  el `GET` o las React Query Devtools.
- El contenedor de dev en `:5179` puede servir versiones viejas de archivos
  editados: si un cambio no aparece, probar con un Vite en el host.

## Implementación (2026-11-25)
Hecha. Verificada en Chrome contra el backend: crear desde el picker eligiendo
grupo (solo teclado), tres toggles seguidos con la red retrasada al azar
(300–1800 ms por request) → los tres persisten, sin parpadeo; renombrar en el
gestor se ve en la nota abierta; "Aplicar a bloques existentes" con su toast.

Desviaciones:
- `useAssignTags` pasa a `useToggleNoteTag(noteId)`, que devuelve
  `toggle(tag)`: la lista sale de la caché en el click y el `onMutate` es
  síncrono, así el siguiente toggle ya ve el cambio. El rollback solo se aplica
  si no quedan otras asignaciones en curso (sus listas ya incluyen el cambio).
- `GroupedTagList` acepta además `activeId` (resaltado de teclado) y `emptyText`.
- El filtro del picker no distingue tildes ("proyeccion" encuentra
  "proyección"); `filterTags` en `constants/tagGroups.js`.
