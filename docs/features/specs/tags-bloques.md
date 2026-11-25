# Feature: tags por bloque con grupos y repaso por tag

**Estado:** listo para implementar · **Fecha:** 2026-11-24 · **Guardar en:** `docs/features/specs/feature-tags-bloques.md`

Rutas relativas a `trading-journal/`. Base técnica: el resumen "Tags de notas: diseño técnico actual".

## 0. Objetivo

Hoy los tags son planos y se asignan a notas completas. Pero la unidad que se documenta y se repasa es el **bloque**. Una proyección de NQ puede ser a la vez "NQ", "proyección" y "trade perdido", y como un bloque vive en una sola nota, hoy se compensa creando bloques de referencia en otras notas. Eso no escala y no funciona hacia atrás: una nota nueva nace vacía aunque el contenido ya exista.

Esta feature:

1. Organiza los tags en **grupos fijos**: Activo, Tipo, Estrategia, Resultado y Libre.
2. Permite asignar tags a **bloques**.
3. Convierte los tags de nota en **tags por defecto** de los bloques nuevos de esa nota, y agrega la acción "Aplicar a bloques existentes".
4. Agrega la pestaña **Por tag** en Repaso. Tiene filtro por grupos y un **visor** de bloques con navegación adelante/atrás, como el visor de repaso de trades. El mismo visor sirve para la lista de marcados.
5. Lleva los tags de bloque al export e incluye un script para migrar las notas-categoría existentes.

Regla general: **el bloque es lo que se etiqueta y se repasa; la nota solo propone tags.**

## 1. Decisiones cerradas

| # | Decisión | Por qué |
|---|---|---|
| D1 | Grupos fijos en una columna `group_key` de `note_tags`: `activo`, `tipo`, `estrategia`, `resultado`, `libre` (default). No hay tabla de grupos. | Simplicidad. El camino a grupos por usuario está en §11. |
| D2 | Un solo vocabulario: los mismos `note_tags` sirven para notas y para bloques. | Evitar dos sistemas que se ven iguales y significan cosas distintas. |
| D3 | Filtro: OR dentro de un grupo, AND entre grupos. | "NQ, ya sean proyecciones o trades perdidos" tiene que poder pedirse sin un lenguaje de consultas. |
| D4 | Los tags de la nota se **copian** a cada bloque nuevo creado en ella. No hay herencia en vivo: cambiar los tags de la nota no toca bloques existentes, y mover un bloque conserva los suyos. | Es predecible. Con herencia en vivo, las notas mixtas etiquetan mal y no hay forma de excluir un bloque. |
| D5 | "Aplicar a bloques existentes" es una acción explícita que solo agrega. | La retroactividad queda bajo control del usuario. |
| D6 | Los bloques de referencia no llevan tags, ni manuales ni por defecto, y no aparecen en Repaso. | Una referencia es una relación entre bloques, no contenido; etiquetarla duplicaría resultados. |
| D7 | Repaso y filtros miran solo tags de bloque, nunca tags de nota. | Consecuencia de D4. |
| D8 | Los tags de bloque usan endpoints delta (agregar uno, quitar uno), idempotentes. | El reemplazo total pierde actualizaciones con clicks rápidos (§6, punto 1). |
| D9 | El visor congela la lista de IDs al abrirse. | Desmarcar o cambiar tags durante el repaso no debe correr el índice. |
| D10 | El script de migración no borra nada: agrega tags y reporta las referencias que quedaron redundantes. | El usuario decide qué borrar. |
| D11 | Los tags de trades no cambian. | Fuera de alcance (§11). |

## 2. Verificar antes de implementar

Hacer esto antes de la Fase 1. El resumen técnico no cubre la tabla de bloques, Repaso ni el visor de trades. Confirma estos supuestos en el código. Si alguno no se cumple, adapta el diseño manteniendo la semántica de este spec y anota la diferencia en el resumen final.

