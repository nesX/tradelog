# Bug: XSS almacenado en resultados de búsqueda de notas
2026-08-05 · **Severidad: ALTA (seguridad)** · Backend + Frontend

## Problema
`ts_headline` de PostgreSQL **no escapa** el HTML presente en el contenido
original — solo envuelve los matches en `<b>...</b>`. El backend devuelve
`title_headline` y `content_snippet` crudos
(`backend/src/repositories/note.repository.js:699-732`, FTS_QUERY) y el cliente
los inyecta con `dangerouslySetInnerHTML`
(`frontend/src/components/notes/NoteSearchResults.jsx:18-26`).

Una nota cuyo título o contenido contenga `<img src=x onerror=alert(1)>`
(p. ej. texto pegado de una fuente externa) ejecuta script al aparecer en los
resultados de búsqueda. Es principalmente self-XSS (las notas son por usuario),
pero el JWT vive en localStorage, así que un script robaría el token.

## Fix
Elegir una (o ambas):
- **Cliente**: sanitizar el HTML permitiendo solo `<b>`/`</b>` antes de inyectar
  (regex de escape + re-inserción de los tags de highlight, o DOMPurify con
  `ALLOWED_TAGS: ['b']`).
- **Backend**: escapar HTML del contenido ANTES de pasarlo a `ts_headline`
  (los `StartSel/StopSel` se añaden después del escape).

## Verificación
- Test: nota con `<img src=x onerror=...>` en título y en un bloque → buscar un
  término adyacente → el markup debe renderizarse como texto, con el highlight
  `<b>` intacto.
