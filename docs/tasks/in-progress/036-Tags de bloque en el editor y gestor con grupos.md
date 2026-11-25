# Task: frontend — tags de bloque en el editor y `NoteTagManager` con grupos
2026-11-25 · Frontend · Tags por bloque 4/10 · Depende de: 035

Spec: §5.2 (hooks de tags de bloque), §5.4 (tags de cada bloque) y §5.5 de
[tags-bloques.md](../../features/specs/tags-bloques.md).

## Objetivo
Ver y editar los tags de cada bloque desde el editor, en desktop y en táctil,
y gestionar los grupos desde el gestor de tags. Cierra la Fase 2.

## Alcance

### 1. Datos
- `api/endpoints.js`: `addBlockTag(blockId, tagId)` y
  `removeBlockTag(blockId, tagId)`.
- `useAddBlockTag({ noteId, blockId })` / `useRemoveBlockTag(…)` (§5.2):
  - `mutationKey: [...noteKeys.all, 'block-tags', blockId]`, para el indicador
    de guardado.
  - `scope: { id: 'block-tags-' + blockId }`: en serie, para que "agregar A" y
    "quitar A" seguidos no lleguen al servidor en otro orden.
  - Optimistic sobre `detail(noteId)` (el bloque dentro de `data.blocks`) y
    sobre `block(blockId)`, si están en caché, con un helper
    `updateBlockTagsInCache`. Rollback en `onError`.
  - En `onSuccess`, reconciliar con los `tags` de la respuesta solo si
    `qc.isMutating({ mutationKey }) === 1` (la propia mutación todavía cuenta
    como en curso).
  - `onSettled`: invalidar `revisitKeys.tags`. No invalidar `detail(noteId)` en
    cada toggle: la nota trae bloques, imágenes, trades y recordatorios.

### 2. `components/notes/BlockTags.jsx`
- Fila de `NoteTagBadge size="sm"` en orden canónico, solo si el bloque tiene
  tags. Un click en la fila abre el `TagPicker` (035) con los hooks de arriba.
- Va en `SortableBlockItem` (`NoteBlockList.jsx`), fuera del contenedor del
  bloque, como `ReminderChips` (`:237`): así no mueve los controles flotantes,
  que se centran en vertical.
- La 038 la reutiliza en el pie del visor: que reciba `block` y `noteId` y no
  dependa de `NoteBlockList`.

### 3. Abrir el picker en un bloque sin tags
- Desktop: botón **Tags** (`Tag` de lucide) en la grilla de acciones flotantes
  (`NoteBlockList.jsx:152`), dentro del grupo `noteActions` (`:178`) y salvo
  en `reference`. La grilla pasa de 7 a 8 botones (2×4).
  - El spec lo pide para cuando el bloque no tiene tags. Mejor dejarlo siempre
    visible, con el icono relleno si tiene tags, como los demás toggles: si
    apareciera y desapareciera, la grilla cambiaría de forma.
- Táctil: entrada **Tags** en `BlockTouchMenu.jsx`, también bajo `noteActions`
  y salvo en `reference`. Un callback `onOpenTags` como `onOpenReminder`; el
  picker se abre anclado al bloque.
- Con `noteActions = false` (contenido de un pendiente, `TodoItem.jsx`) no
  aparece nada.
- Nada de esto en bloques de referencia (D6).

### 4. Bloques nuevos
El spec pide usar los `tags` de la respuesta al crear un bloque. Hoy
`useCreateBlock` no inserta el bloque en caché: invalida `detail(noteId)` y el
bloque aparece con el refetch, que ya trae los tags copiados por la 034. Los
defaults se ven en cuanto aparece el bloque, sin cambios; solo hay que
comprobarlo.

### 5. `NoteTagManager.jsx` (§5.5)
- Crear: selector de grupo, con Libre por defecto. Al elegir un grupo,
  proponer su color.
- Edición inline: nombre, color y grupo.
- Lista agrupada con `groupTags`.
- Confirmación de borrado: "Se quitará de todas las notas y bloques".

## Criterios de aceptación
- Desde el picker de un bloque se crea un tag nuevo eligiendo el grupo, y
  queda asignado en un solo flujo.
- Alternar dos tags de un bloque rápido (Slow 3G) → los dos persisten tras
  recargar.
- Un bloque nuevo en una nota con tags los muestra al aparecer. Un bloque de
  referencia no tiene botón ni fila de tags.
- En modo táctil (DevTools), "Tags" del menú ⋮ abre el picker.
- En un pendiente no aparecen tags de bloque.
- El gestor crea con grupo, cambia el grupo inline y lista por grupos.
- A 375 px la fila de tags y el picker se usan sin zoom.
- `npm run lint`, `npm test` y `npm run build` limpios.

## Notas
- `NoteBlockList.jsx` es grande: integrar sin tocar el DnD ni los
  recordatorios.

## Implementación (2026-11-25)
Hecha. Verificada en Chrome: botón Tags (2×4), crear un tag desde el bloque,
alternar el mismo tag tres veces seguidas con la red retrasada (queda quitado) y
otro dos veces (queda puesto), bloque nuevo con los tags de la nota, referencia
sin botón ni fila, gestor por grupos, picker a 375 px. **El menú táctil no se
probó en navegador** (no se pudo emular `hover: none`); solo revisado en código.

Desviaciones:
- En error se deshace solo ese cambio (el inverso del delta) en vez de restaurar
  un snapshot: con varias mutaciones en curso, un snapshot pisaría las demás.
- Los botones que abren el picker llevan `data-tag-picker-toggle`: el click
  fuera no los cuenta, así un segundo click cierra en vez de cerrar y reabrir.
- El gestor muestra el error del servidor (`err.message`); antes leía
  `err.response…`, que el interceptor de axios no deja, y caía siempre en el
  mensaje genérico.
