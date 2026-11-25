# Notas — issues conocidos y deuda técnica

Hallazgos de la revisión del sistema de Notas (2026-06-15) que **no** se arreglaron en esa
pasada, con su reproducción y un fix sugerido. Severidad baja-media; ninguno corrompe datos.

Los hallazgos que **sí** se corrigieron en esa revisión (migración 023 con basura, documentación
desactualizada, no borrar imágenes <24h al eliminar una nota, `updated_at` que no cambia en
reorden, doble-guardado del título y re-scroll del bloque resaltado) ya están en el código.

---

## B1 — Referencia a sub-nota soft-borrada queda como link a un 404

**Qué pasa.** Una sub-nota se representa en su nota padre con un bloque `reference` que tiene
`linked_note_id` poblado. Al borrar la sub-nota, el borrado es **soft** (`deleted_at`), que **no**
dispara el `ON DELETE SET NULL` del FK, así que `linked_note_id` sigue apuntando a la nota
borrada. El repo (`getById`) hace `LEFT JOIN notes ln ... AND ln.deleted_at IS NULL`, por lo que
`linked_note_title` viene `NULL`, pero `linked_note_id` no.

En `components/notes/NoteReferenceBlock.jsx` → `SubNoteView`, la condición de "borrada" es
`if (!block.linked_note_id)` — solo cubre el caso de hard-delete (columna en NULL). Con
soft-delete, `linked_note_id` sigue truthy, así que renderiza un `<Link to="/notes/{id_borrado}">`
etiquetado "Sub-nota" que lleva a la pantalla **"Nota no encontrada"**.

(Los bloques `trade_reference` sí manejan bien el caso análogo: muestran "Trade no disponible".)

**Reproducir.** Crear nota A con una sub-nota B (aparece el bloque reference en A) → borrar B
desde el sidebar → abrir A → el bloque sigue siendo un link; al hacer click, 404.

**Fix sugerido.** Exponer el estado de borrado del target desde el repo (p. ej. seleccionar
`(ln.id IS NULL) AS linked_note_deleted` usando el `LEFT JOIN` que ya filtra `deleted_at`), y en
`SubNoteView` mostrar el estado "Nota eliminada" (como ya hace para `linked_note_id` NULL) cuando
`linked_note_deleted` sea true.

---

## B4 — `moveDnd` (notas) sin salvaguarda anti-posiciones-duplicadas

**Qué pasa.** `repositories/note.repository.js` → `createBlock` protege contra posiciones
duplicadas antes de llamar a `generateKeyBetween` (si `before >= after`, busca la siguiente
posición estrictamente mayor). `moveDnd` / `getSiblingPositions` **no** tienen esa salvaguarda.
Si dos hermanos comparten `position`, `generateKeyBetween(before, after)` lanza (exige
`before < after` estricto) y el move falla.

¿Cómo llegarían dos hermanos a compartir `position`? La migración `018_migration_fix_positions.sql`
asigna claves `a0..a9, aA..aZ, aa..az` por índice, pero su rama `ELSE 'a0'` da la **misma** clave
a todos los hermanos a partir del nº 63. Es decir, requiere **>62 hermanos en un mismo nivel**.

**Severidad.** Caso límite improbable, pero la asimetría con `createBlock` es real.

**Fix sugerido.** Replicar la salvaguarda de `createBlock` en `getSiblingPositions`
(y/o en `moveDnd` del service): si `before`/`after` no son estrictamente crecientes, ajustar el
`after` al siguiente valor estrictamente mayor (o `null`).

---

## C3 — Crear tag: la colisión por carrera (resuelto, 2026-11-25)

**Qué pasaba (TOCTOU).** `createTag` y `updateTag` comprueban con `repo.getTagByName` que el
nombre no exista antes del `INSERT`/`UPDATE`. Dos peticiones casi simultáneas con el mismo nombre
pasaban las dos el pre-chequeo y la segunda violaba el índice `idx_note_tags_unique_name`
(`23505`). El `errorHandler` lo traducía a un **409 genérico** ("El registro ya existe"), no a un
500 como decía antes este documento; la integridad nunca se rompió.

**Fix.** El service captura el `23505` en `createTag` y `updateTag` y lanza
`ValidationError('Ya existe un tag con ese nombre')` (400), el mismo mensaje del pre-chequeo, que
se queda como camino feliz. Pesa más desde que el `TagPicker` crea tags desde cualquier bloque
(task 033, spec [`features/specs/tags-bloques.md`](../features/specs/tags-bloques.md) §6.3).

---

## C4 — `softDelete` (repo) no filtra `deleted_at` en la recursión

**Qué pasa.** En `repositories/note.repository.js` → `softDelete`, el CTE recursivo que junta los
descendientes **no** filtra `deleted_at IS NULL` (a diferencia de `getDescendantIds`, que sí lo
hace). Al borrar una nota, re-estampa `deleted_at = NOW()` sobre descendientes que ya estaban
borrados.

**Severidad.** Inocuo (idempotente): no resucita nada ni cambia visibilidad. Solo es una
inconsistencia con la otra consulta recursiva.

**Fix sugerido.** Añadir `AND deleted_at IS NULL` en la rama recursiva para no re-tocar filas ya
borradas (y dejar ambas consultas recursivas consistentes).
