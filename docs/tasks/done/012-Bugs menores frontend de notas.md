# Bugs menores — frontend de notas (lote)
2026-08-05 · **Severidad: BAJA** · Frontend

Lote de fixes pequeños e independientes; se pueden hacer en una sola pasada.

1. **Editor sigue mostrando una nota borrada** — `hooks/useNotes.js:68-74` +
   `pages/Notes.jsx:148-152`: al borrar un padre desde el sidebar, si la nota
   abierta es un descendiente, el editor la sigue mostrando (y deja "editar")
   hasta navegar. Invalidar/`removeQueries` de `noteKeys.detail` y navegar si la
   nota abierta es descendiente de la borrada.

2. **Metadatos de galería capturados en el mount** —
   `components/notes/NoteImageGalleryBlock.jsx:33-36`: `useState(meta.analysis_date)`
   y `useState(meta.symbols)` solo se inicializan al montar; si el bloque cambió
   por otra vía, el editor de metadatos muestra y re-guarda valores viejos.
   Resetear los estados al abrir `editingMeta` (onClick de la línea ~245).

3. **Timeouts sin cleanup** — `NoteBlockList.jsx:261-267` (saveStatus, 2s) y
   `NoteEditor.jsx:83` (highlight-pulse): guardar ids en ref y limpiar en el
   cleanup del efecto.

4. **Input de imágenes acepta cualquier archivo** —
   `NoteImageGalleryBlock.jsx:276`: `accept="*"` aunque la UI promete
   "JPG, PNG, WebP, GIF". Poner `accept="image/*"` + validar `file.type` antes
   de subir (el backend solo valida MIME — gap conocido).

5. **`expandedIds` en localStorage crece sin límite** — `NoteTree.jsx:17-31`:
   nunca se purgan ids de notas borradas. Al guardar, intersectar con los ids
   existentes en `flat`.

6. **"Recientes" ordena por `created_at`** — `pages/Notes.jsx:435`: una nota
   editada a diario nunca sube. Ordenar por `updated_at` (verificar que el
   endpoint del árbol lo devuelve; si no, exponerlo).

7. **Referencias internas abren en pestaña nueva** —
   `NoteReferenceBlock.jsx:111-115,171-176`: `<a target="_blank">` hacia
   `/notes/...` saca de la PWA standalone. Usar `<Link>` de react-router
   (el parse de `referenceLinks` ya da noteId/blockId).

8. **Hooks muertos** — `hooks/useNotes.js`: `useReorderNotes` (84),
   `useReorderBlocks` (128), `useUpdateImageCaption` (152), `useRemoveTags`
   (221) no tienen consumidores (verificado con grep). Eliminarlos junto a sus
   endpoints huérfanos o dejar TODO explícito.
