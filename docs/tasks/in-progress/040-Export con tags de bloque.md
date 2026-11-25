# Task: backend — export JSON y Markdown con tags de bloque
2026-11-25 · Backend · Tags por bloque 8/10 · Depende de: 034

Spec: §4.8 de [tags-bloques.md](../../features/specs/tags-bloques.md).

## Objetivo
Que el export no pierda la información nueva: el grupo de cada tag y los tags
de cada bloque.

## Alcance

### 1. `getFullTree` (`note.repository.js:961`)
- La query de tags agrega `group_key`.
- Una sola query más con todas las asignaciones de bloques del usuario, en
  orden canónico:
  ```sql
  SELECT a.block_id, t.name
  FROM note_block_tag_assignments a
  JOIN note_tags t ON t.id = a.tag_id AND t.user_id = $1
  ORDER BY a.block_id, array_position($2::text[], t.group_key::text), LOWER(t.name);
  ```
  Mapear `block_id → [nombres]`.
- `tag_names` de las notas, también en orden canónico (hoy
  `ORDER BY nt.name`): es una respuesta que toca la feature (§4.1).

### 2. JSON (`exportAsJSON` y `buildNoteTree`)
- Diccionario raíz: `tags: [{ name, color, group }]`.
- Cada bloque, de cualquier tipo: `tags: [nombres]`, o `[]` si no tiene. Las
  referencias, siempre `[]`.

### 3. Markdown (`renderMarkdownTree`)
- Después del contenido de cada bloque con tags: una línea en blanco y
  `> Tags: NQ, proyección`. La línea en blanco hace falta porque los callout
  se exportan como `> …`: sin ella, la línea de tags quedaría dentro del
  callout.
- Solo si el bloque emitió contenido (los de texto vacíos hoy se omiten).
- Los bloques sin tags salen igual que hoy.

## Criterios de aceptación
- El JSON trae `group` en el diccionario de tags y `tags` en cada bloque.
- El Markdown muestra la línea de tags en los bloques etiquetados, fuera de
  los callout.
- El export de un usuario sin tags de bloque sale igual que antes, salvo
  `group` y los `tags: []`.
- `npm test` y `npm run lint` limpios.

## Tests (Jest, `note.service.test.js` con `getFullTree` mockeado)
- JSON: `group` en el diccionario; los tags de un bloque en el orden recibido;
  una referencia con `[]`.
- Markdown: texto con tags; callout con tags (la línea queda separada);
  bloque sin tags, sin línea.

## Implementación (2026-11-25)
Hecha. Verificada con la API real y con tests.

De paso: la query de bloques de `getFullTree` no traía `nb.metadata`, así que el
export perdía el estilo de los callout (en Markdown salían todos como "Nota") y
el destino de las referencias. Ahora la trae.
