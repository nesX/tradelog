# Task 04 — Frontend: botón "Mover a otra nota" + `MoveBlockToNoteModal`

## Objetivo

UX V1: acción flotante en cada bloque → modal con buscador sobre el árbol de notas.

## Cambios

- `frontend/src/components/notes/MoveBlockToNoteModal.jsx` (nuevo):
  - Mismo shell visual que el modal de sub-notas (header + "Moviendo: …" + lista scrolleable).
  - Fuente de destinos: `useNoteTree()` aplanado con indentación por profundidad.
  - Input de filtro por título (al filtrar, lista plana de matches).
  - Excluye: la nota actual, secciones y, si el bloque es sub-nota, la sub-nota y sus descendientes.
  - Si el bloque es sub-nota (`reference` + `linked_note_id`), hint: "Se moverá también la sub-nota".
  - Al confirmar: `useMoveBlockToNote`, toast de éxito, cerrar modal.
- `frontend/src/components/notes/NoteBlockList.jsx`: botón "Mover a otra nota" (icono `FileOutput`)
  en el grid de acciones flotantes, visible para TODOS los tipos de bloque.

## Criterios de aceptación

- Cualquier bloque (text, callout, image_gallery, reference, trade_reference) puede moverse.
- El bloque conserva imágenes, trades y flag de seguimiento al llegar al destino (van con el `block_id`).
