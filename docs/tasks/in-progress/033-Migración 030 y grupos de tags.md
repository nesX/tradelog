# Task: migración 030 y grupos en el CRUD de tags
2026-11-25 · Base de datos + Backend · Tags por bloque 1/10 · Depende de: —

Spec: §2, §3, §4.1, §4.2 y §6 (puntos 3 y 4) de
[tags-bloques.md](../../features/specs/tags-bloques.md).

## Objetivo
Crear el esquema de la feature (grupos de tags y tabla de tags por bloque) y
llevar `group_key` a todo el CRUD de tags, con el orden canónico y con un
mensaje claro cuando dos creaciones del mismo nombre chocan. La tabla nueva
todavía no se usa: eso es la 034. El frontend no cambia y sigue funcionando
(ignora `group_key`).

## Supuestos del §2, verificados en el código (2026-11-25)
El spec pide confirmarlos antes de la Fase 1. Varios no se cumplen; las tasks
033–042 ya usan los nombres reales.

| Supuesto del spec | En el código | Consecuencia |
|---|---|---|
| `note_blocks` tiene `user_id` | **No lo tiene**: el dueño es `notes.user_id` (`013_migration_notes.sql:18`). Sin soft delete propio: borrar un bloque es un `DELETE` (`note.repository.js:609`). FK a `notes` con `ON DELETE CASCADE` | Cada `b.user_id = $N` del spec pasa a `JOIN notes n ON n.id = b.note_id AND n.user_id = $N AND n.deleted_at IS NULL`. La cascada purga → bloques → asignaciones funciona |
| Columna `type` | Es **`block_type`**: `text`, `callout`, `image_gallery`, `image`, `reference`, `trade_reference` (026). No hay bookmark | `b.type` → `b.block_type` |
| `content`, `metadata`, fechas y `notes.title` | Existen | — |
| La marca de Repaso es `requires_follow_up` | Esa es la de **Revisión** (`/review`). La de **Repaso** es `marked_for_revisit` (025): `GET /blocks/revisit`, `useRevisit`, `useToggleRevisit` | 037–039 usan `marked_for_revisit` |
| Referencias con `type = 'reference'` | `block_type = 'reference'`, destino en `metadata.target_note_id` / `metadata.target_block_id` (022). Las sub-notas usan además la columna `linked_note_id`. Pueden apuntar a una nota | Fase B del script (041) |
| Rutas bajo `/api/notes/blocks/:blockId` | Sí. No hay `GET /blocks/:blockId`. Revisión y Repaso: `GET /blocks/review` y `GET /blocks/revisit`. Los params no se validan (`parseInt` en el controller) | Repaso por tag en `GET /blocks/by-tags` (037) |
| Página de Repaso con pestaña de marcados | `pages/Repaso.jsx` no tiene pestañas: una lista "Bloques para repasar". Se usa embebida en `Notes.jsx` (botón del sidebar, estado local); nada enlaza a `/repaso`. "Actividad reciente" está en `Review.jsx` | 038 y 039 |
| Visor de repaso de trades | Es el modal de detalle de trade (`ImageViewer` con `headerActions`), con anterior/siguiente en `TradeTable.jsx` que cruza páginas del servidor. **Sin teclado** | 038 |
| Display de bloques en solo lectura | Ninguno tiene `readOnly`: texto y callout editan con click, galería e imagen suben y borran, `trade_reference` añade y quita. Las imágenes ya abren `ImageViewer` | 038 |
| Navegación a un bloque | `NoteEditor` acepta `?highlight=<id>` (Repaso/Revisión) y `#block-<id>` (referencias) | 038 |
| Caminos que insertan bloques | `note.service.js → createBlock` (`:387`) y el bloque inicial de un pendiente (`todo.service.js:58`). Mover a otra nota es un `UPDATE`. No hay duplicar ni importar; restaurar una nota no reinserta bloques | 034, sin `copyBlockTags` |
| Scripts del backend | No hay `backend/scripts/`; solo `trading-journal/scripts/*.sh` (backups). El `Dockerfile` hace `COPY . .` | 041 |

Otros hallazgos que usan las tasks siguientes:
- `findBlockByIdAndUser` (`note.repository.js:411`) y `findNoteByIdAndUser`
  (`:324`) ya son las verificaciones livianas que el spec llama
  `getBlockForTagging` y `noteBelongsToUser`: se reutilizan.
- `assignTags` (repo, `:822`) es replace-all.
- C3 hoy no da 500: `errorHandler.js:101` traduce el `23505` a un 409 genérico
  ("El registro ya existe"). El fix del §6.3 sigue valiendo por el mensaje y el
  status.
- Hay tests de services con repos mockeados (`note.service.test.js`), así que
  aplica el §8 completo.
- El frontend no lee los `tags` de `getTree`.

## Alcance

