# Task 05 — Refactor: "mover sub-nota" usa el endpoint nuevo

## Objetivo

Eliminar el flujo cliente de 3 llamadas sin transacción (`moveNote` + `deleteBlock` +
`createBlock` con `position: 9999`) de `NoteBlockList.jsx`.

## Cambios

- `frontend/src/components/notes/NoteBlockList.jsx`:
  - Eliminar `MoveSubNoteModal`, `handleConfirmMoveSubNote` y el botón `FolderInput`
    exclusivo de bloques reference: el caso "mover sub-nota dentro de otra" es un subcaso
    de "mover bloque a otra nota" (el server reparenta la sub-nota automáticamente).
  - Limpiar imports que quedan sin uso (`useMoveNote`, `useCreateBlock` si aplica).

## Criterios de aceptación

- Mover un bloque reference de sub-nota a otra nota mueve el bloque Y reparenta la sub-nota
  en el árbol del sidebar, atómicamente (una sola request).
- No queda código muerto del flujo viejo.
