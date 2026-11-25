# Task: backend — búsqueda por palabras y tags de bloque
2026-11-25 · Backend · Búsqueda y tags 1/6 · Depende de: —

## Objetivo
Que `GET /api/notes/search` encuentre **bloques**, no solo notas, que filtre por
tags de bloque con la misma regla que Repaso y que encuentre palabras a medio
escribir. Es la base de la página `/buscar` (044).

## Contexto
Hoy (`search` en `note.repository.js:1118`, queries desde `:1030`):
- Con texto devuelve notas cuyo título o bloques text/callout hacen match
  (`websearch_to_tsquery`). El snippet de cada nota concatena todos sus bloques.
- El filtro de tags mira **tags de nota**, con OR (`TAG_FILTER`).

Desde la feature de tags por bloque, lo que se etiqueta es el bloque y los
filtros miran solo tags de bloque (D7 de
[tags-bloques.md](../../features/specs/tags-bloques.md)), así que el filtro
actual ya no encuentra lo etiquetado. El único consumidor es
`NoteSearchResults.jsx`, que desaparece en la 044: el shape puede cambiar sin
compatibilidad hacia atrás.

## Alcance

### 1. Semántica
| Entrada | Resultado |
|---|---|
| Solo texto | Notas cuyo título hace match, y bloques text/callout cuyo contenido hace match, agrupados por nota |
| Solo tags | Bloques con esos tags: OR dentro de un grupo, AND entre grupos (igual que `findBlocksByTags`, `:1000`) |
| Texto + tags | Bloques que cumplen los tags **y** cuyo contenido o el título de su nota hace match |
| Nada | `ValidationError('Escribe algo o elige un tag')` |

- Sin bloques de referencia (D6), sin notas borradas y solo `type = 'note'`.
- Con texto + tags, si el título de una nota hace match pero ningún bloque suyo
  tiene esos tags, la nota no aparece. Un bloque de cualquier tipo (imagen,
  galería…) con los tags sí aparece si el título de su nota hace match.

### 2. Prefijos: buscar mientras se escribe
`websearch_to_tsquery` no hace prefijos: "proyec" no encuentra "proyección".
Agregar en el service una función pura `buildSearchQuery(q)` que devuelva
`{ text, mode }`:
- Si `q` usa operadores de websearch (comillas, `or` como palabra o `-` al
  inicio de una palabra): `mode: 'websearch'` y `q` tal cual, como hoy.
- Si no: tokens `[\p{L}\p{N}]+` (con `u`), unidos con ` & `, y el último con
  `:*` → `mode: 'prefix'` para `to_tsquery('spanish', $1)`. Limpiar los tokens
  evita que `to_tsquery` falle por sintaxis (sería un 500).
- Sin tokens (`q = "???"`): equivale a no tener texto.
- El repository elige la función según `mode` (nombre fijo en el SQL, nunca
  texto del usuario concatenado); el valor va siempre como parámetro.

Confirmar en la BD:
- `SELECT to_tsvector('spanish', 'proyecciones') @@ to_tsquery('spanish', 'proyec:*')`.
- Lo mismo sin tilde (`'proyeccion:*'` contra `'proyección'`). Si no da match,
  anotarlo: `unaccent` queda fuera de alcance, porque exige la extensión y
  recrear los índices GIN.
- Si el último token es una stopword ("de"), `to_tsquery` la descarta. Si
  todos los tokens lo son, la query queda vacía: cero resultados, no un error.

### 3. Respuesta
```json
{
  "notes": [
    {
      "id": 12, "title": "NQ", "parent_note_id": 3, "updated_at": "…",
      "title_headline": "<b>NQ</b>",
      "title_match": true,
      "block_count": 7,
      "blocks": [
        { "block_id": 81, "block_type": "text", "snippet": "… <b>proyección</b> …",
          "tags": [{ "id": 4, "name": "NQ", "color": "#3B82F6", "group_key": "activo" }],
          "created_at": "…" }
      ],
      "block_ids": [81, 84, 90]
    }
  ],
  "total_notes": 14,
  "total_blocks": 52,
  "truncated": false
}
```
- `blocks`: hasta 3 por nota (constante `SEARCH_SNIPPETS_PER_NOTE`). Con texto,
  los de mejor rank; solo con tags, los más recientes. Calcular `ts_headline`
  solo para esos, que es lo caro.
- `snippet`: con texto, `ts_headline` del bloque (`MaxWords=20, MinWords=5`,
  como hoy). Solo con tags, `LEFT(content, 140)` para text/callout y `null`
  para el resto, como `findBlocksByTags`.
- `block_ids`: todos los bloques de la nota que hicieron match, en el orden de
  la nota (`position`). Los usa "Repasar" (044).
- `tags` de cada bloque en orden canónico (`tagOrder`).
- Orden de las notas: con texto, por rank (título ×2 + mejor bloque) y luego
  `updated_at`, como hoy. Solo con tags, por el bloque más reciente.
- Topes: `limit` notas (default 30, máximo 100, como hoy). En total, hasta
  `TAG_REVIEW_MAX_ITEMS` (500) ids en `block_ids`; si se corta, `truncated`.