### 1. `database/030_migration_block_tags.sql`
El SQL del §3 tal cual, dentro de `BEGIN; … COMMIT;` como la 025 y la 026:
- `group_key` con su CHECK y default `libre`.
- `note_block_tag_assignments` (PK compuesta, cascadas a `note_blocks` y
  `note_tags`).
- El índice `(tag_id, block_id)`.

Idempotente. Aplicarla en dev.

### 2. `backend/src/constants/tagGroups.js` (§4.1)
Carpeta nueva: hoy las constantes del backend viven sueltas en cada service.
Las cuatro del §4.1; `TAG_GROUPS` tiene que coincidir con el CHECK de la 030.

### 3. CRUD de tags (§4.2)
- `note.validator.js`: `group_key: Joi.string().valid(...TAG_GROUPS)`,
  opcional en `createTagSchema` y en `updateTagSchema`.
- `note.repository.js`:
  - `createTag` inserta `group_key` (`DEFAULT_TAG_GROUP` si no viene).
  - `updateTag` acepta `group_key` en su lista dinámica de campos.
  - `getTags` agrega `group_key` y mantiene `ORDER BY name`: el frontend
    agrupa.
  - `getTagsByIds` devuelve `id, group_key` (la 037 cuenta grupos con eso).
  - `getTagByName` y `getTagById` hacen `SELECT *`: ya lo traen.
  - `getTree` no se toca (§4.6).
- `note.service.js`: `createTag` y `updateTag` pasan `group_key`.

### 4. Orden canónico (§4.1 y §6, punto 4)
`ORDER BY array_position($N::text[], t.group_key::text), LOWER(t.name)`, con
`TAG_GROUPS` como parámetro:
- Tags de la nota en `getById` (`:76`): agregar `group_key` y el orden.
- `TAGS_AGG` (`:865`, resultados de búsqueda): `group_key` y
  `json_agg(… ORDER BY …)`. Lo usan dos queries con parámetros distintos
  (`FTS_QUERY` → `$5`, `TAG_ONLY_QUERY` → `$4`): convertirlo en una función del
  placeholder, como `blockReminderColumns` (`:105`).

### 5. Colisión de nombres (§6, punto 3)
En `createTag` y `updateTag` (service), capturar el `23505` del índice
`idx_note_tags_unique_name` y lanzar
`ValidationError('Ya existe un tag con ese nombre')`. El pre-check con
`getTagByName` se queda.

## Criterios de aceptación
- La 030 corre dos veces seguidas sin errores. Los tags existentes quedan en
  `libre`, y `UPDATE note_tags SET group_key = 'foo'` falla por el CHECK.
- `POST /api/notes/tags` sin `group_key` → `libre`; con `activo` → `activo`;
  con `foo` → 400. `PATCH` cambia el grupo.
- `GET /api/notes/:id` y la búsqueda devuelven los tags con `group_key` y en
  orden canónico.
- Dos `POST` simultáneos con el mismo nombre (`Promise.all` de dos `fetch`
  desde la consola) → un 201 y un 400 "Ya existe un tag con ese nombre". Ni
  500 ni el 409 genérico.
- La app, sin cambios de frontend, sigue funcionando: tags del editor,
  búsqueda y gestor.
- `npm test` y `npm run lint` limpios.

## Tests (Jest)
- `note.validator.test.js`: `group_key` válido, inválido y ausente, al crear y
  al editar.
- `note.service.test.js`: `createTag` y `updateTag` con el repo lanzando
  `{ code: '23505' }` → `ValidationError`; con otro error, se propaga.

## Notas
- **Despliegue**: aplicar la 030 en prod **antes** del push a `main` que
  incluya esta task. Cada push despliega, y `getTags` y `getById` leen
  `group_key`: sin la migración no carga ninguna nota. Ver
  `docs/operations/database-ops.md`; con el comando de la task 026:
  `docker exec -i market-tracker-postgres-1 psql -U tradelog_user -d tradelog < trading-journal/database/030_migration_block_tags.sql`.
- En dev, comprobar antes que la 029 esté aplicada: la task 028 anotó que no lo
  estaba.
- No correr `npm run format`; `npm run lint:fix`.

## Implementación (2026-11-25)
Hecha. Verificada contra un Postgres local con todas las migraciones aplicadas
(el contenedor de dev no estaba levantado: **no se comprobó si la 029 está
aplicada en dev**).

Desviaciones:
- El SQL del §3 **no era idempotente**: con el CHECK declarado junto al
  `ADD COLUMN IF NOT EXISTS`, la segunda corrida falla porque Postgres choca con
  el nombre del constraint aunque salte la columna. La 030 recrea el CHECK con
  `DROP CONSTRAINT IF EXISTS` + `ADD`, como la 026. Corre dos veces sin error.
- Dos `POST` simultáneos del mismo nombre → un 201 y un 400 "Ya existe un tag
  con ese nombre".
- `tagOrder(alias, placeholder)` en el repo arma el `ORDER BY` canónico; lo usan
  `getById`, `tagsAgg` (búsqueda), los tags de bloque y el export.
