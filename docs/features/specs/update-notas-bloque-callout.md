# Bloque Callout — Instrucciones de implementación

## Contexto

El sistema de notas ya está implementado y funcionando. Los bloques actuales son: `text`, `image_gallery`, `note_link`. Se va a agregar un nuevo tipo `callout` que es un bloque de texto destacado con fondo de color, similar a los callouts de Notion.

**El callout funciona igual que un bloque de texto** (contenido markdown, guardado con debounce, modo edición/preview) pero con un estilo visual diferente: fondo de color y opcionalmente un ícono.

---

## 1. Migración SQL

Crear archivo: `database/migration_note_callout.sql`

```sql
-- Agregar columna metadata JSONB a note_blocks
ALTER TABLE note_blocks ADD COLUMN metadata JSONB DEFAULT '{}';

-- Actualizar CHECK constraint para incluir 'callout'
ALTER TABLE note_blocks DROP CONSTRAINT note_blocks_block_type_check;
ALTER TABLE note_blocks ADD CONSTRAINT note_blocks_block_type_check
  CHECK (block_type IN ('text', 'image_gallery', 'note_link', 'callout'));
```

---

## 2. Backend — cambios en archivos existentes

### `src/validators/note.validator.js`

En el schema de **crear bloque**, agregar `'callout'` a los valores permitidos de `block_type`:

```js
block_type: Joi.string().valid('text', 'image_gallery', 'note_link', 'callout').required()
```

Agregar validación de `metadata` condicional al tipo:

```js
metadata: Joi.when('block_type', {
  is: 'callout',
  then: Joi.object({
    style: Joi.string().valid('info', 'warning', 'success', 'error', 'note').required(),
    icon: Joi.string().max(10).optional()
  }).required(),
  otherwise: Joi.object().default({})
})
```

Agregar un schema para **actualizar metadata de callout** (para cambiar el estilo):

```js
updateCalloutMetadata: Joi.object({
  style: Joi.string().valid('info', 'warning', 'success', 'error', 'note').optional(),
  icon: Joi.string().max(10).allow(null).optional()
})
```

### `src/repositories/note.repository.js`

En `getById` — asegurar que la query de bloques incluya la columna `metadata`:

```sql
SELECT nb.*, nb.metadata,
  -- ... resto de la query existente
```

En `createBlock` — incluir `metadata` en el INSERT:

```sql
INSERT INTO note_blocks (note_id, block_type, content, linked_note_id, position, metadata)
VALUES ($1, $2, $3, $4, $5, $6)
```

Agregar función `updateBlockMetadata(blockId, metadata)`:

```sql
UPDATE note_blocks SET metadata = $2 WHERE id = $1 RETURNING *
```

### `src/services/note.service.js`

En `createBlock` — pasar `metadata` al repositorio. Para callouts, `content` puede inicializarse como string vacío si no viene.

Agregar función `updateBlockMetadata(userId, blockId, metadata)`:
- Verificar que el bloque existe y la nota pertenece al usuario
- Verificar que el bloque es tipo `callout`
- Merge del metadata existente con el nuevo (no reemplazar todo, solo las propiedades que vienen): `{ ...existingMetadata, ...newMetadata }`. Si `icon` viene como `null`, eliminar la propiedad del objeto.
- Llamar a `repository.updateBlockMetadata(blockId, mergedMetadata)`

### `src/controllers/note.controller.js`

Agregar función `updateBlockMetadata`:

```js
updateBlockMetadata → noteService.updateBlockMetadata(req.user.id, req.params.blockId, req.body)
```

### `src/routes/note.routes.js`

Agregar ruta:

```
PATCH /api/notes/blocks/:blockId/metadata → updateBlockMetadata (con validate middleware)
```

---

## 3. Frontend — cambios

### `src/api/endpoints.js`

Agregar:

```js
export const updateBlockMetadata = (blockId, metadata) =>
  client.patch(`/notes/blocks/${blockId}/metadata`, metadata)
```

### `src/hooks/useNotes.js`

