# Buscador full-texto de notas — Documento de diseño

## Contexto

El sistema de notas ya está implementado con árbol jerárquico, bloques de texto/galería/callout/enlace y tags. A medida que crece el número de notas, navegar el árbol para encontrar contenido se vuelve ineficiente. Se necesita búsqueda full-texto que cubra títulos, contenido de bloques y filtrado por tags.

**Stack:** PostgreSQL (FTS nativo con `tsvector`/`tsquery`), Express.js + Node, React 18 + TanStack Query.

---

## Decisiones de diseño

### Motor de búsqueda: PostgreSQL FTS nativo

Se usa `tsvector` / `websearch_to_tsquery` de PostgreSQL. Sin dependencias nuevas, transaccional, y suficiente para el volumen esperado (notas privadas de un solo usuario).

**Configuración de idioma: `'simple'`** — evita problemas de stemming con contenido mixto (términos en inglés, español, tickers como BTCUSDT). Con `'simple'` se indexa el texto tal cual, sin reducción de palabras.

**`websearch_to_tsquery`** en lugar de `plainto_tsquery` porque soporta:
- Frases exactas: `"divergencia RSI"`
- Exclusiones: `RSI -macd`
- OR implícito: `soporte resistencia`

### Filtrado por tags

Independiente de la búsqueda textual. Se puede:
- Buscar solo por tags (sin texto)
- Buscar solo por texto (sin filtro de tags)
- Combinar ambos (AND: el resultado debe cumplir texto Y tener los tags)

### Snippets

Usar `ts_headline('spanish', content, query)` para resaltar el texto coincidente en los resultados. Devuelve el fragmento relevante con los términos marcados con `<b>...</b>`.

---

## 1. Cambios en base de datos

### Migración: `database/migration_notes_search.sql`

```sql
-- Índices
CREATE INDEX idx_notes_title_fts
  ON notes USING gin(to_tsvector('spanish', COALESCE(title, '')));

CREATE INDEX idx_note_blocks_content_fts
  ON note_blocks USING gin(to_tsvector('spanish', COALESCE(content, '')));

```

No se modifica el schema de tablas. Los índices funcionales son suficientes.

---

## 2. Backend

### 2.1 Query principal de búsqueda

La query central que ejecutará el repositorio:

```sql
SELECT
  n.id,
  n.title,
  n.parent_note_id,
  n.updated_at,
  ts_rank(
    to_tsvector('spanish', coalesce(n.title, '')),
    websearch_to_tsquery('spanish', $1)
  ) * 2 + coalesce(nb.content_rank, 0) AS rank,
  ts_headline(
    'spanish',
    coalesce(n.title, ''),
    websearch_to_tsquery('spanish', $1),
    'MaxWords=8, MinWords=3, MaxFragments=1'
  ) AS title_headline,
  coalesce(
    ts_headline(
      'spanish',
      coalesce(nb.content_agg, ''),
      websearch_to_tsquery('spanish', $1),
      'MaxWords=20, MinWords=5, MaxFragments=2, FragmentDelimiter=" … "'
    ),
    ''
  ) AS content_snippet
FROM notes n
LEFT JOIN LATERAL (
  SELECT
    string_agg(content, ' ' ORDER BY position) AS content_agg,
    MAX(ts_rank(
      to_tsvector('spanish', coalesce(content, '')),
      websearch_to_tsquery('spanish', $1)
    )) AS content_rank,
    bool_or(
      to_tsvector('spanish', coalesce(content, '')) @@ websearch_to_tsquery('spanish', $1)
    ) AS content_match
  FROM note_blocks
  WHERE note_id = n.id
    AND block_type IN ('text', 'callout')
) nb ON true
WHERE
  n.user_id = $2
  AND n.deleted_at IS NULL
  AND (
    $1 = ''
    OR to_tsvector('spanish', coalesce(n.title, '')) @@ websearch_to_tsquery('spanish', $1)
    OR nb.content_match = true
  )
ORDER BY rank DESC, n.updated_at DESC
LIMIT $3;
```

