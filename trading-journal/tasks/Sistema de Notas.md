# Sistema de Notas — Documento de implementación

## Contexto del proyecto

Stack: React 18 + Vite (frontend), Express.js (backend), PostgreSQL (base de datos). El proyecto ya tiene CRUD de trades, autenticación JWT, upload de imágenes (multer), backtesting, sistemas/estrategias configurables y estadísticas. **No romper nada de lo existente.**

La arquitectura sigue el patrón: `routes → middleware → controllers → services → repositories → database`

Ambos lados usan ES modules (`"type": "module"`). Backend en puerto 5000, frontend en 5173.

**Este módulo es completamente independiente** del journal de trades, del backtesting y de las estrategias. No comparte datos con esos módulos, no afecta ningún flujo existente.

---

## Qué se va a implementar

Un sistema de notas privado tipo wiki/Notion simplificado donde el usuario puede crear páginas con contenido mixto (texto markdown y galerías de imágenes). Las notas forman un árbol jerárquico sin límite de profundidad (una nota puede contener sub-notas, que a su vez contienen sub-notas). Cada nota puede tener tags independientes de la jerarquía. El sistema está diseñado para almacenar investigación privada que a futuro se exportará para entrenar una IA.

---

## Modelo de datos — nuevas tablas

### `notes`

Tabla principal. Cada nota es una "página" con título. La jerarquía se logra con `parent_note_id` autorreferencial.

```sql
CREATE TABLE notes (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  parent_note_id  INTEGER REFERENCES notes(id) ON DELETE CASCADE,
  title           VARCHAR(500) NOT NULL DEFAULT 'Sin título',
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at      TIMESTAMP DEFAULT NULL
);
```

**Reglas:**
- `parent_note_id = NULL` → nota raíz
- `parent_note_id` apunta a otra nota del mismo usuario → sub-nota
- `ON DELETE CASCADE` → al eliminar una nota padre, se eliminan todas las sub-notas recursivamente
- `position` determina el orden entre notas hermanas (0, 1, 2...)
- Soft delete con `deleted_at` para permitir recuperación futura
- El `title` es editable en cualquier momento

---

### `note_blocks`

Contenido de cada nota. Cada bloque es una unidad de contenido ordenada dentro de la nota. Tres tipos: texto markdown, galería de imágenes, o enlace a sub-nota.

```sql
CREATE TABLE note_blocks (
  id              SERIAL PRIMARY KEY,
  note_id         INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  block_type      VARCHAR(20) NOT NULL CHECK (block_type IN ('text', 'image_gallery', 'note_link')),
  content         TEXT,
  linked_note_id  INTEGER REFERENCES notes(id) ON DELETE SET NULL,
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Reglas por tipo de bloque:**

- **`text`**: `content` contiene texto markdown (headings con `#`, listas con `*` o `-`, texto normal). `linked_note_id` es NULL.
- **`image_gallery`**: `content` es NULL. Las imágenes se almacenan en `note_block_images`. `linked_note_id` es NULL.
- **`note_link`**: `content` es NULL. `linked_note_id` apunta a una sub-nota. Al renderizar, se muestra como un enlace/card clickeable que lleva a esa sub-nota. Si la sub-nota se elimina, `linked_note_id` queda NULL y el bloque se puede limpiar en el frontend.

---

### `note_block_images`

Imágenes dentro de un bloque de galería. Un bloque de galería puede tener múltiples imágenes.