Agregar hook `useUpdateBlockMetadata()`:
- `useMutation` que llama `updateBlockMetadata`
- Invalida `noteKeys.detail(noteId)` on success

### `src/components/notes/NoteCalloutBlock.jsx` — ARCHIVO NUEVO

Componente para el bloque callout. Estructura:

**Contenedor exterior:**
- Div con borde izquierdo grueso (4px) y fondo de color según el estilo
- Border radius suave
- Padding interno cómodo

**Estilos predefinidos (colores):**

```js
const CALLOUT_STYLES = {
  info: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-l-blue-500',
    label: 'Información'
  },
  warning: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    border: 'border-l-yellow-500',
    label: 'Advertencia'
  },
  success: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-l-green-500',
    label: 'Éxito'
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-l-red-500',
    label: 'Error'
  },
  note: {
    bg: 'bg-gray-50 dark:bg-gray-800/50',
    border: 'border-l-gray-500',
    label: 'Nota'
  }
}
```

**Barra superior del callout:**
- Si hay ícono (`metadata.icon`), mostrarlo al inicio
- Selector de estilo: dropdown o grupo de botones pequeños con los 5 colores para cambiar el estilo rápidamente. Al cambiar, llama a `updateBlockMetadata` con el nuevo estilo.

**Contenido:**
- Idéntico a `NoteTextBlock`: textarea en modo edición, react-markdown en modo preview
- Guardado con debounce de 1 segundo usando `updateBlock` existente
- El texto se guarda en `content` (igual que text), no en metadata

**Props:** `block`, `onUpdate`, `onUpdateMetadata`

### `src/components/notes/NoteBlockList.jsx`

Agregar el case para callout en el switch/renderizado de bloques:

```jsx
case 'callout':
  return <NoteCalloutBlock block={block} onUpdate={handleUpdate} onUpdateMetadata={handleUpdateMetadata} />
```

Importar `NoteCalloutBlock`.

### `src/components/notes/NoteBlockInsert.jsx`

Agregar "Destacado" como cuarta opción en el menú de inserción, después de "Sub-nota":

- Label: "Destacado"
- Ícono: alguno de lucide-react como `MessageSquareQuote` o `StickyNote`
- Al hacer click: crea bloque con `block_type: 'callout'`, `content: ''`, `metadata: { style: 'info' }`

---

## 4. Shape de respuesta actualizado

Un bloque callout en el GET /api/notes/:id se ve así:

```json
{
  "id": 15,
  "block_type": "callout",
  "content": "## Importante\n\nEsto es un hallazgo clave sobre divergencias RSI...",
  "linked_note_id": null,
  "linked_note_title": null,
  "position": 3,
  "metadata": {
    "style": "warning",
    "icon": "⚠️"
  },
  "images": []
}
```

Un callout sin ícono:

```json
{
  "metadata": {
    "style": "info"
  }
}
```

---

## 5. Exportación

### JSON

Los bloques callout se exportan con su metadata:

```json
{
  "type": "callout",
  "content": "Texto markdown del callout...",
  "metadata": { "style": "warning" }
}
```

### Markdown

Los callouts se exportan como blockquotes con un prefijo de estilo:

```markdown
> **⚠️ Advertencia**
> Texto markdown del callout...
```

Si no tiene ícono, solo el label del estilo:

```markdown
> **Advertencia**
> Texto markdown del callout...
```

Ajustar las funciones `exportAsJSON` y `exportAsMarkdown` en `note.service.js`.

---

## 6. Orden de implementación

1. Ejecutar migración SQL
2. Actualizar validador (agregar callout y metadata)
3. Actualizar repositorio (metadata en queries)
4. Actualizar servicio (nueva función updateBlockMetadata)
5. Actualizar controlador y rutas
6. Probar backend con curl
7. Actualizar endpoints.js y hooks
8. Crear NoteCalloutBlock.jsx
9. Actualizar NoteBlockList.jsx y NoteBlockInsert.jsx
10. Actualizar funciones de exportación
11. Probar flujo completo