| Supuesto en este documento | Qué confirmar |
|---|---|
| Tabla de bloques `note_blocks` con `id INTEGER`, `note_id`, `user_id`, `type`, `content`, `metadata JSONB`, `requires_follow_up`, `created_at`, `updated_at` | Nombre real y columnas. Si los bloques tienen soft delete propio, excluirlos en todas las queries nuevas. Si el FK a `notes` es `ON DELETE CASCADE` |
| Bloques de referencia con `type = 'reference'` | Valor exacto. Dónde guardan el destino (qué clave de `metadata`). Si pueden apuntar a una nota en vez de a un bloque |
| Título de nota en `notes.title` | Nombre real de la columna |
| Rutas de bloques bajo `/api/notes/blocks/:blockId` | Prefijo real. Si ya existe un endpoint que devuelve un bloque suelto, extenderlo en vez de crear otro |
| Página de Repaso con la pestaña de bloques marcados (`requires_follow_up`) | Componente, rutas, hooks y la mutación de marcar/desmarcar |
| Visor de repaso de trades | Componente, y dónde vive la lógica de navegación y teclado |
| Componentes de display de bloques (`NoteTextBlock`, `NoteCalloutBlock`, galería, bookmark) | Si se pueden renderizar en solo lectura |
| Navegación a un bloque concreto (la usan las referencias) | Ruta o ancla para "Abrir en la nota" |
| Caminos que insertan bloques | Crear, duplicar, mover entre notas, importar. Aplicar a cada uno la regla de §4.4 |
| Scripts sueltos del backend | Carpeta y forma de conectarse a la BD |

En el resto del documento, `note_blocks` y `content` son nombres de trabajo.

## 3. Base de datos: `database/030_migration_block_tags.sql`

```sql
-- 030: grupos de tags y tags por bloque. Idempotente.

ALTER TABLE note_tags
  ADD COLUMN IF NOT EXISTS group_key VARCHAR(20) NOT NULL DEFAULT 'libre'
  CONSTRAINT note_tags_group_key_check
  CHECK (group_key IN ('activo', 'tipo', 'estrategia', 'resultado', 'libre'));

CREATE TABLE IF NOT EXISTS note_block_tag_assignments (
  block_id INTEGER NOT NULL REFERENCES note_blocks(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES note_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (block_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_note_block_tag_assignments_tag
  ON note_block_tag_assignments(tag_id, block_id);
```

- Los tags existentes quedan en el grupo `libre`.
- Se usa PK compuesta en lugar de `id SERIAL` porque ninguna asignación se direcciona por id, y así sobra un índice. El índice `(tag_id, block_id)` permite un index-only scan en el filtro de Repaso.
- Cascadas:
  - Borrar un tag borra sus asignaciones en notas y en bloques.
  - Borrar un bloque borra sus asignaciones.
  - La purga de notas (`hardDeleteNotes`) llega por la cadena nota → bloques → asignaciones. Hay que confirmar la cascada nota → bloques.
  - El soft delete de notas no toca las asignaciones, igual que hoy.

## 4. Backend

Se mantienen las capas, errores y respuestas del resto del módulo:
- Capas `routes → validate → controller → service → repository`.
- Errores con `AppError` y mensajes en español.
- Respuestas con `sendSuccess`/`sendCreated`.
- `user_id` en todas las queries.

### 4.1 Constantes

Archivo `backend/src/constants/tagGroups.js` (o donde vivan las constantes):

```js
export const TAG_GROUPS = ['activo', 'tipo', 'estrategia', 'resultado', 'libre'];
export const DEFAULT_TAG_GROUP = 'libre';
export const TAG_REVIEW_MAX_ITEMS = 500;
export const TAG_REVIEW_MAX_TAGS = 50;
```

`TAG_GROUPS` debe coincidir con el CHECK de la migración 030. Agregar un grupo implica una migración nueva más las constantes de backend y frontend.

**Orden canónico de tags:** aplica a toda respuesta nueva o tocada por esta feature. Primero por grupo según `TAG_GROUPS`, luego por nombre. `TAG_GROUPS` se pasa como parámetro, nunca concatenado:

```sql
ORDER BY array_position($N::text[], t.group_key::text), LOWER(t.name)
```

### 4.2 CRUD de tags

- El shape de tag en todas las respuestas pasa a ser `{ id, name, color, group_key }`. `getTagsByIds` y los demás SELECT de tags incluyen `group_key`.
- `POST /api/notes/tags`: `group_key` es opcional, con default `libre`.
- `PATCH /api/notes/tags/:tagId`: acepta `group_key`.
- Validators: `group_key: Joi.string().valid(...TAG_GROUPS)`.
- `GET /api/notes/tags` mantiene su orden actual; el frontend agrupa.

### 4.3 Endpoints de tags de bloque

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| POST | `/api/notes/blocks/:blockId/tags` | `{ tag_id }` | `{ block_id, tags }` |
| DELETE | `/api/notes/blocks/:blockId/tags/:tagId` | — | `{ block_id, tags }` |

- `tags` es la lista completa del bloque después del cambio, en orden canónico.
- Ambos responden con `sendSuccess`.
- Validator: `tag_id` es un entero positivo requerido. Los params `blockId` y `tagId` se validan como enteros positivos con el mismo mecanismo que usan las rutas actuales.