```sql
CREATE TABLE note_block_images (
  id              SERIAL PRIMARY KEY,
  block_id        INTEGER NOT NULL REFERENCES note_blocks(id) ON DELETE CASCADE,
  image_path      VARCHAR(500) NOT NULL,
  caption         VARCHAR(1000),
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Reglas:**
- `image_path` almacena el nombre del archivo en `backend/uploads/` (mismo directorio que usa el sistema actual de imágenes de trades)
- `caption` es opcional, texto descriptivo de la imagen (útil para futura extracción IA)
- `position` ordena las imágenes dentro de la galería
- `ON DELETE CASCADE` desde `note_blocks` → al eliminar un bloque galería, se eliminan sus imágenes de la DB (los archivos físicos se limpian desde el service)

---

### `note_tags`

Tags del usuario. Son globales — un tag existe una vez y se puede asignar a cualquier nota.

```sql
CREATE TABLE note_tags (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  name            VARCHAR(100) NOT NULL,
  color           VARCHAR(7) DEFAULT '#6B7280',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Reglas:**
- `name` debe ser único por usuario (enforced con UNIQUE constraint compuesto)
- `color` es un hex color para identificación visual en el frontend
- Los tags no se eliminan en cascada al eliminar notas — persisten hasta que el usuario los elimine explícitamente

---

### `note_tag_assignments`

Tabla pivot para la relación muchos-a-muchos entre notas y tags.

```sql
CREATE TABLE note_tag_assignments (
  id              SERIAL PRIMARY KEY,
  note_id         INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id          INTEGER NOT NULL REFERENCES note_tags(id) ON DELETE CASCADE,
  UNIQUE(note_id, tag_id)
);
```

---

### Índices

```sql
CREATE INDEX idx_notes_user_id ON notes(user_id);
CREATE INDEX idx_notes_parent ON notes(parent_note_id);
CREATE INDEX idx_notes_deleted ON notes(deleted_at);
CREATE INDEX idx_note_blocks_note_id ON note_blocks(note_id);
CREATE INDEX idx_note_blocks_linked_note ON note_blocks(linked_note_id);
CREATE INDEX idx_note_block_images_block_id ON note_block_images(block_id);
CREATE INDEX idx_note_tags_user_id ON note_tags(user_id);
CREATE UNIQUE INDEX idx_note_tags_unique_name ON note_tags(user_id, LOWER(name));
CREATE INDEX idx_note_tag_assignments_note ON note_tag_assignments(note_id);
CREATE INDEX idx_note_tag_assignments_tag ON note_tag_assignments(tag_id);
```

### Trigger para updated_at

```sql
CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_note_blocks_updated_at
  BEFORE UPDATE ON note_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

La función `update_updated_at_column()` ya existe en el proyecto (`triggers.sql`).

---

### Archivo de migración

Crear archivo: `database/migration_notes.sql` con todo el DDL anterior en orden:
1. Tabla `notes`
2. Tabla `note_blocks`
3. Tabla `note_block_images`
4. Tabla `note_tags`
5. Tabla `note_tag_assignments`
6. Todos los índices
7. Triggers

---

## Backend — archivos nuevos

### Estructura de archivos a crear

```
backend/src/
  repositories/note.repository.js
  services/note.service.js
  controllers/note.controller.js
  routes/note.routes.js
  validators/note.validator.js
```

---

### `src/validators/note.validator.js`

Schemas Joi para validar los requests:

**Crear nota:**
- `title`: string, opcional (default "Sin título"), max 500 chars
- `parent_note_id`: number, entero, opcional (null = nota raíz)

**Actualizar título de nota:**
- `title`: string, requerido, max 500 chars

**Reordenar notas (hermanas):**
- `note_ids`: array de enteros, requerido, mínimo 1 elemento (el array completo de IDs hermanos en el nuevo orden)

**Mover nota (cambiar padre):**
- `parent_note_id`: number o null, requerido (null = mover a raíz)

**Crear bloque:**
- `block_type`: string, requerido, valores: 'text', 'image_gallery', 'note_link'
- `content`: string, opcional, max 50000 chars (solo para tipo text)
- `linked_note_id`: number, entero, opcional (solo para tipo note_link)
- `position`: number, entero, opcional (si no se envía, se agrega al final)

**Actualizar bloque de texto:**
- `content`: string, requerido, max 50000 chars

**Reordenar bloques:**
- `block_ids`: array de enteros, requerido (el array completo de IDs de bloques en el nuevo orden)

**Crear tag:**
- `name`: string, requerido, max 100 chars, trim
- `color`: string, opcional, regex `/^#[0-9A-Fa-f]{6}$/`

**Actualizar tag:**
- `name`: string, opcional, max 100 chars
- `color`: string, opcional, regex `/^#[0-9A-Fa-f]{6}$/`

**Asignar tags a nota:**
- `tag_ids`: array de enteros, requerido

**Agregar imagen a galería (no es Joi, es multer):**
- Archivo(s) de imagen: mismo middleware de upload existente (`middleware/upload.js`)
- `caption`: string, opcional, max 1000 chars (viene como campo del form-data)

**Actualizar caption de imagen:**
- `caption`: string, opcional (puede ser null para eliminar), max 1000 chars

---

### `src/repositories/note.repository.js`

Queries SQL parametrizadas. Todas las queries de notas filtran por `user_id` y `deleted_at IS NULL` (excepto donde se indique lo contrario).

**Notas:**

- `getTree(userId)` — Obtiene TODAS las notas del usuario (solo id, parent_note_id, title, position, created_at, updated_at) para construir el árbol en el frontend. Query:
```sql
SELECT n.id, n.parent_note_id, n.title, n.position, n.created_at, n.updated_at,
  (SELECT COUNT(*) FROM note_blocks nb WHERE nb.note_id = n.id) as block_count,
  COALESCE(
    (SELECT json_agg(json_build_object('id', nt.id, 'name', nt.name, 'color', nt.color))
     FROM note_tag_assignments nta
     JOIN note_tags nt ON nt.id = nta.tag_id
     WHERE nta.note_id = n.id), '[]'
  ) as tags
FROM notes n
WHERE n.user_id = $1 AND n.deleted_at IS NULL
ORDER BY n.position ASC, n.created_at ASC
```

- `getById(userId, noteId)` — Obtiene una nota con todos sus bloques e imágenes:
```sql
-- Query 1: La nota
SELECT * FROM notes WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL

-- Query 2: Los bloques de la nota, ordenados
SELECT nb.*, 
  COALESCE(
    (SELECT json_agg(
      json_build_object('id', nbi.id, 'image_path', nbi.image_path, 'caption', nbi.caption, 'position', nbi.position)
      ORDER BY nbi.position ASC
    )
    FROM note_block_images nbi WHERE nbi.block_id = nb.id), '[]'
  ) as images,
  ln.title as linked_note_title
FROM note_blocks nb
LEFT JOIN notes ln ON ln.id = nb.linked_note_id AND ln.deleted_at IS NULL
WHERE nb.note_id = $1
ORDER BY nb.position ASC

-- Query 3: Los tags asignados
SELECT nt.id, nt.name, nt.color
FROM note_tag_assignments nta
JOIN note_tags nt ON nt.id = nta.tag_id
WHERE nta.note_id = $1
```

- `create(userId, { title, parent_note_id })` — Inserta nota. Calcula `position` como MAX(position) + 1 entre hermanas.

- `updateTitle(userId, noteId, title)` — UPDATE title.

- `softDelete(userId, noteId)` — UPDATE `deleted_at = NOW()`. También hace soft delete recursivo de todas las sub-notas:
```sql
WITH RECURSIVE descendants AS (
  SELECT id FROM notes WHERE id = $1 AND user_id = $2
  UNION ALL
  SELECT n.id FROM notes n INNER JOIN descendants d ON n.parent_note_id = d.id
)
UPDATE notes SET deleted_at = NOW() WHERE id IN (SELECT id FROM descendants)
```

- `move(userId, noteId, newParentId)` — UPDATE `parent_note_id`. Validar que `newParentId` no sea descendiente de `noteId` (prevenir ciclos):
```sql
-- Verificar que newParentId no es descendiente de noteId
WITH RECURSIVE descendants AS (
  SELECT id FROM notes WHERE id = $1  -- noteId
  UNION ALL
  SELECT n.id FROM notes n INNER JOIN descendants d ON n.parent_note_id = d.id
)
SELECT EXISTS(SELECT 1 FROM descendants WHERE id = $2)  -- newParentId
```

- `reorderSiblings(userId, noteIds)` — UPDATE posiciones en batch. Valida que todos los IDs son hermanos y pertenecen al usuario.

**Bloques:**

- `createBlock(noteId, { block_type, content, linked_note_id, position })` — INSERT. Si `position` no se envía, calcular como MAX(position) + 1.

- `updateBlockContent(blockId, content)` — UPDATE content (solo para bloques tipo text).

- `deleteBlock(blockId)` — DELETE. Retorna los `image_path` de las imágenes del bloque (si era galería) para que el service limpie los archivos físicos.
```sql
-- Primero obtener las imágenes para limpiar archivos
SELECT image_path FROM note_block_images WHERE block_id = $1;
-- Luego eliminar el bloque (cascade elimina las imágenes de la DB)
DELETE FROM note_blocks WHERE id = $1 RETURNING *;
```

- `reorderBlocks(noteId, blockIds)` — UPDATE posiciones en batch.

**Imágenes de bloque:**

- `addImage(blockId, { image_path, caption, position })` — INSERT en `note_block_images`.

- `updateImageCaption(imageId, caption)` — UPDATE caption.

- `deleteImage(imageId)` — DELETE. Retorna `image_path` para que el service limpie el archivo físico.

- `reorderImages(blockId, imageIds)` — UPDATE posiciones en batch.

**Tags:**

- `getTags(userId)` — SELECT todos los tags del usuario.

- `createTag(userId, { name, color })` — INSERT. Valida unicidad de nombre (case-insensitive) por usuario.

- `updateTag(userId, tagId, { name, color })` — UPDATE.

- `deleteTag(userId, tagId)` — DELETE (hard delete, cascade elimina las asignaciones).

- `assignTags(noteId, tagIds)` — Reemplaza todos los tags de una nota. DELETE existentes + INSERT nuevos en transacción.

- `removeTags(noteId, tagIds)` — DELETE asignaciones específicas.

**Exportación:**

- `getFullTree(userId)` — Obtiene el árbol completo con todo el contenido de todas las notas, bloques, imágenes y tags. Usado para exportación. Query con CTEs recursivas.

---

### `src/services/note.service.js`

Lógica de negocio. Todas las operaciones verifican propiedad del usuario.

**getTree(userId):**
- Llama a `repository.getTree(userId)`
- Retorna el array plano — el frontend construye el árbol

**getNote(userId, noteId):**
- Llama a `repository.getById(userId, noteId)`
- Si no existe → NotFoundError

**createNote(userId, data):**
- Si `parent_note_id` viene, verificar que la nota padre existe y pertenece al usuario
- Llama a `repository.create(userId, data)`
- Retorna la nota creada

**updateNoteTitle(userId, noteId, title):**
- Verificar que la nota existe y pertenece al usuario
- Llama a `repository.updateTitle(userId, noteId, title)`

**deleteNote(userId, noteId):**
- Verificar que la nota existe y pertenece al usuario
- Obtener todas las imágenes de todos los bloques de la nota y sus descendientes (para limpiar archivos físicos)
- Llama a `repository.softDelete(userId, noteId)`
- Limpiar archivos de imágenes del filesystem usando `fileUtils.js` existente

**moveNote(userId, noteId, newParentId):**
- Verificar que la nota existe y pertenece al usuario
- Si `newParentId` no es null: verificar que existe, pertenece al usuario, y NO es descendiente de `noteId` (prevenir ciclos). Si es descendiente → ValidationError "No puedes mover una nota dentro de sí misma o sus sub-notas"
- Llama a `repository.move(userId, noteId, newParentId)`

**reorderNotes(userId, noteIds):**
- Verificar que todas las notas existen, pertenecen al usuario, y son hermanas (mismo parent_note_id)
- Llama a `repository.reorderSiblings(userId, noteIds)`

**createBlock(userId, noteId, data):**
- Verificar que la nota existe y pertenece al usuario
- Si `block_type === 'note_link'`: verificar que `linked_note_id` existe y pertenece al usuario
- Llama a `repository.createBlock(noteId, data)`

**updateBlockContent(userId, blockId, content):**
- Verificar que el bloque existe, la nota pertenece al usuario, y el bloque es tipo 'text'
- Llama a `repository.updateBlockContent(blockId, content)`

**deleteBlock(userId, blockId):**
- Verificar que el bloque existe y la nota pertenece al usuario
- Llama a `repository.deleteBlock(blockId)`
- Si el bloque tenía imágenes, eliminar archivos físicos

**reorderBlocks(userId, noteId, blockIds):**
- Verificar que la nota pertenece al usuario y todos los blockIds pertenecen a esa nota
- Llama a `repository.reorderBlocks(noteId, blockIds)`

**addImageToBlock(userId, blockId, file, caption):**
- Verificar que el bloque existe, la nota pertenece al usuario, y el bloque es tipo 'image_gallery'
- `file` ya viene procesado por multer (mismo middleware que trades)
- Calcular position como MAX + 1
- Llama a `repository.addImage(blockId, { image_path: file.filename, caption, position })`

**updateImageCaption(userId, imageId, caption):**
- Verificar que la imagen existe y la nota de su bloque pertenece al usuario
- Llama a `repository.updateImageCaption(imageId, caption)`

**deleteImage(userId, imageId):**
- Verificar que la imagen existe y la nota de su bloque pertenece al usuario
- Llama a `repository.deleteImage(imageId)`
- Eliminar archivo físico del filesystem

**reorderImages(userId, blockId, imageIds):**
- Verificar propiedad y que todas las imágenes pertenecen al bloque
- Llama a `repository.reorderImages(blockId, imageIds)`

**Tags — CRUD:**
- `getTags(userId)` — lista de tags
- `createTag(userId, data)` — crear tag. Si el nombre ya existe (case-insensitive) → ValidationError "Ya existe un tag con ese nombre"
- `updateTag(userId, tagId, data)` — actualizar. Misma validación de unicidad
- `deleteTag(userId, tagId)` — eliminar tag (hard delete)

**Tags — Asignación:**
- `assignTags(userId, noteId, tagIds)` — verificar que la nota y todos los tags pertenecen al usuario, luego asignar
- `removeTags(userId, noteId, tagIds)` — verificar y remover

**Exportación:**

- `exportAsJSON(userId)` — Retorna el árbol completo estructurado:
```json
{
  "exported_at": "2026-04-13T...",
  "version": "1.0",
  "notes": [
    {
      "id": 1,
      "title": "Investigación principal",
      "tags": ["trading", "IA"],
      "blocks": [
        {
          "type": "text",
          "content": "# Introducción\n\nEsto es markdown..."
        },
        {
          "type": "image_gallery",
          "images": [
            { "filename": "123-abc.png", "caption": "Gráfico de ejemplo" }
          ]
        },
        {
          "type": "note_link",
          "linked_note_title": "Sub-tema 1"
        }
      ],
      "children": [
        {
          "id": 2,
          "title": "Sub-tema 1",
          "tags": ["macd"],
          "blocks": [...],
          "children": [...]
        }
      ]
    }
  ]
}
```

- `exportAsMarkdown(userId)` — Retorna un string markdown con el árbol completo. Cada nota es una sección con heading según su nivel de profundidad. Las imágenes se representan como `![caption](filename)`. Los tags se incluyen como metadata al inicio de cada sección.

---

### `src/controllers/note.controller.js`

Controllers thin que delegan al service. Patrón idéntico a los controllers existentes en el proyecto.

**Funciones del controller:**

```
getTree         → noteService.getTree(req.user.id)
getNote         → noteService.getNote(req.user.id, req.params.id)
createNote      → noteService.createNote(req.user.id, req.body)
updateNoteTitle → noteService.updateNoteTitle(req.user.id, req.params.id, req.body.title)
deleteNote      → noteService.deleteNote(req.user.id, req.params.id)
moveNote        → noteService.moveNote(req.user.id, req.params.id, req.body.parent_note_id)
reorderNotes    → noteService.reorderNotes(req.user.id, req.body.note_ids)

createBlock     → noteService.createBlock(req.user.id, req.params.noteId, req.body)
updateBlock     → noteService.updateBlockContent(req.user.id, req.params.blockId, req.body.content)
deleteBlock     → noteService.deleteBlock(req.user.id, req.params.blockId)
reorderBlocks   → noteService.reorderBlocks(req.user.id, req.params.noteId, req.body.block_ids)

addImage        → noteService.addImageToBlock(req.user.id, req.params.blockId, req.file, req.body.caption)
updateImage     → noteService.updateImageCaption(req.user.id, req.params.imageId, req.body.caption)
deleteImage     → noteService.deleteImage(req.user.id, req.params.imageId)
reorderImages   → noteService.reorderImages(req.user.id, req.params.blockId, req.body.image_ids)

getTags         → noteService.getTags(req.user.id)
createTag       → noteService.createTag(req.user.id, req.body)
updateTag       → noteService.updateTag(req.user.id, req.params.tagId, req.body)
deleteTag       → noteService.deleteTag(req.user.id, req.params.tagId)
assignTags      → noteService.assignTags(req.user.id, req.params.noteId, req.body.tag_ids)
removeTags      → noteService.removeTags(req.user.id, req.params.noteId, req.body.tag_ids)

exportJSON      → noteService.exportAsJSON(req.user.id)
exportMarkdown  → noteService.exportAsMarkdown(req.user.id)
```

---

### `src/routes/note.routes.js`

Todas las rutas requieren el middleware `authenticate` existente. Usar `validate` middleware con los schemas de Joi donde aplique.

```
# Notas — CRUD y navegación
GET     /api/notes/tree                              → getTree
POST    /api/notes                                   → createNote
GET     /api/notes/:id                               → getNote
PATCH   /api/notes/:id/title                         → updateNoteTitle
DELETE  /api/notes/:id                               → deleteNote
PATCH   /api/notes/:id/move                          → moveNote
PATCH   /api/notes/reorder                           → reorderNotes

# Bloques dentro de una nota
POST    /api/notes/:noteId/blocks                    → createBlock
PATCH   /api/notes/blocks/:blockId                   → updateBlock
DELETE  /api/notes/blocks/:blockId                   → deleteBlock
PATCH   /api/notes/:noteId/blocks/reorder            → reorderBlocks

# Imágenes dentro de un bloque galería
POST    /api/notes/blocks/:blockId/images            → addImage (multer middleware)
PATCH   /api/notes/images/:imageId                   → updateImage
DELETE  /api/notes/images/:imageId                   → deleteImage
PATCH   /api/notes/blocks/:blockId/images/reorder    → reorderImages

# Tags
GET     /api/notes/tags                              → getTags
POST    /api/notes/tags                              → createTag
PATCH   /api/notes/tags/:tagId                       → updateTag
DELETE  /api/notes/tags/:tagId                        → deleteTag
POST    /api/notes/:noteId/tags                      → assignTags
DELETE  /api/notes/:noteId/tags                      → removeTags

# Exportación
GET     /api/notes/export/json                       → exportJSON
GET     /api/notes/export/markdown                   → exportMarkdown
```

**Nota sobre el middleware de upload:** Reutilizar el mismo middleware `upload.js` existente (multer configurado con `backend/uploads/`). Para el endpoint de `addImage`, usar `upload.single('image')` o `upload.array('images', 10)` según se prefiera upload individual o múltiple.

---

### `src/server.js`

Registrar las nuevas rutas:
```js
import noteRoutes from './routes/note.routes.js'
app.use('/api/notes', noteRoutes)
```

---

## Shapes de respuesta de la API

### GET /api/notes/tree — árbol plano

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "parent_note_id": null,
      "title": "Investigación RSI",
      "position": 0,
      "block_count": 5,
      "tags": [
        { "id": 1, "name": "trading", "color": "#3B82F6" }
      ],
      "created_at": "2026-04-13T...",
      "updated_at": "2026-04-13T..."
    },
    {
      "id": 2,
      "parent_note_id": 1,
      "title": "Divergencias alcistas",
      "position": 0,
      "block_count": 3,
      "tags": [],
      "created_at": "2026-04-13T...",
      "updated_at": "2026-04-13T..."
    }
  ]
}
```

El frontend construye la estructura de árbol a partir del array plano usando `parent_note_id`.

### GET /api/notes/:id — nota con contenido completo

```json
{
  "success": true,
  "data": {
    "id": 1,
    "parent_note_id": null,
    "title": "Investigación RSI",
    "position": 0,
    "tags": [
      { "id": 1, "name": "trading", "color": "#3B82F6" }
    ],
    "blocks": [
      {
        "id": 10,
        "block_type": "text",
        "content": "# Introducción\n\nEl RSI es un oscilador...",
        "linked_note_id": null,
        "linked_note_title": null,
        "position": 0,
        "images": []
      },
      {
        "id": 11,
        "block_type": "image_gallery",
        "content": null,
        "linked_note_id": null,
        "linked_note_title": null,
        "position": 1,
        "images": [
          {
            "id": 100,
            "image_path": "1770138471453-2b400da4.png",
            "caption": "RSI divergencia en BTCUSDT 4h",
            "position": 0
          },
          {
            "id": 101,
            "image_path": "1770184195924-6602d9ad.png",
            "caption": null,
            "position": 1
          }
        ]
      },
      {
        "id": 12,
        "block_type": "note_link",
        "content": null,
        "linked_note_id": 2,
        "linked_note_title": "Divergencias alcistas",
        "position": 2,
        "images": []
      }
    ],
    "created_at": "2026-04-13T...",
    "updated_at": "2026-04-13T..."
  }
}
```

### GET /api/notes/tags — lista de tags

```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "trading", "color": "#3B82F6" },
    { "id": 2, "name": "RSI", "color": "#EF4444" },
    { "id": 3, "name": "MACD", "color": "#10B981" }
  ]
}
```

### GET /api/notes/export/json — exportación completa

```json
{
  "success": true,
  "data": {
    "exported_at": "2026-04-13T10:00:00Z",
    "version": "1.0",
    "total_notes": 15,
    "total_tags": 5,
    "tags": [
      { "name": "trading", "color": "#3B82F6" },
      { "name": "RSI", "color": "#EF4444" }
    ],
    "notes": [
      {
        "id": 1,
        "title": "Investigación RSI",
        "tags": ["trading", "RSI"],
        "created_at": "2026-04-13T...",
        "blocks": [
          { "type": "text", "content": "# Introducción\n\n..." },
          {
            "type": "image_gallery",
            "images": [
              { "filename": "1770138471453-2b400da4.png", "caption": "RSI divergencia" }
            ]
          },
          { "type": "note_link", "linked_note_title": "Divergencias alcistas" }
        ],
        "children": [
          {
            "id": 2,
            "title": "Divergencias alcistas",
            "tags": ["RSI"],
            "blocks": [...],
            "children": []
          }
        ]
      }
    ]
  }
}
```

### GET /api/notes/export/markdown — exportación como texto

Respuesta con `Content-Type: text/markdown`:

```markdown
# Investigación RSI
> Tags: trading, RSI

