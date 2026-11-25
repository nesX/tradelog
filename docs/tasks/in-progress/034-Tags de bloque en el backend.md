# Task: backend — tags de bloque: endpoints, tags por defecto y lectura
2026-11-25 · Backend · Tags por bloque 2/10 · Depende de: 033

Spec: §4.3–§4.6 y §6 (punto 5) de
[tags-bloques.md](../../features/specs/tags-bloques.md).

## Objetivo
Que los bloques lleven tags: agregar y quitar de a uno, que los bloques nuevos
copien los tags de su nota, aplicar los tags de una nota a sus bloques
existentes y devolver los tags de cada bloque al leer una nota. Cierra la
Fase 1.

## Alcance

### 1. Repository (`note.repository.js`)
Las queries del spec usan `b.user_id`, que no existe (ver 033): el dueño se
comprueba por `notes`.

- **Verificaciones livianas**: reutilizar `findBlockByIdAndUser(blockId,
  userId)` (`:411`; devuelve `id, note_id, block_type, …` de un bloque del
  usuario con nota no borrada) y `findNoteByIdAndUser(noteId, userId)`
  (`:324`). Son el `getBlockForTagging` y el `noteBelongsToUser` del spec; no
  crear funciones nuevas.
- `addBlockTag(blockId, tagId, userId)`:
  ```sql
  INSERT INTO note_block_tag_assignments (block_id, tag_id)
  SELECT b.id, t.id
  FROM note_blocks b
  JOIN notes n ON n.id = b.note_id AND n.user_id = $3 AND n.deleted_at IS NULL
  JOIN note_tags t ON t.id = $2 AND t.user_id = $3
  WHERE b.id = $1
  ON CONFLICT DO NOTHING;
  ```
- `removeBlockTag(blockId, tagId, userId)`:
  ```sql
  DELETE FROM note_block_tag_assignments a
  USING note_blocks b, notes n
  WHERE a.block_id = b.id AND b.note_id = n.id
    AND b.id = $1 AND a.tag_id = $2 AND n.user_id = $3;
  ```
- `getBlockTags(blockIds, userId, exec = pool)`: la query del §4.6, una sola
  para todos los bloques, en orden canónico con `TAG_GROUPS` como `$3`.
  Devuelve un `Map` de `block_id` a `[{ id, name, color, group_key }]`. La
  usan las respuestas de esta task, `getById` y la 037.
- `copyNoteTagsToBlock(blockId, noteId, userId, exec)`: el SQL del §4.4 tal
  cual (no usa `b.user_id`).
- `applyNoteTagsToBlocks(noteId, userId)`:
  ```sql
  INSERT INTO note_block_tag_assignments (block_id, tag_id)
  SELECT b.id, nta.tag_id
  FROM note_blocks b
  JOIN note_tag_assignments nta ON nta.note_id = b.note_id
  JOIN note_tags t ON t.id = nta.tag_id AND t.user_id = $2
  WHERE b.note_id = $1 AND b.block_type <> 'reference'
  ON CONFLICT DO NOTHING
  RETURNING block_id;
  ```
- `getById` (§4.6): después de la query de bloques, una sola llamada a
  `getBlockTags` con todos los ids y `block.tags = map.get(id) ?? []`. Nunca
  una query por bloque; sin bloques, no consultar.
- El `copyBlockTags` del spec **no hace falta**: no hay camino de duplicar.

### 2. Service (`note.service.js`)
- `addBlockTag(userId, blockId, tagId)` y `removeBlockTag(userId, blockId,
  tagId)`, con las reglas del §4.3:
  1. `findBlockByIdAndUser` devuelve `null` →
     `NotFoundError('Bloque no encontrado')`.
  2. `block_type === 'reference'` →
     `ValidationError('Los bloques de referencia no llevan tags')`, en los dos.
  3. Solo al agregar: `getTagById(userId, tagId)` devuelve `null` →
     `NotFoundError('Tag no encontrado')`.
  4. Idempotentes: los dos devuelven `{ block_id, tags }` con la lista actual.