**Parámetros:**
- `$1` — texto de búsqueda (string, puede ser `''` si solo se filtra por tags)
- `$2` — user_id
- `$3` — array de tag IDs (puede ser `'{}'::int[]`)
- `$4` — limit (máximo de resultados, default 30)

**Nota:** Cuando `$1` es `''`, el filtro de texto se desactiva (`$1 = '' OR ...`). Esto permite buscar solo por tags.

---

### 2.2 `src/repositories/note.repository.js` — función nueva

Agregar al repositorio existente:

```js
async search(userId, { q = '', tagIds = [], limit = 30 }) {
  const query = `...` // query de arriba
  const result = await pool.query(query, [q, userId, tagIds, limit])
  return result.rows
}
```

---

### 2.3 `src/services/note.service.js` — función nueva

```js
async search(userId, { q, tagIds, limit }) {
  // Validar que al menos uno de los dos filtros viene
  if (!q?.trim() && (!tagIds || tagIds.length === 0)) {
    throw new ValidationError('Se requiere texto de búsqueda o al menos un tag')
  }
  return repository.search(userId, { q: q?.trim() ?? '', tagIds, limit })
}
```

---

### 2.4 `src/validators/note.validator.js` — schema nuevo

```js
search: Joi.object({
  q: Joi.string().max(500).allow('').optional(),
  tag_ids: Joi.string()            // viene como query string "1,2,3"
    .pattern(/^\d+(,\d+)*$/)
    .optional(),
  limit: Joi.number().integer().min(1).max(100).default(30)
})
```

El controller parsea `tag_ids` de `"1,2,3"` a `[1, 2, 3]`.

---

### 2.5 `src/controllers/note.controller.js` — función nueva

```js
search: async (req, res) => {
  const { q, tag_ids, limit } = req.query
  const tagIds = tag_ids
    ? tag_ids.split(',').map(Number).filter(Boolean)
    : []
  const results = await noteService.search(req.user.id, { q, tagIds, limit })
  return sendSuccess(res, results)
}
```

---

### 2.6 `src/routes/note.routes.js` — ruta nueva

```
GET /api/notes/search   → search  (con validate middleware para query params)
```

Agregar **antes** de `GET /api/notes/:id` para que `/search` no sea capturado como un `:id`.

---

### 2.7 Shape de respuesta

`GET /api/notes/search?q=divergencia+RSI&tag_ids=1,3`

```json
{
  "success": true,
  "data": [
    {
      "id": 12,
      "title": "Divergencias alcistas en BTC",
      "parent_note_id": 5,
      "updated_at": "2026-04-20T...",
      "rank": 0.47,
      "title_headline": "Divergencias alcistas en <b>BTC</b>",
      "content_snippet": "El <b>RSI</b> muestra <b>divergencia</b> alcista … señal de reversión",
      "tags": [
        { "id": 1, "name": "trading", "color": "#3B82F6" },
        { "id": 3, "name": "RSI", "color": "#EF4444" }
      ]
    },
    {
      "id": 7,
      "title": "Setup RSI extremo",
      "parent_note_id": null,
      "updated_at": "2026-04-18T...",
      "rank": 0.31,
      "title_headline": "Setup <b>RSI</b> extremo",
      "content_snippet": "Buscar <b>divergencia</b> cuando RSI baja de 30 … confirmar con volumen",
      "tags": [
        { "id": 3, "name": "RSI", "color": "#EF4444" }
      ]
    }
  ]
}
```

---

## 3. Frontend

### 3.1 `src/api/endpoints.js` — función nueva

```js
export const searchNotes = (params) =>
  client.get('/notes/search', { params })
// params: { q, tag_ids, limit }
// tag_ids se pasa como string "1,2,3"
```

---

### 3.2 `src/hooks/useNotes.js` — hook nuevo