## Introducción

El RSI es un oscilador...

![RSI divergencia](1770138471453-2b400da4.png)

→ Sub-nota: Divergencias alcistas

## Divergencias alcistas
> Tags: RSI

Contenido de la sub-nota...
```

Cada nivel de profundidad incrementa el nivel de heading markdown (# → ## → ### etc, hasta ######).

---

## Frontend — nuevos archivos y modificaciones

### Nuevos archivos a crear

```
frontend/src/
  hooks/useNotes.js
  pages/Notes.jsx
  pages/NoteEditor.jsx
  components/notes/
    NoteTree.jsx
    NoteTreeItem.jsx
    NoteBlockList.jsx
    NoteTextBlock.jsx
    NoteImageGalleryBlock.jsx
    NoteLinkBlock.jsx
    NoteBlockInsert.jsx
    NoteTagManager.jsx
    NoteTagBadge.jsx
    NoteBreadcrumb.jsx
    NoteExportMenu.jsx
```

### Archivos existentes a modificar

```
frontend/src/
  api/endpoints.js          → agregar funciones de API de notas
  components/layout/Header.jsx → agregar link de navegación a "Notas"
  App.jsx                   → agregar rutas /notes y /notes/:id
```

---

### `src/api/endpoints.js` — nuevas funciones

Agregar todas las funciones que llaman a la API de notas. Seguir el mismo patrón de las funciones existentes (usar `client` de Axios).

```js
// Notas
export const getNoteTree = () => client.get('/notes/tree')
export const getNote = (id) => client.get(`/notes/${id}`)
export const createNote = (data) => client.post('/notes', data)
export const updateNoteTitle = (id, title) => client.patch(`/notes/${id}/title`, { title })
export const deleteNote = (id) => client.delete(`/notes/${id}`)
export const moveNote = (id, parent_note_id) => client.patch(`/notes/${id}/move`, { parent_note_id })
export const reorderNotes = (note_ids) => client.patch('/notes/reorder', { note_ids })

