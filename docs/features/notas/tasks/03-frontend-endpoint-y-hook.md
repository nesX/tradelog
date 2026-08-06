# Task 03 — Frontend: endpoint + hook `useMoveBlockToNote`

## Objetivo

Capa de datos del movimiento con update optimista.

## Cambios

- `frontend/src/api/endpoints.js`: `moveBlockToNote(blockId, payload)` →
  `PATCH /api/notes/blocks/:blockId/move-to-note`.
- `frontend/src/hooks/useNotes.js`: `useMoveBlockToNote(sourceNoteId)`:
  - `onMutate`: quita el bloque de `noteKeys.detail(sourceNoteId)` (optimista) + rollback en error.
  - `onSettled`: invalida detail de origen, detail del destino y `noteKeys.tree()`
    (el tree muestra `block_count`, y el caso sub-nota reparenta nodos).

## Criterios de aceptación

- El bloque desaparece de la nota origen sin esperar al server; en error reaparece
  (y el toast global de errores de mutación ya avisa).