### 4. SQL
- Mantener las dos fases de la FTS actual (comentario en `:1046`). Los
  candidatos salen de predicados que coinciden **exactamente** con las
  expresiones indexadas (`to_tsvector('spanish', COALESCE(title|content, ''))`),
  y el rank, los snippets y los tags se calculan solo para ellos.
- El filtro por tags es el de `findBlocksByTags`:
  `HAVING COUNT(DISTINCT t.group_key) = $groupCount`. `groupCount` se calcula
  en el service, como en `getBlocksByTags` (`note.service.js:721`). Sacar a un
  helper compartido la validación de tags (existen, son del usuario, como
  máximo `TAG_REVIEW_MAX_TAGS`) y el conteo de grupos.
- `user_id` en todas las subqueries y parámetros `$N` en todo. `TAG_GROUPS` va
  como parámetro, igual que en el resto del repo.
- `EXPLAIN ANALYZE` en los dos modos (`prefix` y `websearch`): tiene que
  mostrar Bitmap Index Scan sobre `idx_notes_title_fts` e
  `idx_note_blocks_content_fts` (migración 015).

### 5. Validator y tests
- `noteSearchSchema` (`note.validator.js:106`) no cambia. La regla "texto o
  tags" va en el service, porque depende de `buildSearchQuery`.
- Tests de `buildSearchQuery`:
  - `proyec` → `proyec:*`
  - `nq proyec` → `nq & proyec:*`
  - `"trade perdido"` y `nq -btc` → websearch
  - `c++ (test):` → solo tokens limpios
  - `???` → sin texto
- Tests del service: sin texto ni tags lanza `ValidationError`, y `groupCount`
  sale del helper compartido.

## Criterios de aceptación
- `?q=proyec` encuentra bloques con "proyección" y con "proyecciones".
- `?q="trade perdido"` busca la frase exacta.
- `?tag_ids=` con dos tags de grupos distintos devuelve solo los bloques que
  tienen los dos; con dos del mismo grupo, los que tienen cualquiera. Son los
  mismos ids que `GET /api/notes/blocks/by-tags` con esos tags.
- `?q=NQ&tag_ids=X` incluye los bloques con X de notas tituladas "NQ", aunque
  su contenido no diga NQ.
- Nunca aparecen bloques de referencia, notas en la papelera ni contenido de
  otro usuario.
- Un `q` con `(`, `:`, `&` o `!` no da 500.
- `EXPLAIN ANALYZE` muestra los dos índices GIN.
- `npm run lint` y `npm test` limpios.

## Implementación (2026-11-25)
Hecha. Criterios verificados contra una copia de la BD de dev con datos de
prueba (tags en grupos distintos, nota borrada, nota y tag de otro usuario), por
el service y por HTTP: `?q=proyec`, frase exacta, AND/OR entre grupos (mismos
ids que `/blocks/by-tags`), `?q=NQ&tag_ids=X` con un bloque de imagen de una
nota "NQ…", `q` con `( : & !` → 400 de validación o cero resultados, nunca 500.
`EXPLAIN ANALYZE` (con y sin `enable_seqscan`) muestra Bitmap Index Scan sobre
`idx_notes_title_fts` e `idx_note_blocks_content_fts` en `prefix`, `websearch` y
`prefix` + tags.

Confirmado en la BD (§2):
- `proyec:*` encuentra "proyección" y "proyecciones".
- Sin tilde: `proyeccion:*` encuentra "proyección", porque el stemmer español
  quita las tildes. **No siempre**: "operación" → `oper`, pero "operacion" →
  `operacion`, así que "operacion" no encuentra "operación" (el sufijo
  `-ación` solo se reconoce con tilde). `unaccent` sigue haciendo falta para
  que la búsqueda sin tildes funcione siempre.
- Stopwords: "de" sola → cero resultados, sin error.
- **Hueco a medio escribir**: si la raíz de la palabra completa es más corta
  que lo escrito, el prefijo deja de coincidir mientras se escribe.
  "oper"/"opera" encuentran "operación" (raíz `oper`), pero "operac"…"operacio"
  no; "perdi" no encuentra "perdido" (`perd`). Con la palabra completa vuelve a
  encontrar. Arreglo posible: agregar al último token los prefijos exactos más
  cortos (`operac:* | opera | oper`). Amplía los resultados, así que es una
  decisión aparte.

Desviaciones:
- `title_headline` usa `HighlightAll=true`: con `MaxWords=8` los títulos largos
  se cortaban aunque no hicieran match ("Zona que define maximos y minimos" →
  "Zona que define"). Ya pasaba antes. Sin texto vale `null`.
- Con texto + tags, un bloque text/callout que entra por el título de su nota
  lleva `LEFT(content, 140)` como snippet: `ts_headline` sin match devolvía solo
  las primeras 5 palabras.
- `search` valida los tags con el helper compartido (`resolveTagFilter`): un
  tag ajeno o borrado da 400, igual que en el repaso por tag. Antes se ignoraba.
- `buildSearchQuery` devuelve `null` cuando no hay tokens.
- El repository devuelve la respuesta ya armada: una fila por (nota, bloque con
  snippet), agrupada en JS; los tags salen de `getBlockTags` (una query más), así
  `created_at` llega como fecha y no como texto JSON.
- El tope de 500 ids se aplica en el orden de los resultados: si se corta, una
  nota puede quedar con `block_ids` parcial o vacío.
