# Bug: IDOR — `linked_note_id` permite leer títulos de notas de otros usuarios
2026-08-05 · **Severidad: ALTA (seguridad)** · Backend

## Problema
El validador acepta `linked_note_id` en cualquier tipo de bloque
(`backend/src/validators/note.validator.js:39`), pero el service solo verifica
ownership cuando `block_type === 'reference'`
(`backend/src/services/note.service.js:239-242`).

Un `POST /api/notes/:noteId/blocks` con
`{ block_type: 'text', linked_note_id: <id de nota de OTRO usuario> }` se inserta
sin validación, y la query de lectura hace
`LEFT JOIN notes ln ON ln.id = nb.linked_note_id AND ln.deleted_at IS NULL`
(`backend/src/repositories/note.repository.js:62`, también `:800` en getFullTree)
sin filtrar por dueño → `linked_note_title` devuelve el título de la nota ajena.
Permite enumerar títulos de notas de todos los usuarios iterando ids.

## Fix
1. En `createBlock` del service: validar ownership de `linked_note_id` **siempre**
   que venga (o rechazarlo si `block_type !== 'reference'`).
2. Defensa en profundidad: añadir `AND ln.user_id = n.user_id` a los dos JOINs de
   lectura (requiere unir con la tabla `notes` padre o pasar el user_id).
3. Relacionado (severidad baja): `metadata.target_note_id`/`target_block_id` del
   esquema nuevo de referencias (migración 022) tampoco se validan
   (`note.service.js:257-268`) — quedan referencias basura aunque sin fuga
   server-side. Validar existencia+ownership ahí también.

## Verificación
- Test: crear bloque text con `linked_note_id` de otro usuario → debe fallar 404/400.
- Test: bloque reference legacy sigue funcionando.