Reglas del service:
1. **Bloque:** verificación liviana con `repo.getBlockForTagging(userId, blockId)`, que devuelve `{ id, note_id, type }` o `null` (bloque del usuario con nota no borrada). Si es `null`: `NotFoundError('Bloque no encontrado')`. No usar `getById`.
2. **Bloque de referencia:** `ValidationError('Los bloques de referencia no llevan tags')`.
3. **Tag (solo en POST):** debe ser del usuario. Si no: `NotFoundError('Tag no encontrado')`.
4. **Idempotencia:** agregar un tag que ya está o quitar uno que no está responde 200 con la lista actual.

```sql
-- addBlockTag ($1 block_id, $2 tag_id, $3 user_id)
INSERT INTO note_block_tag_assignments (block_id, tag_id)
SELECT b.id, t.id
FROM note_blocks b
JOIN note_tags t ON t.id = $2 AND t.user_id = $3
WHERE b.id = $1 AND b.user_id = $3
ON CONFLICT DO NOTHING;

-- removeBlockTag ($1 block_id, $2 tag_id, $3 user_id)
DELETE FROM note_block_tag_assignments a
USING note_blocks b
WHERE a.block_id = b.id AND b.id = $1 AND b.user_id = $3 AND a.tag_id = $2;
```

### 4.4 Tags por defecto en bloques nuevos

| Camino | Regla |
|---|---|
| Crear bloque en una nota | Copiar los tags de la nota al bloque (excepto en referencias) |
| Duplicar bloque (si existe) | Copiar los tags del bloque original, no los de la nota |
| Mover bloque a otra nota (si existe) | Conserva sus tags; no se aplican defaults |
| Restaurar o importar | Conserva lo que traiga; no se aplican defaults |

```sql
-- copyNoteTagsToBlock ($1 block_id, $2 note_id, $3 user_id)
INSERT INTO note_block_tag_assignments (block_id, tag_id)
SELECT $1::int, nta.tag_id
FROM note_tag_assignments nta
JOIN note_tags t ON t.id = nta.tag_id AND t.user_id = $3
WHERE nta.note_id = $2
ON CONFLICT DO NOTHING;

-- copyBlockTags ($1 from_block_id, $2 to_block_id, $3 user_id)
INSERT INTO note_block_tag_assignments (block_id, tag_id)
SELECT $2::int, a.tag_id
FROM note_block_tag_assignments a
JOIN note_blocks b ON b.id = a.block_id AND b.user_id = $3
WHERE a.block_id = $1
ON CONFLICT DO NOTHING;
```

Si la creación del bloque ya corre en una transacción, la copia va dentro de ella. La respuesta de crear bloque incluye `tags`.

### 4.5 Aplicar tags de la nota a bloques existentes

`POST /api/notes/:noteId/tags/apply-to-blocks`, sin body. Responde con `sendSuccess` y `{ blocks_updated, assignments_created }`.

- La nota debe ser del usuario y no estar borrada (verificación liviana, §6, punto 5). Si no: `NotFoundError`.
- Solo afecta a los bloques directos de esa nota. No incluye sub-notas, porque no hay herencia por jerarquía, y excluye las referencias.
- Solo agrega, nunca quita.

```sql
-- ($1 note_id, $2 user_id)
INSERT INTO note_block_tag_assignments (block_id, tag_id)
SELECT b.id, nta.tag_id
FROM note_blocks b
JOIN note_tag_assignments nta ON nta.note_id = b.note_id
WHERE b.note_id = $1 AND b.user_id = $2 AND b.type <> 'reference'
ON CONFLICT DO NOTHING
RETURNING block_id;
```

`assignments_created` es el número de filas devueltas; `blocks_updated` es el número de `block_id` distintos.

### 4.6 Tags dentro de los bloques al leer

- `getById`: cada bloque trae `tags`, un array vacío si no tiene. Se usa una sola query para todos los bloques de la nota, en orden canónico, y se mapea en JS. Nunca una query por bloque:

  ```sql
  SELECT a.block_id, t.id, t.name, t.color, t.group_key
  FROM note_block_tag_assignments a
  JOIN note_tags t ON t.id = a.tag_id AND t.user_id = $2
  WHERE a.block_id = ANY($1::int[])
  ORDER BY array_position($3::text[], t.group_key::text), LOWER(t.name);
  ```

- `getTree`: sin cambios.

### 4.7 Repaso por tag

**`GET /api/notes/review/tag-blocks?tag_ids=1,4,7`**