```js
export const useNoteSearch = ({ q, tagIds, limit, enabled }) =>
  useQuery({
    queryKey: [...noteKeys.all, 'search', { q, tagIds, limit }],
    queryFn: () => searchNotes({
      q,
      tag_ids: tagIds?.join(','),
      limit
    }),
    enabled: enabled && (!!q?.trim() || tagIds?.length > 0),
    staleTime: 10_000,         // 10s — los resultados son relativamente estables
    placeholderData: keepPreviousData,
  })
```

---

### 3.3 `src/components/notes/NoteSearch.jsx` — ARCHIVO NUEVO

Componente de búsqueda que vive en el sidebar de `Notes.jsx`, encima del árbol.

**Estructura:**

```
┌─────────────────────────────────────────┐
│ 🔍  [input de texto              ] [X]  │
│ ─────────────────────────────────────── │
│ Filtrar por tag:                        │
│ [trading ×] [RSI ×] [+ añadir tag]     │
└─────────────────────────────────────────┘
```

**Comportamiento:**

- Input de texto con debounce de **400ms** antes de disparar la búsqueda (más rápido que el debounce de guardado porque es solo lectura)
- El botón `[X]` limpia el texto y el filtro de tags, volviendo al árbol normal
- La sección de filtro de tags es un dropdown con todos los tags del usuario. Al seleccionar uno, se añade al filtro activo. Se puede combinar múltiples tags.
- Los tags activos se muestran como badges con `×` para quitar
- Mientras carga: spinner sutil en el input o esqueleto de resultados
- Estado vacío cuando no hay resultados: "No se encontraron notas para esta búsqueda"

**Props:** `onSearchActive(boolean)` — notifica al padre si hay búsqueda activa para alternar entre árbol y resultados.

---

### 3.4 `src/components/notes/NoteSearchResults.jsx` — ARCHIVO NUEVO

Lista de resultados que reemplaza al árbol cuando hay búsqueda activa.

**Estructura de cada resultado:**

```
┌────────────────────────────────────────────┐
│ 📄 Divergencias alcistas en BTC            │  ← title_headline con <b> resaltado
│    Notas › Análisis › BTC                  │  ← breadcrumb (construido en frontend)
│    El RSI muestra divergencia alcista …    │  ← content_snippet con <b> resaltado
│    [trading] [RSI]                         │  ← tag badges
└────────────────────────────────────────────┘
```

**Comportamiento:**
- Click en resultado navega a `/notes/:id`
- El HTML de `title_headline` y `content_snippet` se renderiza con `dangerouslySetInnerHTML` (el contenido viene del servidor, es del propio usuario, sin riesgo XSS externo). Los `<b>` se estilizan con `font-semibold text-blue-600 dark:text-blue-400`.
- El breadcrumb se construye en el frontend usando el árbol de notas ya cargado (igual que `NoteBreadcrumb.jsx`), solo para el resultado se muestra en una línea compacta separada por `›`
- Si no hay `content_snippet` (nota sin bloques de texto), solo muestra el título y tags

---

### 3.5 `src/pages/Notes.jsx` — modificaciones

Agregar el componente `NoteSearch` encima del árbol de notas en el sidebar.

```jsx
const [isSearchActive, setIsSearchActive] = useState(false)

// En el sidebar:
<NoteSearch onSearchActive={setIsSearchActive} />
{isSearchActive
  ? <NoteSearchResults />   // resultados de búsqueda
  : <NoteTree ... />        // árbol normal
}
```

No hay cambio en la lógica del árbol ni del editor. El buscador es una capa adicional.

---

## 4. Casos de uso soportados

| Caso | Cómo buscarlo |
|---|---|
| Buscar por texto en título o contenido | Escribir en el input |
| Frase exacta | `"divergencia alcista"` |
| Excluir término | `RSI -MACD` |
| Filtrar solo por tags, sin texto | Seleccionar tags, dejar input vacío |
| Combinar texto y tags | Texto en input + tags seleccionados |
| Ver todas las notas de un tag | Sin texto, solo el tag |

