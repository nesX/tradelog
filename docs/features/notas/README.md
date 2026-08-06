# Feature: Mover bloques a otra nota

Permite mover cualquier bloque de una nota a otra nota del usuario (V2 del DnD de bloques,
que en V1 solo reordenaba dentro de la misma nota — ver guard histórico en
`note.service.js` / `moveBlockDnd`).

## Diseño (resumen)

- **Endpoint nuevo**: `PATCH /api/notes/blocks/:blockId/move-to-note` con body `{ target_note_id }`.
  El bloque se apenda **al final** de la nota destino; una vez ahí se reordena con el DnD existente.
- **Sin migración de schema**: `note_block_images` y `note_block_trades` cuelgan de `block_id`,
  mover = `UPDATE note_blocks SET note_id, position`.
- **Caso sub-nota**: si el bloque es `reference` con `linked_note_id` cuyo `parent_note_id` es la
  nota origen, se reparenta también la sub-nota (misma transacción) para no desincronizar el árbol.
- **Mover ≠ editar**: el trigger de `updated_at` (migración 024) no incluye `note_id` en su `WHEN`,
  así que mover no marca el bloque como "actividad" en Revisión. Decisión deliberada.
- **UX V1**: botón "Mover a otra nota" en las acciones flotantes del bloque → modal con buscador
  sobre el árbol de notas (`GET /api/notes/tree`). Excluye la nota actual, secciones y, si es
  sub-nota, su propio subtree.
- **Fuera de alcance V1**: arrastrar bloques al árbol del sidebar (DndContexts separados),
  multi-selección de bloques, elegir posición exacta en el destino.

## Tablero

- Tareas: [`tasks/`](tasks/)
- Estado: [`PROGRESS.md`](PROGRESS.md)
- Completadas: [`DONE.md`](DONE.md)