- `createBlock` (`:387`, §4.4): dentro del `withUserLock` que ya tiene, después
  de `repo.createBlock`, si el bloque no es `reference` →
  `copyNoteTagsToBlock(block.id, noteId, userId, client)`. La respuesta incluye
  `tags` (`[]` en las referencias).
  - De paso: `createBlock` carga la nota completa con `getById` solo para
    validar dueño y tipo, y con esta task `getById` hace una query más.
    Cambiarlo por `findNoteByIdAndUser`, que devuelve `type`.
  - `todo.service.js:58` (bloque inicial de un pendiente) no copia nada: las
    notas `todo` no tienen tags (§11).
  - Mover a otra nota (`moveBlockToNote`) es un `UPDATE` de `note_id`: el
    bloque conserva sus tags sin código extra (D4).
- `applyNoteTagsToBlocks(userId, noteId)` (§4.5): `findNoteByIdAndUser` →
  `null`: `NotFoundError('Nota no encontrada')`. Devuelve
  `{ blocks_updated, assignments_created }`: `block_id` distintos y filas
  devueltas.
- `assignTags` y `removeTags` (§6, punto 5): `findNoteByIdAndUser` en lugar
  de `getById`. En `assignTags`, deduplicar `tagIds` antes de compararlos con
  `getTagsByIds` (hoy un id repetido da "Algunos tags no existen").

No se restringe por tipo de nota: la UI no ofrece tags de bloque en los
pendientes, y el repaso (037) solo mira notas `type = 'note'`.

### 3. API
| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| `POST` | `/api/notes/blocks/:blockId/tags` | `{ tag_id }` | `{ block_id, tags }` |
| `DELETE` | `/api/notes/blocks/:blockId/tags/:tagId` | — | `{ block_id, tags }` |
| `POST` | `/api/notes/:noteId/tags/apply-to-blocks` | — | `{ blocks_updated, assignments_created }` |

- Los tres con `sendSuccess` (200).
- `blockTagSchema`: `tag_id` entero positivo requerido. Los params, con
  `parseInt(…, 10)` en el controller, como el resto de rutas de notas.
- Las de `/blocks/…`, en el grupo de rutas de bloques (antes de `/:id`).
  `apply-to-blocks`, junto a `POST /:noteId/tags` (`note.routes.js:98`).

## Criterios de aceptación
- Un bloque creado en una nota con `proyección` nace con `proyección`, en la
  respuesta del `POST` y en `GET /api/notes/:id`. Uno de referencia nace sin
  tags.
- Agregar un tag a la nota no cambia los bloques existentes.
- `apply-to-blocks` agrega los tags de la nota a todos sus bloques que no son
  referencias; repetirlo devuelve `assignments_created: 0`.
- Agregar dos veces el mismo tag, o quitar uno que no está → 200 con la lista
  actual.
- Tag de otro usuario → 404. Bloque de otro usuario o de una nota en la
  papelera → 404. Bloque de referencia → 400.
- Mover un bloque a otra nota conserva sus tags.
- Borrar un bloque o un tag borra sus asignaciones; purgar una nota
  (`hardDeleteNotes`) no da errores de FK.
- `GET /api/notes/:id` trae `tags` en cada bloque (`[]` si no tiene) con una
  sola query extra.
- `npm test` y `npm run lint` limpios.

## Tests (Jest, `note.service.test.js`)
Agregar las funciones nuevas al `mockNoteRepo`.
- `addBlockTag`: bloque inexistente → 404; referencia → 400; tag ajeno → 404;
  devuelve `{ block_id, tags }`.
- `removeBlockTag`: referencia → 400; no comprueba el tag.
- `createBlock`: llama a `copyNoteTagsToBlock` con el `client` del lock, salvo
  en referencias.
- `applyNoteTagsToBlocks`: nota ajena → 404; `blocks_updated` cuenta bloques
  distintos.
- `assignTags` con ids repetidos no falla.
- Validator: `tag_id` ausente, 0, negativo y no numérico.

## Notas
- Sin migración: la tabla la creó la 033.
- No correr `npm run format`.

## Implementación (2026-11-25)
Hecha. Criterios verificados con la API real (alta, idempotencia, 404/400,
mover a otra nota, cascadas y `hardDeleteNotes`).

Desviaciones:
- `createBlock` usa `findNoteByIdAndUser` también para `linked_note_id` y para el
  `target_note_id` de las referencias (mismo criterio de verificación liviana).
- `applyNoteTagsToBlocks` agrega al SQL el `JOIN notes` del dueño (no solo el del
  tag), aunque el service ya comprueba la nota.