---

## 5. Lo que NO entra en esta implementación

- **Búsqueda en captions de imágenes** — se excluye por simplicidad. Las captions son cortas y raramente son el destino de búsqueda.
- **Búsqueda dentro de la vista de nota abierta** (Ctrl+F del browser la cubre)
- **Búsqueda de notas eliminadas** (soft deleted)
- **Sugerencias / autocomplete** mientras se escribe
- **Historial de búsquedas recientes**

---

## 6. Orden de implementación

### Fase 1 — Base de datos
1. Crear `database/migration_notes_search.sql` con los tres índices GIN
2. Ejecutar en el contenedor: `sudo docker exec -i tradelog-db psql -U postgres -d tradelog < database/migration_notes_search.sql`

### Fase 2 — Backend
3. Agregar `search` en `note.repository.js`
4. Agregar `search` en `note.service.js`
5. Agregar `search` en `note.controller.js`
6. Agregar ruta `GET /api/notes/search` en `note.routes.js` (antes de `/:id`)
7. Agregar schema de validación en `note.validator.js`
8. Probar con curl: `curl "http://localhost:5000/api/notes/search?q=RSI" -H "Authorization: Bearer <token>"`

### Fase 3 — Frontend
9. Agregar `searchNotes` en `api/endpoints.js`
10. Agregar `useNoteSearch` en `hooks/useNotes.js`
11. Crear `NoteSearch.jsx`
12. Crear `NoteSearchResults.jsx`
13. Modificar `Notes.jsx` para integrar los dos componentes nuevos

---

## 7. Dependencias nuevas

**Ninguna.** PostgreSQL FTS, TanStack Query y los estilos de Tailwind ya están disponibles.



Everything looks correct. To complete the implementation, run these two commands:                                                                                                                                                                           
                                                                                                                                                                                                                                                              
  # 1. Ejecutar migración de índices FTS                                                                                                                                                                                                                      
  sudo docker exec -i tradelog-db psql -U postgres -d tradelog < trading-journal/database/migration_notes_search.sql                                                                                                                                          
                                                                                                                                                                                                                                                              
  # 2. Reconstruir backend y frontend                                                                                                                                                                                                                         
  sudo docker compose --env-file backend/.env up -d --build                                                                                                                                                                                                   
                                                                                                                                                                                                                                                              
  Here's what was implemented:
                                                                                                                                                                                                                                                              
  Database — database/migration_notes_search.sql: two GIN indexes on notes.title and note_blocks.content using the spanish dictionary.                                                                                                                        
   
  Backend:                                                                                                                                                                                                                                                    
  - note.repository.js — search() with two SQL paths: full FTS query (with websearch_to_tsquery, ts_rank, ts_headline, LATERAL join) when q is present, and a simpler tag-only query when q is empty. Both aggregate tags per note in the result.           
  - note.service.js — search() validates at least one filter is present.                                                                                                                                                                                      
  - note.controller.js — search() parses tag_ids query string to int array.
  - note.validator.js — noteSearchSchema with Joi for query params.                                                                                                                                                                                           
  - note.routes.js — GET /api/notes/search added before /:id to avoid param capture.                                                                                                                                                                          
                                                                                                                                                                                                                                                              
  Frontend:                                                                                                                                                                                                                                                   
  - api/endpoints.js — searchNotes(params).                                                                                                                                                                                                                   
  - hooks/useNotes.js — useNoteSearch({ q, tagIds, limit, enabled }) with keepPreviousData and 10s stale time.                                                                                                                                                
  - NoteSearch.jsx — input with 400ms debounce, tag filter dropdown, active tag badges with remove, clear-all button.
  - NoteSearchResults.jsx — result list with highlighted titles/snippets via dangerouslySetInnerHTML, breadcrumbs built from the flat note tree, tag badges, empty state.                                                                                     
  - Notes.jsx — integrates both components; shows results list in sidebar when search is active, tree otherwise. 


  