// Bloques
export const createBlock = (noteId, data) => client.post(`/notes/${noteId}/blocks`, data)
export const updateBlock = (blockId, content) => client.patch(`/notes/blocks/${blockId}`, { content })
export const deleteBlock = (blockId) => client.delete(`/notes/blocks/${blockId}`)
export const reorderBlocks = (noteId, block_ids) => client.patch(`/notes/${noteId}/blocks/reorder`, { block_ids })

// Imágenes
export const addBlockImage = (blockId, formData) => client.post(`/notes/blocks/${blockId}/images`, formData)
export const updateImageCaption = (imageId, caption) => client.patch(`/notes/images/${imageId}`, { caption })
export const deleteBlockImage = (imageId) => client.delete(`/notes/images/${imageId}`)
export const reorderBlockImages = (blockId, image_ids) => client.patch(`/notes/blocks/${blockId}/images/reorder`, { image_ids })

// Tags
export const getNoteTags = () => client.get('/notes/tags')
export const createNoteTag = (data) => client.post('/notes/tags', data)
export const updateNoteTag = (tagId, data) => client.patch(`/notes/tags/${tagId}`, data)
export const deleteNoteTag = (tagId) => client.delete(`/notes/tags/${tagId}`)
export const assignNoteTags = (noteId, tag_ids) => client.post(`/notes/${noteId}/tags`, { tag_ids })
export const removeNoteTags = (noteId, tag_ids) => client.delete(`/notes/${noteId}/tags`, { data: { tag_ids } })

