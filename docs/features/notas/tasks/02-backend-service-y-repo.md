# Task 02 — Backend: service `moveBlockToNote` + repo transaccional

## Objetivo

Lógica de negocio y persistencia del movimiento, atómica bajo `withUserLock`.

## Cambios

- `backend/src/services/note.service.js`: `moveBlockToNote({ blockId, targetNoteId, userId })`:
  - Bloque existe y es del usuario (`findBlockByIdAndUser`).
  - Nota destino existe, es del usuario, no está borrada (`findNoteByIdAndUser`).
  - Destino no es `section` y no es la nota actual del bloque.
  - **Caso sub-nota**: bloque `reference` con `linked_note_id` cuyo `parent_note_id` es la nota
    origen → reparentar la sub-nota al destino (`repo.move`) en la misma transacción, con guard
    anti-ciclos (destino ≠ sub-nota y destino ∉ descendientes de la sub-nota).
  - Posición: `generateKeyBetween(lastBlockPos, null)` → al final del destino.
- `backend/src/repositories/note.repository.js`:
  - `getLastBlockPosition(noteId, exec)` — última posición de bloque (COLLATE "C").
  - `updateBlockNoteAndPosition(blockId, targetNoteId, newPosition, exec)` — el UPDATE del move.
  - `findBlockByIdAndUser` pasa a devolver también `linked_note_id`.

## Criterios de aceptación

- Todo el movimiento (reparent de sub-nota incluido) ocurre en UNA transacción con advisory lock
  (mismo patrón que `createNote`/`restoreNote`).
- Destino sección → 400; destino = nota actual → 400; bloque/nota ajenos → 404.
- Mover NO toca `updated_at` del bloque (el trigger de la migración 024 no incluye `note_id`).
