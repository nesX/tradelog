# Bug: orquestaciones multi-request sin manejo de fallo parcial
2026-08-05 · **Severidad: MEDIA (estado inconsistente)** · Frontend (+ Backend opcional)

## Problema
Tres flujos encadenan varias mutaciones con `await` sin try/catch ni compensación;
si falla un paso intermedio queda estado inconsistente y cero feedback:

1. **Mover sub-nota** — `frontend/src/components/notes/NoteBlockList.jsx:296-324`
   (`handleConfirmMoveSubNote`): `moveNote` → `deleteBlock` → `createBlock`.
   Si falla el paso 2 o 3, la sub-nota ya cambió de padre pero el bloque
   reference queda en la nota vieja (o desaparece sin crearse en la nueva);
   el modal queda abierto sin mensaje.
2. **Crear sub-nota** — `pages/Notes.jsx:123-140` (`handleCreateChild`): crea la
   nota y luego el bloque reference; si el 2º paso falla queda una sub-nota
   huérfana y la navegación no ocurre. Además duplica la lógica de
   `hooks/useBlockInserter.js:27-43` (con position 9999 vs la real) — unificar.
3. **Doble creación de sección** — `pages/Notes.jsx:96-108,288-302`: el input
   tiene `onBlur` y Enter llamando ambos a `handleCreateSection`, async y sin
   guard de `isPending` → Enter + click rápido crea la sección dos veces.

## Fix
- Corto plazo: try/catch con toast en 1 y 2; guard `skipBlurRef` (patrón ya usado
  en `NoteEditor.jsx:130-148`) o `createNote.isPending` en 3.
- Ideal para 1 y 2: endpoint único transaccional en backend
  (p. ej. `POST /api/notes/:id/convert-to-child`, `POST /api/notes/:id/sub-note`)
  que haga los pasos atómicamente en una transacción SQL.

## Verificación
- Simular fallo del 2º request (backend apagado a mitad, o mock) → la UI informa
  y no queda bloque/nota huérfano tras refetch.
- Enter + blur rápido en "nueva sección" → una sola sección.