// Exportación
export const exportNotesJSON = () => client.get('/notes/export/json')
export const exportNotesMarkdown = () => client.get('/notes/export/markdown')
```

---

### `src/hooks/useNotes.js` — React Query hooks

Hooks usando TanStack Query. Seguir el patrón de `useTrades.js` y `useBacktest.js`.

**Query keys factory:**
```js
export const noteKeys = {
  all: ['notes'],
  tree: () => [...noteKeys.all, 'tree'],
  detail: (id) => [...noteKeys.all, 'detail', id],
  tags: () => [...noteKeys.all, 'tags'],
}
```

**Hooks:**

- `useNoteTree()` — `useQuery` que llama `getNoteTree()`. Transforma el array plano en estructura de árbol en el `select` de la query.
- `useNote(id)` — `useQuery` que llama `getNote(id)`. Enabled solo cuando `id` está definido.
- `useCreateNote()` — `useMutation` que invalida `noteKeys.tree()` on success.
- `useUpdateNoteTitle()` — `useMutation` que invalida `noteKeys.tree()` y `noteKeys.detail(id)`.
- `useDeleteNote()` — `useMutation` que invalida `noteKeys.tree()`.
- `useMoveNote()` — `useMutation` que invalida `noteKeys.tree()`.
- `useCreateBlock()` — `useMutation` que invalida `noteKeys.detail(noteId)`.
- `useUpdateBlock()` — `useMutation` que invalida `noteKeys.detail(noteId)`.
- `useDeleteBlock()` — `useMutation` que invalida `noteKeys.detail(noteId)`.
- `useReorderBlocks()` — `useMutation` con optimistic update.
- `useAddImage()` — `useMutation` que invalida `noteKeys.detail(noteId)`.
- `useDeleteImage()` — `useMutation` que invalida `noteKeys.detail(noteId)`.
- `useNoteTags()` — `useQuery` que llama `getNoteTags()`.
- `useCreateTag()` — `useMutation` que invalida `noteKeys.tags()`.
- `useAssignTags()` — `useMutation` que invalida `noteKeys.detail(noteId)` y `noteKeys.tree()`.

**Importante sobre el guardado de texto:** Los bloques de texto NO se guardan en cada keystroke. Usar **debounce de 1 segundo** después de que el usuario deja de escribir. El hook `useUpdateBlock` se invoca con el contenido debounced. Mientras el texto no se ha guardado, mostrar un indicador sutil "Guardando..." / "Guardado".

---

### `src/App.jsx` — nuevas rutas

```jsx
import Notes from './pages/Notes.jsx'
import NoteEditor from './pages/NoteEditor.jsx'

