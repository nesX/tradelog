# Task: backend — repaso por tag y `GET` de un bloque suelto
2026-11-25 · Backend · Tags por bloque 5/10 · Depende de: 034 (en paralelo con 035 y 036)

Spec: §4.7 y §8 de [tags-bloques.md](../../features/specs/tags-bloques.md).

## Objetivo
Los dos endpoints de la Fase 3: los bloques que cumplen una combinación de
tags (OR dentro de un grupo, AND entre grupos, D3) y un bloque suelto con el
mismo shape que en `GET /api/notes/:id`, para el visor.

## Alcance

### 1. `GET /api/notes/blocks/by-tags?tag_ids=1,4,7`
- **Ruta**: junto a `GET /blocks/review` y `GET /blocks/revisit`
  (`note.routes.js:60`), antes de `/blocks/:blockId`. El spec propone
  `/review/tag-blocks`, pero pide ubicarlo con los endpoints de repaso que ya
  existen, y esos cuelgan de `/blocks/`.
- **Validator** (`'query'`): `tag_ids` requerido con `/^\d+(,\d+)*$/`, como
  `noteSearchSchema`.
- **Service** `getBlocksByTags(userId, tagIds)`, en este orden:
  1. Deduplicar.
  2. Más de `TAG_REVIEW_MAX_TAGS` → `ValidationError`.
  3. `getTagsByIds` (devuelve `group_key` desde la 033); si falta alguno,
     `ValidationError('Algunos tags no existen o no te pertenecen')`.
  4. `group_count` = grupos distintos entre esos tags.
- **Repository**: el SQL del §4.7 adaptado al esquema real:
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
  SELECT b.id AS block_id, b.note_id, n.title AS note_title, b.block_type,
         CASE WHEN b.block_type IN ('text', 'callout')
              THEN LEFT(b.content, 140) END AS preview,
         b.created_at, b.updated_at, b.marked_for_revisit,
         (COUNT(*) OVER ())::int AS total
  FROM matched m
  JOIN note_blocks b ON b.id = m.block_id
  JOIN notes n ON n.id = b.note_id AND n.user_id = $1
              AND n.deleted_at IS NULL AND n.type = 'note'
  WHERE b.block_type <> 'reference'
  ORDER BY b.created_at DESC, b.id DESC
  LIMIT $4;
  ```
  Diferencias con el spec:
  - Sin `b.user_id` (no existe) y con `block_type` en lugar de `type`.
  - `marked_for_revisit` en lugar de `requires_follow_up`: es la marca de
    Repaso.
  - `n.type = 'note'`, como las consultas de Revisión y Repaso: deja fuera las
    notas ocultas de los pendientes.
- **Respuesta** `{ items, total, truncated }`, con
  `$4 = TAG_REVIEW_MAX_ITEMS`. `total` sale de la primera fila (0 si no hay
  filas) y `truncated` es `total > items.length`.

### 2. `GET /api/notes/blocks/:blockId`
- Mismo shape que cada elemento de `blocks` en `getById`: `nb.*`, imágenes,
  trades, `price_alerts`, `date_reminders`, `linked_note_title` y `tags`.
  Extraer las columnas de la query de bloques de `getById` (`:40`) a un
  fragmento compartido, sin duplicarlas.
- Agrega `note: { id, title }`.
- Bloque ajeno o de nota borrada → `NotFoundError('Bloque no encontrado')`.
- Ruta después de las estáticas `/blocks/review`, `/blocks/revisit` y
  `/blocks/by-tags`.

## Criterios de aceptación
- Con `NQ` (activo) y `proyección` y `trade perdido` (tipo): pedir los tres
  devuelve los bloques con NQ y al menos uno de los otros dos.
- La misma consulta excluye los bloques que solo tienen NQ, las referencias,
  los bloques de notas en la papelera y los de pendientes.
- `tag_ids=1,1,4` funciona; `tag_ids=abc` → 400; un tag ajeno o borrado →
  400; 51 tags → 400.
- Con más de 500 resultados: 500 `items`, el `total` real y
  `truncated: true`.
- `GET /blocks/:id` devuelve lo mismo que ese bloque en `GET /api/notes/:id`,
  más `note`. Ajeno o de una nota en la papelera → 404.
- `npm test` y `npm run lint` limpios.

## Tests (Jest)
- Validator: `tag_ids` válido, vacío, con letras, con coma final y ausente.
- `getBlocksByTags`:
  - `[1, 1, 4]` llega a `getTagsByIds` sin duplicados.
  - 51 ids → `ValidationError`.
  - Tag ajeno → `ValidationError`.
  - `group_count` correcto (dos de `tipo` y uno de `activo` → 2).
  - `truncated`.

## Notas
- Opcional: `EXPLAIN ANALYZE` en dev para ver que el CTE usa el índice
  `(tag_id, block_id)` de la 030.

## Implementación (2026-11-25)
Hecha, sin desviaciones. Verificada con la API real: criterio D3, exclusiones
(solo NQ, referencias, papelera, pendientes), `1,1,4`, `abc`, coma final, tag
ajeno, 51 tags, y 704 resultados → 500 items con `truncated: true`.
`GET /blocks/:id` devuelve exactamente el bloque de `GET /api/notes/:id` más
`note`. `BLOCK_DETAIL_COLUMNS` + `LINKED_NOTE_JOIN` son el fragmento compartido.
