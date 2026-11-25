# Task: puesta en producción y documentación de los tags por bloque
2026-11-25 · Operaciones + Docs · Tags por bloque 10/10 · Depende de: 033–041

Spec: §7 ("Operación recomendada") y §10 de
[tags-bloques.md](../../features/specs/tags-bloques.md).

## Objetivo
Migrar en prod las notas-categoría reales con el script, comprobar la feature
completa en prod y dejar la documentación al día.

## Alcance

### 1. Prod
- La 030 ya tiene que estar aplicada desde la 033. Comprobarlo con
  `\d note_block_tag_assignments`.
- Script (041):
  1. Dry-run contra una copia local de prod.
  2. Revisar el reporte con el dueño del proyecto: grupos, warnings y
     referencias redundantes.
  3. `--apply` en prod.
  4. Guardar el reporte fuera del contenedor.
- Recorrido en prod: crear un bloque en una nota con tags, repasar por tag en
  el visor (desktop y tablet) y exportar en JSON y en Markdown.
- Si el dueño quiere, borrar a mano las referencias que el reporte marcó como
  `redundante` (el script nunca borra, D10).

### 2. Documentación (§10)
- `docs/api/reference.md`:
  - `group_key` en el CRUD de tags.
  - Los cinco endpoints nuevos: `POST` y `DELETE /blocks/:blockId/tags`,
    `POST /:noteId/tags/apply-to-blocks`, `GET /blocks/by-tags` y
    `GET /blocks/:blockId`.
  - `tags` en los bloques de `GET /api/notes/:id` y en el export.
- `docs/architecture/database.md`: la migración 030, `group_key` y
  `note_block_tag_assignments` con sus cascadas.
- `docs/analysis/notes-known-issues.md`: C3 resuelto. Corregir de paso la
  descripción: daba un 409 genérico (`errorHandler.js`), no un 500.
- `docs/architecture/frontend.md`: `TagPicker`, `BlockReviewViewer` y
  `useSequenceNavigation`.
- `docs/features/README.md`: la spec en el índice
  (`specs/tags-bloques.md`). `docs/roadmap.md`: el estado.
- `CLAUDE.md`:
  - `note_block_tag_assignments` en la sección de base de datos.
  - El rango de migraciones dice `001_` a `024_` (y en otro sitio `023_`):
    pasarlo a `030_`.
- Mover las tasks 033–042 a `docs/tasks/done/`.

## Criterios de aceptación
- Las notas-categoría del dueño quedan como tags de bloque, y el repaso por tag
  las encuentra en prod.
- La documentación refleja los endpoints, la tabla, el script y los
  componentes nuevos.

## Estado (2026-11-25)
La documentación del §2 está hecha (API, base de datos, frontend, issues, índice
de specs, roadmap y CLAUDE.md). Falta todo el §1 (prod) y mover las tasks a
`done/` al terminar.

Orden obligatorio: aplicar la 030 en prod **antes** del push a `main` que lleve
el código (ver la 033).