// Dentro del Router, agregar:
<Route path="/notes" element={<ProtectedRoute><Notes /></ProtectedRoute>} />
<Route path="/notes/:id" element={<ProtectedRoute><NoteEditor /></ProtectedRoute>} />
```

---

### `src/components/layout/Header.jsx`

Agregar link de navegación "Notas" al header, entre los links existentes. Usar el mismo estilo que los links de "Trades", "Stats", "Backtest", "Settings".

---

### `src/pages/Notes.jsx` — página principal de notas

Layout de dos paneles (cuando hay espacio):

**Panel izquierdo — Sidebar de navegación (NoteTree):**
- Árbol expandible/colapsable de notas
- Cada nota muestra su título y badges de tags
- Click en una nota navega a `/notes/:id`
- Botón "+" al lado de cada nota para crear sub-nota
- Botón "+" global en la parte superior para crear nota raíz
- En pantallas pequeñas, el sidebar es un drawer/overlay que se puede abrir/cerrar

**Panel derecho — contenido:**
- Si no hay nota seleccionada: mostrar EmptyState con mensaje "Selecciona una nota o crea una nueva"
- Si hay nota seleccionada: renderiza el componente `NoteEditor`

**Barra superior:**
- Botón de exportación (dropdown: JSON / Markdown)
- Botón para gestionar tags (abre modal)

---

### `src/pages/NoteEditor.jsx` — editor de nota

La página principal de edición de una nota.

**Cabecera:**
- Breadcrumb mostrando la ruta jerárquica: `Raíz > Nota padre > Nota actual`
- Título editable — input que al perder focus (onBlur) o Enter guarda el cambio
- Tags de la nota como badges con botón para agregar/quitar tags

**Contenido — lista de bloques:**
- Renderiza `NoteBlockList` que itera los bloques ordenados
- Entre cada bloque y al final, muestra `NoteBlockInsert` (botón "+" sutil)
- Cada bloque según su tipo renderiza el componente correspondiente

**Indicador de estado:**
- "Guardando..." cuando hay una mutación pendiente
- "Guardado" cuando todo está sincronizado

---

### `src/components/notes/NoteTree.jsx`

Componente recursivo que renderiza el árbol de notas.

**Props:** `notes` (array plano del tree query), `selectedNoteId`, `onSelect`, `onCreateChild`

**Comportamiento:**
- Construye el árbol a partir del array plano (agrupar por `parent_note_id`)
- Renderiza `NoteTreeItem` para cada nota
- Las notas con hijos tienen un toggle expand/collapse (ícono chevron)
- Estado de expansión se mantiene en localStorage para persistir entre sesiones
- La nota seleccionada se resalta visualmente

---

### `src/components/notes/NoteTreeItem.jsx`

Un item individual del árbol.

**Props:** `note`, `depth`, `isExpanded`, `isSelected`, `onToggle`, `onSelect`, `onCreateChild`, `children`

**Renderiza:**
- Indentación según `depth` (padding-left proporcional)
- Ícono de chevron si tiene hijos (rotación animada)
- Título de la nota (truncado si es largo)
- Badges de tags (solo colores, sin texto, para ahorrar espacio)
- Botón "+" visible on hover para crear sub-nota
- Hover state y selected state con colores del tema

---

### `src/components/notes/NoteBlockList.jsx`

Renderiza la secuencia de bloques de una nota.

**Props:** `blocks` (array del API), `noteId`

**Renderiza:**
- `NoteBlockInsert` al inicio (para insertar antes del primer bloque)
- Para cada bloque:
  - Si `block_type === 'text'` → `NoteTextBlock`
  - Si `block_type === 'image_gallery'` → `NoteImageGalleryBlock`
  - Si `block_type === 'note_link'` → `NoteLinkBlock`
  - Botón de eliminar bloque (ícono trash, visible on hover)
  - `NoteBlockInsert` después de cada bloque
- Flechas arriba/abajo para reordenar bloques (visible on hover) — V1 usa flechas, no drag & drop

---

### `src/components/notes/NoteTextBlock.jsx`

Bloque de texto con markdown.

**Props:** `block`, `onUpdate`

**Comportamiento:**
- Tiene dos modos: **edición** y **preview**
- **Modo edición (default al hacer click):** textarea auto-expandible que crece con el contenido. El usuario escribe markdown libremente.
- **Modo preview (al hacer click fuera o botón toggle):** renderiza el markdown como HTML. Para el rendering usar una librería ligera como `marked` o `react-markdown` con soporte para headings (`#`), listas (`*`, `-`, números), negritas (`**`), itálicas (`_`), y código inline. No necesita soporte para tablas, imágenes inline, ni features avanzados de markdown.
- El contenido se guarda con debounce de 1 segundo mientras el usuario escribe (no necesita guardar manualmente ni cambiar de modo)
- El textarea tiene un min-height de 60px y padding cómodo