- Ubicación: si los endpoints actuales de Repaso tienen otro prefijo, ubicarlo junto a ellos.
- Montaje: esta ruta y las de `/blocks/...` van **antes** de cualquier `/:id`, igual que `/tags`.

Validación: `tag_ids` es requerido y debe ser un CSV `/^\d+(,\d+)*$/`. En el service:
1. Deduplicar los ids **antes** de cualquier comparación. Hoy un id repetido hace fallar la comprobación de `assignTags`.
2. Más de `TAG_REVIEW_MAX_TAGS` ids: `ValidationError`.
3. `getTagsByIds`: si algún tag no es del usuario, `ValidationError('Algunos tags no existen o no te pertenecen')`.
4. Calcular `group_count`: los grupos distintos entre esos tags.

Un bloque entra si tiene al menos un tag seleccionado de **cada** grupo presente en la selección (D3):

```sql
-- ($1 user_id, $2 tag_ids, $3 group_count, $4 limit)
WITH matched AS (
  SELECT a.block_id
  FROM note_block_tag_assignments a
  JOIN note_tags t ON t.id = a.tag_id AND t.user_id = $1
  WHERE a.tag_id = ANY($2::int[])
  GROUP BY a.block_id
  HAVING COUNT(DISTINCT t.group_key) = $3
)
SELECT b.id AS block_id, b.note_id, n.title AS note_title, b.type,
       LEFT(b.content, 140) AS preview,
       b.created_at, b.updated_at, b.requires_follow_up,
       (COUNT(*) OVER ())::int AS total
FROM matched m
JOIN note_blocks b ON b.id = m.block_id AND b.user_id = $1
JOIN notes n ON n.id = b.note_id AND n.user_id = $1 AND n.deleted_at IS NULL
WHERE b.type <> 'reference'
ORDER BY b.created_at DESC, b.id DESC
LIMIT $4;
```

- `preview` solo aplica a tipos con texto; en el resto es `null`.
- Respuesta: `{ items, total, truncated }`, con `$4 = TAG_REVIEW_MAX_ITEMS`.
- El orden de presentación lo decide el cliente (§5.6).

**`GET /api/notes/blocks/:blockId`**

Devuelve un bloque con **el mismo shape** que cada elemento de `blocks` en `getById`, reutilizando el mismo mapeo de imágenes y metadata. Agrega `tags` y `note: { id, title }`. Si el bloque no es del usuario o su nota está borrada: `NotFoundError`.

### 4.8 Export

- **JSON:** el diccionario raíz de tags agrega el grupo: `tags: [{ name, color, group }]`. Cada bloque agrega `tags: [nombres]` en orden canónico, con el mismo formato que las notas, o un array vacío si no tiene.
- **Markdown:** después del contenido de cada bloque con tags va una línea `> Tags: NQ, proyección`. Los bloques sin tags no llevan nada.
- **`getFullTree`:** una sola query con todas las asignaciones de bloques del usuario.

## 5. Frontend

Las mutaciones nuevas llevan `mutationKey` bajo `noteKeys.all`, para el indicador de guardado. Los errores se muestran con el toast global existente.

### 5.1 Constantes y API

`frontend/src/constants/tagGroups.js`:

```js
export const TAG_GROUPS = [
  { key: 'activo', label: 'Activo', defaultColor: '#2563EB' },
  { key: 'tipo', label: 'Tipo', defaultColor: '#D97706' },
  { key: 'estrategia', label: 'Estrategia', defaultColor: '#7C3AED' },
  { key: 'resultado', label: 'Resultado', defaultColor: '#059669' },
  { key: 'libre', label: 'Libre', defaultColor: '#6B7280' },
];
```

- `defaultColor` es el color inicial de los tags creados desde el picker (§5.3). Hay que ajustarlos a la paleta predefinida de `NoteTagManager`.
- Helpers:
  - `sortTags(tags)`: orden canónico, con `localeCompare` en `'es'`.
  - `groupTags(tags)`: devuelve `[{ key, label, tags }]` sin grupos vacíos.

`api/endpoints.js`:
- Nuevas funciones: `addBlockTag(blockId, tagId)`, `removeBlockTag(blockId, tagId)`, `applyNoteTagsToBlocks(noteId)`, `getTagReviewBlocks(tagIds)` y `getNoteBlock(blockId)`.
- `createNoteTag` y `updateNoteTag` aceptan `group_key`.

### 5.2 Hooks

Van en `hooks/useNotes.js` o en un `hooks/useBlockTags.js` nuevo.

