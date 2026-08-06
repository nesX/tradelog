# Bug: la búsqueda full-text no usa los índices GIN de la migración 015
2026-08-05 · **Severidad: MEDIA (rendimiento, escala con el contenido)** · Backend

## Problema
`FTS_QUERY` (`backend/src/repositories/note.repository.js:699-732`):

- El `LEFT JOIN LATERAL` (líneas 710-717) calcula `to_tsvector('spanish', content)`
  **al vuelo** sobre todos los bloques text/callout de todas las notas del
  usuario, en cada request. El predicado `@@` está dentro de un `bool_or(...)`
  agregado → no indexable.
- El `WHERE ... to_tsvector(título) @@ query OR nb.content_match = true`
  (726-729) es un OR con una columna del lateral → tampoco puede usar
  `idx_notes_title_fts`.

Resultado: los dos índices GIN de `database/015_migration_notes_search.sql` son
peso muerto; cada búsqueda es un seq scan + tsvector de todo el contenido del
usuario. Con poco volumen no duele; degrada linealmente al crecer las notas.

## Fix
Reestructurar en dos fases:
1. Obtener los `note_id` candidatos vía predicados indexables:
   `SELECT note_id FROM note_blocks WHERE to_tsvector('spanish', COALESCE(content,'')) @@ websearch_to_tsquery('spanish', $1)`
   `UNION`
   `SELECT id FROM notes WHERE to_tsvector('spanish', COALESCE(title,'')) @@ ...`
   (las expresiones deben coincidir EXACTAMENTE con las de los índices de 015).
2. Calcular rank, `ts_headline` y tags solo para esos ids (+ filtros de user,
   deleted_at, tags).

Mejor aún (migración nueva `0NN_`): columna generada
`tsv tsvector GENERATED ALWAYS AS (to_tsvector('spanish', ...)) STORED` + GIN
sobre ella, y buscar por `tsv @@ query`.

## Verificación
- `EXPLAIN ANALYZE` de la query nueva → debe mostrar Bitmap Index Scan sobre los
  GIN, no Seq Scan con to_tsvector en el filtro.
- Los resultados y snippets deben ser idénticos a los actuales (mismo ranking).