**Dependencia nueva:** `react-markdown` (o `marked` + `DOMPurify` para sanitizar HTML). Agregar al `package.json` del frontend.

---

### `src/components/notes/NoteImageGalleryBlock.jsx`

Bloque de galería de imágenes.

**Props:** `block`, `noteId`

**Renderiza:**
- Grid de imágenes (2-3 columnas según ancho disponible)
- Cada imagen:
  - Thumbnail clickeable que abre el `ImageViewer` existente (modal fullscreen)
  - Caption editable debajo (input que guarda onBlur)
  - Botón eliminar imagen (ícono X, esquina superior)
- Zona de "drag & drop" o botón para agregar imagen(es)
- El upload usa el mismo patrón de `useImageUpload.js` existente, adaptado para el endpoint de notas
- Flechas para reordenar imágenes (V1)

---

### `src/components/notes/NoteLinkBlock.jsx`

Bloque que referencia una sub-nota.

**Props:** `block`

**Renderiza:**
- Card con el título de la nota vinculada
- Click en la card navega a `/notes/:linked_note_id`
- Si `linked_note_id` es null (la nota fue eliminada), mostrar estado "Nota eliminada" en gris
- Ícono de documento/página

---

### `src/components/notes/NoteBlockInsert.jsx`

Botón de inserción entre bloques.

**Props:** `noteId`, `position`, `onInsert`

**Renderiza:**
- Línea horizontal sutil con un botón "+" centrado
- Visible como línea casi invisible, el "+" aparece on hover
- Al hacer click, muestra un pequeño menú con tres opciones:
  - "Texto" → crea bloque tipo text
  - "Imágenes" → crea bloque tipo image_gallery
  - "Sub-nota" → crea una sub-nota Y un bloque note_link apuntando a ella (en una sola acción desde el frontend: primero llama createNote, luego createBlock con el ID de la nota creada)

---

### `src/components/notes/NoteTagManager.jsx`

Modal para gestionar los tags globales del usuario.

**Props:** `isOpen`, `onClose`

**Renderiza:**
- Lista de todos los tags del usuario
- Cada tag: nombre, color (circle), botón editar, botón eliminar
- Formulario para crear nuevo tag: input nombre + color picker
- Al eliminar un tag, confirmación indicando que se quitará de todas las notas

---

### `src/components/notes/NoteTagBadge.jsx`

Badge visual de un tag.

**Props:** `tag` ({ name, color }), `onRemove` (opcional)

**Renderiza:**
- Pill/badge con el color de fondo del tag y texto del nombre
- Si `onRemove` está presente, muestra una X para quitar el tag de la nota

---

### `src/components/notes/NoteBreadcrumb.jsx`

Breadcrumb de navegación jerárquica.

**Props:** `noteId`, `tree` (el árbol de notas)

**Renderiza:**
- Recorre el árbol desde la nota actual hacia arriba hasta la raíz
- Muestra: `Notas > Abuelo > Padre > Nota actual`
- Cada ancestro es clickeable y navega a esa nota
- "Notas" navega a `/notes`

---

### `src/components/notes/NoteExportMenu.jsx`

Dropdown de opciones de exportación.

**Props:** ninguno (usa los hooks directamente)

**Renderiza:**
- Botón "Exportar" que abre dropdown
- Opción "Exportar como JSON" → llama al endpoint, descarga el archivo como `.json`
- Opción "Exportar como Markdown" → llama al endpoint, descarga como `.md`
- Indicador de loading durante la exportación

---

## Reglas de negocio importantes

1. **Propiedad**: Toda operación verifica que el recurso pertenece al usuario autenticado. Esto incluye verificar la cadena completa: imagen → bloque → nota → usuario.

2. **Prevención de ciclos**: Al mover una nota, verificar que el destino no es descendiente de la nota que se mueve. Esto se valida en el backend con la CTE recursiva.

3. **Cascada en eliminación**:
   - Eliminar nota → soft delete de la nota y todos sus descendientes
   - Eliminar nota → los archivos de imágenes de todos los bloques galería de la nota y sus descendientes se eliminan del filesystem
   - Eliminar bloque galería → los archivos de imágenes se eliminan del filesystem
   - Eliminar imagen individual → el archivo se elimina del filesystem
   - Eliminar tag → se eliminan todas las asignaciones (hard delete)

4. **Soft delete de notas**: Las notas tienen `deleted_at`. Los queries normales filtran `deleted_at IS NULL`. Los bloques y sus imágenes permanecen en la DB (referenciados por la nota soft-deleted) pero no son accesibles. Nota: la limpieza de archivos de imágenes sí se hace inmediatamente al soft-delete, no se espera a una limpieza posterior.

5. **Concurrencia en posiciones**: Las operaciones de reorden reciben el array completo de IDs en el nuevo orden y sobreescriben todas las posiciones. Esto es un approach simple de "last write wins" que evita conflictos.