```js
// nuevas keys en noteKeys
block: (id) => ['notes', 'block', id],
review: ['notes', 'review'],
reviewTags: (tagIds) => ['notes', 'review', 'tags', { tagIds }],
```

- **`useNoteBlock(blockId)`.**
- **`useTagReviewBlocks(tagIds)`:**
  - `enabled` solo con al menos un tag.
  - Usa `keepPreviousData`.
  - Los ids van ordenados para que la key sea estable.
- **`useAddBlockTag` / `useRemoveBlockTag`:**
  - `mutationKey: [...noteKeys.all, 'block-tags', blockId]`.
  - Optimistic update de los tags del bloque en `detail(noteId)` y en `block(blockId)`, si están en caché. Usar un helper `updateBlockTagsInCache`. Rollback en `onError`.
  - Al volver la respuesta, reconciliar con su `tags` **solo si** no quedan otras mutaciones de tags de ese bloque en curso (`queryClient.isMutating({ mutationKey })`). Así una respuesta que llega tarde no pisa una más nueva.
  - En `onSettled`, invalidar `noteKeys.review`. No invalidar `detail(noteId)` en cada toggle: la nota trae bloques, imágenes, trades y recordatorios.
- **`useApplyNoteTagsToBlocks(noteId)`:** invalida `detail(noteId)` y `noteKeys.review`.

### 5.3 Componentes compartidos

**`components/notes/GroupedTagList.jsx`** (presentacional)
- Props: `tags`, `selectedIds`, `onToggle`, `filterText`.
- Pinta los tags por grupo con su encabezado y omite los grupos vacíos.
- Usa `NoteTagBadge`, al que hay que agregarle `size="sm"`.

**`components/notes/TagPicker.jsx`** (popover)
- Props: `selectedIds`, `onToggle(tag)`, `onClose` y el anclaje.
- Input "Buscar o crear tag…" que filtra en cliente sobre `useNoteTags`.
- Debajo, un `GroupedTagList`. Los tags seleccionados se ven marcados; un click agrega o quita.
- Si el texto (con `trim`) no coincide con ningún tag, sin distinguir mayúsculas, aparece la opción **Crear «texto» en:** con un botón por grupo, con Libre resaltado. Al elegir:
  - Crea el tag con su `group_key` y el `defaultColor` del grupo.
  - Agrega el tag nuevo a la caché de `noteKeys.tags` con la respuesta.
  - Lo asigna en el mismo flujo.
- Teclado: ↑/↓ para moverse, Enter para alternar o crear, Esc para cerrar.

Con esto los tags dejan de crearse solo desde el modal del sidebar.

### 5.4 Editor

**Tags de la nota** (`pages/NoteEditor.jsx`, fila bajo el título):
- `TagPicker` reemplaza al dropdown actual; los badges van en orden canónico.
- Texto de ayuda junto a la fila: "Se agregan a los bloques nuevos de esta nota".
- Botón **Aplicar a bloques existentes**:
  - Visible si la nota tiene tags y al menos un bloque que no sea referencia.
  - Confirmación inline, con el mismo patrón que el borrado en `NoteTagManager`: "Se agregarán los tags de la nota a sus N bloques. Los tags que ya tengan se mantienen."
  - Al terminar, toast "Tags aplicados a X bloques" con `blocks_updated`.
- Se quita el mensaje "Créalos con el ícono Tags en el sidebar".

**Tags de cada bloque** (en el wrapper de bloque que corresponda):
- Nuevo `components/notes/BlockTags.jsx`: una fila de badges pequeños bajo el contenido, solo si el bloque tiene tags. Un click en la fila abre el `TagPicker`.
- Botón **Tags** en la barra de acciones del bloque para abrir el picker cuando todavía no tiene tags. En táctil, usar el mecanismo equivalente que ya exista.
- Al crear un bloque, usar los `tags` de la respuesta para que los defaults se vean de inmediato.
- Nada de esto aparece en bloques de referencia.

### 5.5 `NoteTagManager.jsx`

- Crear: selector de grupo, con Libre por defecto.
- Edición inline: nombre, color y grupo.
- Lista agrupada con `groupTags`.
- Confirmación de borrado: "Se quitará de todas las notas y bloques".

### 5.6 Repaso: pestaña "Por tag"

Nueva pestaña **Por tag** junto a las actuales de Repaso, respetando sus nombres.

**Estado en la URL**
- Formato: `?tab=tags&tags=1,4,7&order=chrono`. Si la página ya maneja la pestaña por URL, seguir ese esquema.
- Antes de consultar, descartar los ids que no estén en `useNoteTags`, para que un marcador viejo no termine en 400.

