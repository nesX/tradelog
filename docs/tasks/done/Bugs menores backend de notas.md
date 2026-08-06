# Bugs menores — backend de notas (lote)
2026-08-05 · **Severidad: BAJA** · Backend

Lote de fixes pequeños e independientes; se pueden hacer en una sola pasada.

1. **`caption` del upload multipart sin validación Joi** —
   `routes/note.routes.js:64-69` + `controllers/note.controller.js:98-109`:
   un caption >1000 chars revienta contra el VARCHAR(1000) (error PG `22001` no
   mapeado en errorHandler) → 500. Validar/truncar en el controller o añadir
   schema para el body del multipart. (Los PATCH de caption sí validan.)

2. **Mover una sección como sibling de una nota anidada da error genérico** —
   `note.service.js:144-151`: `dropType: 'sibling-below'` sobre una nota hija
   deja que reviente el CHECK `sections_only_at_root` (migración 020) → 400
   "Valor inválido". Añadir validación explícita con mensaje claro cuando
   `sourceNote.type === 'section'` y el target tiene padre.

3. **`getFullTree` ordena bloques sin `COLLATE "C"`** —
   `note.repository.js:802`: el orden del export JSON/Markdown puede diferir del
   de la UI con collation locale-aware (todas las demás queries lo usan, ver
   comentario en `:369-370`). Añadir `COLLATE "C"`.

4. **`findPendingFollowUp` sin `LIMIT`** — `note.repository.js:834-855`: su
   gemela `findRecentActivity` limita a 200; esta devuelve todo. Añadir LIMIT.

5. **`getReview` valida query params a mano en el controller** —
   `note.controller.js:207-224`: inconsistente con el resto (Joi + `validate`);
   además el mensaje de error de `pendingHours` menciona "all" que ya se
   descarta antes. Crear `noteReviewSchema` y usar `validate(..., 'query')`.

6. **`assignTags` es replace-all bajo POST** — `note.repository.js:648-666`:
   `POST /:noteId/tags` con `tag_ids: []` borra todos los tags en silencio
   (el validador no exige `min(1)`). Documentarlo o renombrar a PUT.

7. **Sin límite de profundidad/tamaño del árbol** — `createNote`/`moveDnd`
   permiten anidamiento ilimitado y `buildNoteTree`/`renderMarkdownTree`
   (`note.service.js:426-510`) son recursivos con `filter` O(n²) por nivel.
   Cap de profundidad (p. ej. 10) en create/move y agrupar bloques por `Map`
   en el export.
