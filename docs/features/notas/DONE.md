# Done — Mover bloques a otra nota

> Tareas completadas (con fecha). Ver [`PROGRESS.md`](PROGRESS.md) para el estado vivo.

- **2026-08-05** — [01 — Backend: endpoint move-to-note](tasks/01-backend-endpoint-move-to-note.md):
  `moveBlockToNoteSchema` + ruta `PATCH /blocks/:blockId/move-to-note` + controller.
- **2026-08-05** — [02 — Backend: service + repo transaccional](tasks/02-backend-service-y-repo.md):
  `moveBlockToNote` bajo `withUserLock` con caso sub-nota (reparent + guards anti-ciclo);
  repo `getLastBlockPosition` + `updateBlockNoteAndPosition`; `findBlockByIdAndUser`
  ahora devuelve `linked_note_id`.
- **2026-08-05** — [03 — Frontend: endpoint + hook](tasks/03-frontend-endpoint-y-hook.md):
  `api.moveBlockToNote` + `useMoveBlockToNote` (optimista con rollback; invalida
  detail origen/destino + tree).
- **2026-08-05** — [04 — Frontend: modal + botón](tasks/04-frontend-modal-y-boton.md):
  `MoveBlockToNoteModal.jsx` (árbol indentado + filtro + exclusiones + hint sub-nota);
  botón `FileOutput` "Mover a otra nota" en todos los tipos de bloque.
- **2026-08-05** — [05 — Refactor mover sub-nota](tasks/05-refactor-mover-subnota.md):
  eliminados `MoveSubNoteModal` y el encadenado de 3 requests sin transacción
  (`moveNote` + `deleteBlock` + `createBlock` con `position: 9999`).
- **2026-08-05** — [06 — Verificación](tasks/06-verificacion.md):
  suite e2e de 14 checks contra instancia local + BD dev — todos PASS (happy path,
  400 sección/misma nota, 404 inexistente, reparent de sub-nota en el tree, guard de
  ciclo, `updated_at` intacto, cleanup). Build de Vite OK. `docs/api/reference.md`
  actualizado. Lint omitido (roto pre-existente, sin config de ESLint).