**Selector**
- `GroupedTagList` siempre visible, con filtro de texto.
- Debajo, el texto: "Mismo grupo: cualquiera · Grupos distintos: todos a la vez".
- Sin selección: "Elige uno o más tags para empezar" (no se consulta).

**Orden** (se aplica en cliente sobre `items`)
- **Cronológico** (default): del más antiguo al más reciente.
- **Recientes primero.**
- **Aleatorio:** Fisher-Yates una vez por resultado o por cambio de orden, para que la lista y el visor compartan el mismo orden.

**Resultado**
- Contador "23 bloques"; si `truncated`, "mostrando 500 de 812".
- Botón **Repasar (23)**.
- Lista compacta. Cada fila muestra:
  - icono de tipo;
  - `preview` en una línea, o el nombre del tipo si es `null`;
  - título de la nota y fecha;
  - indicador de marcado.
- Un click en una fila abre el visor en ese índice.
- Sin resultados: "Ningún bloque tiene esa combinación de tags."
- El título del visor se arma desde la selección: grupos separados por " · " y tags del mismo grupo por ", ". Ejemplo: "NQ · proyección, trade perdido".

**Pestaña de marcados**
- Botón **Repasar en visor**: abre el mismo visor con la lista en el orden mostrado y el título "Marcados para repaso".
- Si la lista está paginada, el visor recorre lo que ya está cargado.
- Si "Actividad reciente" usa la misma estructura, agregarle el botón es opcional.

### 5.7 Visor: `BlockReviewViewer.jsx`

Va en la carpeta de componentes de Repaso. Props: `blockIds`, `initialIndex`, `title`, `onExit`.

- **Estilo:** mismos controles que el visor de repaso de trades.
- **Navegación compartida:** si la navegación del visor de trades vive dentro del componente, extraerla a un hook compartido y usarlo en los dos. Por ejemplo, `hooks/useSequenceNavigation.js`, con índice, `next`, `prev`, `hasNext`, `hasPrev` y teclado. El visor de trades no debe cambiar de comportamiento.
- **Overlay:** se abre a pantalla completa sobre Repaso, para que al salir la pestaña conserve filtros y scroll.
- **Lista congelada:** al abrir, copiar `blockIds` a estado; nada de lo que pase durante el repaso la modifica. Al salir, invalidar `noteKeys.review` y la lista de marcados.
- **Cabecera:** título, contador `7 / 23` y botón **Salir**.
- **Teclado:**
  - ←/→ y los botones ← → navegan; Esc sale.
  - Ignorar el teclado si el foco está en `input`, `textarea` o `[contenteditable]`, o si el `TagPicker` está abierto.
- **Carga:**
  - `useNoteBlock` para el índice actual.
  - `prefetchQuery` del siguiente y del anterior.
  - Si el siguiente es una galería, precargar también su primera imagen (`new Image().src`): el repaso de gráficos es el caso principal.
- **Render:** solo lectura, reutilizando los componentes de display (agregar `readOnly` si hace falta). Imágenes grandes; si la galería ya tiene lightbox, reutilizarlo.
- **Pie:**
  - título de la nota con **Abrir en la nota**, usando la misma navegación a bloque que las referencias;
  - `BlockTags` editable;
  - toggle **Marcado para repaso**, con la mutación existente de `requires_follow_up` y optimistic sobre `block(blockId)`.
- **Bloque borrado (404):** mostrar "Este bloque ya no existe" y permitir seguir navegando.

## 6. Deuda existente que se corrige

Solo lo que esta feature empeora o toca:

1. **Carrera en `toggleTag`** (`NoteEditor.jsx:160`):
   - Agregar optimistic update en `useAssignTags`, con snapshot y rollback.
   - Armar la lista nueva desde la caché actual (`queryClient.getQueryData(noteKeys.detail(noteId))`), no desde el valor renderizado.
   - Pesa más ahora porque los tags de nota alimentan los defaults.
2. **Caché al editar o borrar tags:** `useUpdateTag` y `useDeleteTag` invalidan `noteKeys.all`. Los tags ahora se ven en el editor, en cada bloque y en el visor.
3. **TOCTOU C3:**
   - En `createTag` y `updateTag`, capturar el error `23505` del unique index y lanzar `ValidationError('Ya existe un tag con ese nombre')`.
   - El pre-check puede quedarse, pero nunca debe salir un 500.
   - Con la creación desde el picker habrá más creaciones.