6. **Markdown básico soportado**: El frontend renderiza solo markdown básico en los bloques de texto: headings (#), listas (* y -), listas numeradas, negritas (**), itálicas (_), código inline (`), y párrafos. No se soporta markdown extendido (tablas, imágenes inline, footnotes, etc).

7. **Imágenes**: Se reutiliza exactamente el mismo sistema de upload existente (multer, misma carpeta `backend/uploads/`, mismos tipos permitidos, mismo límite de tamaño). Las imágenes de notas se sirven por el mismo endpoint estático `GET /api/images/:filename`.

---

## Lo que NO debe cambiar

- El flujo de trades, estadísticas, backtesting y estrategias funciona exactamente igual
- La autenticación no cambia
- El sistema de upload de imágenes existente no se modifica, solo se reutiliza
- El estilo visual general del proyecto se mantiene — las notas deben sentirse parte del mismo diseño
- La carpeta `backend/uploads/` se comparte entre trades, backtest y notas (las imágenes son solo archivos, no importa de qué módulo vengan)

---

## Orden de implementación recomendado

### Fase 1 — Base de datos
1. Crear `database/migration_notes.sql` con todas las tablas, índices y triggers

### Fase 2 — Backend core
2. `validators/note.validator.js` — todos los schemas Joi
3. `repositories/note.repository.js` — todas las queries
4. `services/note.service.js` — toda la lógica de negocio
5. `controllers/note.controller.js` — controllers thin
6. `routes/note.routes.js` — todas las rutas
7. Registrar rutas en `server.js`
8. **Probar todo el backend con curl/Postman antes de pasar al frontend**

### Fase 3 — Frontend estructura
9. `api/endpoints.js` — agregar funciones de API de notas
10. `hooks/useNotes.js` — todos los hooks de React Query
11. `App.jsx` — agregar rutas
12. `Header.jsx` — agregar link de navegación

### Fase 4 — Frontend componentes core
13. `NoteTree.jsx` + `NoteTreeItem.jsx` — navegación del árbol
14. `Notes.jsx` — página principal con sidebar
15. `NoteBreadcrumb.jsx` — navegación jerárquica

### Fase 5 — Frontend editor
16. `NoteTextBlock.jsx` — bloque de texto con markdown
17. `NoteImageGalleryBlock.jsx` — bloque de galería
18. `NoteLinkBlock.jsx` — bloque de enlace
19. `NoteBlockInsert.jsx` — botón de inserción
20. `NoteBlockList.jsx` — lista de bloques
21. `NoteEditor.jsx` — página completa del editor

### Fase 6 — Frontend tags
22. `NoteTagBadge.jsx` — badge visual
23. `NoteTagManager.jsx` — modal de gestión de tags
24. Integrar tags en `NoteEditor.jsx` y `NoteTreeItem.jsx`

### Fase 7 — Exportación
25. `NoteExportMenu.jsx` — dropdown de exportación
26. Backend: implementar la lógica de serialización en `note.service.js`

### Fase 8 — Polish
27. Instalar `react-markdown` en el frontend
28. Probar flujo completo end to end
29. Responsive: asegurar que el sidebar funcione bien en mobile
30. Indicadores de guardado automático
31. Persistencia del estado de expansión del árbol en localStorage

---

## Dependencias nuevas

### Frontend
```bash
npm install react-markdown
```

No se necesitan otras dependencias nuevas. Todo lo demás ya existe en el proyecto.

### Backend
No se necesitan dependencias nuevas. Multer, Joi, pg, etc. ya están instalados.




Resumen de implementación                                                                                                                                                                                                                                   
                                                                                                                                                                                                                                                              
  Base de datos                                                                                                                                                                                                                                               
                                                                                                                                                                                                                                                              
  - database/migration_notes.sql — 5 tablas nuevas (notes, note_blocks, note_block_images, note_tags, note_tag_assignments), índices y triggers. Pendiente de ejecutar manualmente:                                                                           
  psql -d trading_journal -U <usuario> -f database/migration_notes.sql                                                                                                                                                                                        
                                                                                                                                                                                                                                                              
  Backend (5 archivos nuevos + server.js)                                                                                                                                                                                                                     
   
  - validators/note.validator.js — 11 schemas Joi                                                                                                                                                                                                             
  - repositories/note.repository.js — todas las queries SQL parametrizadas                                                                                                                                                                                  
  - services/note.service.js — lógica de negocio, verificación de propiedad, limpieza de archivos, exportación JSON/Markdown                                                                                                                                  
  - controllers/note.controller.js — controllers thin                                                                                                                                                                                                         
  - routes/note.routes.js — 22 rutas, con orden correcto (estáticas antes de :id)                                                                                                                                                                             
  - server.js — registro de noteRoutes                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                              
  Frontend (13 archivos nuevos + 3 modificados)                                                                                                                                                                                                               
                                                            
  Nuevos:
  - hooks/useNotes.js — 16 hooks con React Query, debounce en texto
  - components/notes/NoteTree.jsx — árbol con expansión persistida en localStorage                                                                                                                                                                            
  - components/notes/NoteTreeItem.jsx — ítem del árbol con hover actions          
  - components/notes/NoteBlockList.jsx — lista de bloques con flechas reorder                                                                                                                                                                                 
  - components/notes/NoteTextBlock.jsx — texto markdown con modo edición/preview y debounce 1s
  - components/notes/NoteImageGalleryBlock.jsx — galería con upload, captions, viewer fullscreen                                                                                                                                                              
  - components/notes/NoteLinkBlock.jsx — card de enlace a sub-nota                                                                                                                                                                                            
  - components/notes/NoteBlockInsert.jsx — botón + entre bloques                                                                                                                                                                                              
  - components/notes/NoteTagBadge.jsx — badge de tag                                                                                                                                                                                                          
  - components/notes/NoteTagManager.jsx — modal CRUD de tags con color picker                                                                                                                                                                                 
  - components/notes/NoteBreadcrumb.jsx — navegación jerárquica                                                                                                                                                                                               
  - components/notes/NoteExportMenu.jsx — dropdown de exportación JSON/MD                                                                                                                                                                                     
  - pages/NoteEditor.jsx — editor con breadcrumb, título inline, tag picker                                                                                                                                                                                   
  - pages/Notes.jsx — layout dos paneles, sidebar responsive (drawer en mobile)                                                                                                                                                                               
                                                                                                                                                                                                                                                              
  Modificados:                                                                                                                                                                                                                                                
  - api/endpoints.js — 17 funciones nuevas de API                                                                                                                                                                                                             
  - App.jsx — rutas /notes y /notes/:id                                                                                                                                                                                                                       
  - components/layout/Header.jsx — link "Notas" con ícono BookOpen
