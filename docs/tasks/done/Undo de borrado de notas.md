# Task: undo de borrado de notas (toast "Deshacer" + restore)
2026-08-05 · Backend + Frontend · Impacto UX: MEDIO-ALTO

## Objetivo
El backend ya hace soft-delete recursivo y ahora tiene purga diferida con gracia
de `NOTE_PURGE_DAYS` (30 por defecto) — está todo listo para deshacer un borrado
sin coste. Hoy borrar es un `window.confirm` irreversible en la práctica (la
fila existe pero no hay endpoint ni UI para restaurar).

## Implementación propuesta

### 1. Backend: endpoint de restore
`POST /api/notes/:id/restore` (router + controller + service + repo):

- Restaurar la nota Y los descendientes que cayeron en el MISMO borrado.
  Detalle importante: `softDelete` marca todo el subtree con el mismo `NOW()` y
  (tras el bug-fix) NO re-marca descendientes ya borrados antes. Eso permite
  distinguir: restaurar solo las filas cuyo `deleted_at` == el `deleted_at` de
  la nota raíz restaurada; un descendiente borrado previamente (timestamp más
  viejo) permanece borrado. CTE recursivo espejo del de `softDelete` (con el
  mismo guard de profundidad) + `UPDATE ... SET deleted_at = NULL WHERE
  deleted_at = $rootDeletedAt`.
- Validaciones: la nota existe, es del usuario, y `deleted_at IS NOT NULL`
  (404 si ya fue purgada por el job — el toast de undo expira mucho antes que
  la gracia, pero el endpoint debe ser robusto).
- Si el padre de la nota restaurada sigue borrado, restaurar como nota raíz
  (`parent_note_id = NULL`) para que no quede huérfana invisible. Caso raro
  (solo posible restaurando via API fuera de la ventana del toast), pero barato
  de cubrir.

### 2. Frontend: toast con acción "Deshacer"
El sistema de Toast (`components/common/Toast.jsx:101-106`) solo soporta
mensaje — extenderlo con acción opcional:

```js
addToast('success', 'Nota eliminada', { action: { label: 'Deshacer', onClick }, duration: 6000 })
```

Al borrar una nota (`pages/Notes.jsx` → `handleDeleteNote`): tras el
`deleteNote.mutateAsync`, mostrar el toast 6s. "Deshacer" llama al endpoint de
restore e invalida `noteKeys.tree()` (+ re-navegar a la nota si el usuario
estaba en ella; ver el `removeQueries` que hoy hace el handler).

### 3. Unificar la confirmación
- Reemplazar el `window.confirm` de nota (`pages/Notes.jsx`) por el
  `ConfirmDialog` que ya usa el borrado de bloque (`NoteBlockList.jsx`),
  mostrando el conteo real de descendientes: "Se eliminarán N sub-notas"
  (el dato está en `treeData`/`flat`; el helper `collectDescendantIdsFlat` ya
  existe en `Notes.jsx`).
- Con undo disponible, valorar QUITAR la confirmación para notas sin hijos
  (patrón Gmail: borrar directo + deshacer es más fluido que confirmar); dejar
  el diálogo solo cuando hay descendientes.

## Fuera de alcance
- Papelera navegable (listar/restaurar borrados antiguos): posible siguiente
  iteración sobre el mismo endpoint; no bloquea el undo.
- Undo de borrado de BLOQUES: hoy es hard-delete con borrado de archivos
  inmediato en `deleteBlock`; darle undo exigiría soft-delete de bloques
  (cambio de schema). Mantener la confirmación actual para bloques.

## Criterios de aceptación
- Borrar nota con sub-notas → toast "Deshacer" → todo el subtree reaparece en
  el árbol con el mismo orden y padre.
- Una sub-nota borrada AYER dentro de una nota borrada HOY: al deshacer el
  borrado de hoy, la de ayer sigue borrada.
- Dejar expirar el toast → la nota sigue borrada; el job de purga la elimina
  definitivamente tras la gracia (comportamiento existente, sin cambios).
- El bloque `reference` que apuntaba a una sub-nota restaurada vuelve a
  renderizar el título (el JOIN con `deleted_at IS NULL` lo excluía mientras
  estaba borrada; verificar que la invalidación de `detail` lo refresca).