4. **Orden no determinista:** aplicar el orden canónico a los tags de nota en `getById` y en `TAGS_AGG` (`json_agg(... ORDER BY ...)`).
5. **Verificación de propiedad liviana:** crear `repo.noteBelongsToUser(userId, noteId)`, que solo lee `id` de una nota no borrada. Se usa en los endpoints nuevos y también en `assignTags`, que hoy carga la nota completa.

## 7. Script de migración de datos

Sirve para convertir las notas-categoría actuales, las que juntan bloques o referencias de un tema, en tags de bloque. Corre por usuario; a otros usuarios no se les toca nada (ellos tienen "Aplicar a bloques existentes").

Archivo sugerido: `backend/scripts/migrate-block-tags.js`, siguiendo la convención de scripts del repo.

```bash
node scripts/migrate-block-tags.js --map ./block-tags-map.json             # dry-run (por defecto)
node scripts/migrate-block-tags.js --map ./block-tags-map.json --apply
node scripts/migrate-block-tags.js --rollback ./reports/block-tags-<ts>.json
```

Archivo de mapeo:

```json
{
  "userId": 1,
  "notes": [
    { "noteId": 12, "tags": [{ "name": "proyección", "group": "tipo" }] },
    { "noteId": 34, "tags": [{ "name": "NQ", "group": "activo" }] },
    { "noteId": 56, "tags": [{ "name": "trade perdido", "group": "tipo" }], "noteDefaults": false }
  ]
}
```

Comportamiento, todo en una transacción:

1. **Validar:**
   - que el usuario exista;
   - que cada nota sea suya y no esté borrada;
   - que los nombres tengan entre 1 y 100 caracteres;
   - que los grupos sean válidos.
2. **Resolver tags** por nombre, sin distinguir mayúsculas:
   - Si no existe, se crea con su grupo.
   - Si existe en `libre` y el mapeo dice otro grupo, se actualiza el grupo y queda en el reporte.
   - Si existe en otro grupo distinto de `libre`, se respeta y se emite un warning.
3. **Defaults de la nota** (`noteDefaults`, `true` por defecto): asignar los tags del mapeo como tags de la nota, para que los bloques nuevos los reciban.
4. **Fase A:** poner los tags de cada nota mapeada en todos sus bloques directos que no sean referencias. No incluye sub-notas; si hace falta, se mapean aparte.
5. **Fase B:** por cada bloque de referencia en una nota mapeada, resolver su destino.
   - Si el destino es un bloque válido (del usuario, con nota no borrada y que no sea referencia), agregarle los tags de la nota donde está la referencia.
   - Las referencias rotas y las que apuntan a una nota se reportan sin tocar nada.
6. **Reporte:** `reports/block-tags-<timestamp>.json` (`.dryrun.json` en dry-run), más un resumen en consola. Contiene:
   - `created_tags`, `group_changes` y `warnings`.
   - `inserted_note_tags: [{ note_id, tag_id }]` e `inserted_block_tags: [{ block_id, tag_id }]`, solo con las filas realmente insertadas (vía `RETURNING`).
   - Por cada nota mapeada: bloques etiquetados y asignaciones creadas.
   - `references: [{ reference_block_id, note_id, note_title, target_block_id, target_note_title, status }]`. Valores de `status`:
     - `redundante`: el destino ya tiene todos los tags de la nota donde vive la referencia, así que la referencia solo servía para duplicar;
     - `rota`;
     - `apunta_a_nota`.
7. **Dry-run:** `ROLLBACK` al final. **Apply:** `COMMIT`.
8. **Rollback:**
   - Borra exactamente las filas de `inserted_block_tags` e `inserted_note_tags` del reporte, dentro del `userId` del reporte, en una transacción.
   - No borra los tags creados ni revierte los cambios de grupo: los lista para hacerlo a mano.
9. **Idempotencia:** un segundo `--apply` inserta 0.
10. **No borra referencias ni notas.**

Operación recomendada:
1. Correr el dry-run contra una copia local de la BD (Docker, restaurada desde un dump de producción).
2. Revisar el reporte.
3. Aplicar en producción.

## 8. Tests y convenciones

- **Validators** (`validators/__tests__/note.validator.test.js`):
  - `group_key` válido e inválido, al crear y al editar;
  - `tag_id` de tags de bloque;
  - `tag_ids` del repaso, con CSV válido e inválido.
- **Services:** si el repo ya tiene tests de services con repositorios mockeados, agregar estos casos:
  - referencia rechazada;
  - tag ajeno → 404;
  - ids duplicados en el repaso que no fallan;
  - `group_count` correcto.

  Si ese patrón no existe, no introducirlo aquí; cubrir esos casos con los criterios de §9.
- **Comandos:** `npm test` en backend. Formato con `npm run lint:fix`; **nunca** `npm run format`. Comillas simples, 120 columnas.

## 9. Fases y criterios de aceptación

Cada fase se entrega por separado y termina con `npm run lint:fix`, `npm test` y sus criterios verificados.

**Fase 1: BD y backend base** (§3, §4.1–4.6, §6 puntos 3 a 5)
- La migración 030 corre dos veces sin error.
- Un bloque creado en una nota que tiene `proyección` nace con `proyección`; uno de referencia nace sin tags.
- Agregar un tag a la nota no cambia los bloques existentes.
- "Aplicar" agrega los tags a todos los bloques que no son referencia; repetirlo devuelve `assignments_created: 0`.
- Agregar o quitar tags de un bloque es idempotente.
- Tag ajeno → 404; bloque de referencia → 400.
- Dos creaciones simultáneas del mismo nombre de tag nunca devuelven 500.

**Fase 2: Editor** (§5.1–5.5, §6 puntos 1 y 2)
- Desde el picker de un bloque se crea un tag nuevo eligiendo grupo, y queda asignado en un solo flujo.
- Si se alternan dos tags rápido, en un bloque o en la nota, ambos persisten tras recargar.
- Renombrar un tag en el manager se refleja en la nota abierta sin recargar.

**Fase 3: Repaso y visor** (§4.7, §5.6–5.7)
- `NQ` + (`proyección`, `trade perdido`) devuelve los bloques con NQ y al menos uno de los otros dos.
- Esa misma consulta excluye los bloques que solo tienen NQ, las referencias y los bloques de notas en papelera.
- Recargar la URL repite la misma consulta; un id de tag borrado en la URL se ignora.
- En el visor:
  - ←/→ navegan, y escribir en el picker no navega;
  - desmarcar o quitar un tag no cambia el contador ni salta bloques;
  - al salir, la lista se refresca.
- La pestaña de marcados abre el mismo visor.
- El visor de trades funciona igual que antes.

**Fase 4: Export, script y docs** (§4.8, §7, §10)
- El JSON trae `group` en el diccionario de tags y `tags` en cada bloque.
- El Markdown muestra la línea de tags en los bloques etiquetados.
- Script:
  - el dry-run no cambia nada;
  - `--apply` inserta, y un segundo `--apply` inserta 0;
  - el rollback deja las asignaciones como estaban.

El script solo depende de la Fase 1, así que puede adelantarse para probar la Fase 3 con datos reales.

**Tasks**: el plan está dividido en las tasks 033–042 de [`docs/tasks/in-progress/`](../../tasks/in-progress/). Los supuestos del §2 están verificados en la 033, y las tasks ya usan los nombres reales del código.

| Task | Fase | Contenido |
|------|------|-----------|
| 033 | 1 | Migración 030 y grupos en el CRUD de tags |
| 034 | 1 | Tags de bloque en el backend |
| 035 | 2 | Grupos, `TagPicker` y tags de la nota |
| 036 | 2 | Tags de bloque en el editor y gestor con grupos |
| 037 | 3 | Backend del repaso por tag y del bloque suelto |
| 038 | 3 | Visor de bloques y "Repasar en visor" en Marcados |
| 039 | 3 | Pestaña "Por tag" en Repaso |
| 040 | 4 | Export con tags de bloque |
| 041 | 4 | Script de migración de notas-categoría |
| 042 | 4 | Puesta en producción y docs |

La 037, la 040 y la 041 solo dependen de la 034 y pueden ir en paralelo con el editor (035 y 036).

## 10. Documentación

- `docs/api/reference.md`: endpoints nuevos y `group_key`.
- `docs/architecture/database.md`: tabla nueva y cascadas.
- `docs/analysis/notes-known-issues.md`: marcar C3 como resuelto.
- Este spec en `docs/features/specs/`.

## 11. Fuera de alcance

- Unificar con los tags de trades.
- Grupos definidos por el usuario. Si hicieran falta: una tabla `note_tag_groups` por usuario, sembrada con los cinco grupos actuales, y pasar de `group_key` a `group_id`. La query de repaso no cambia, porque cuenta grupos distintos.
- Herencia en vivo de los tags de nota.
- Vistas guardadas en BD (las URLs cumplen ese papel).
- Conteo de bloques por tag.
- Marca de "repasado" y repetición espaciada.
- Bloque de consulta dentro de notas.
- Cambios en la búsqueda de notas (sigue con OR y solo sobre notas).
- Tags en notas `section`/`todo` desde la UI.
- Quitar los tags del payload de `getTree`.