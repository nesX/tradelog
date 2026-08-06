# Bug: gestión de archivos de imágenes incoherente con el soft-delete
2026-08-05 · **Severidad: MEDIA (fuga de disco + imágenes rotas)** · Backend

## Problemas
1. **Huérfanos por upload fallido** — `note.service.js:298-310`: multer escribe
   el archivo a disco ANTES de llegar al service; si `addImageToBlock` falla
   (blockId inexistente, ajeno, o no-galería), nadie borra `req.file` →
   huérfano permanente en `uploads/` por cada intento.
2. **Política de borrado contradictoria con el soft-delete** —
   `note.repository.js:350-361` + `note.service.js:64-69`: al borrar una nota
   (soft-delete, recuperable) las imágenes >24h se borran de disco al instante
   (si se restaura → imágenes rotas), y las <24h no las purga nadie jamás
   (fuga de disco). Las filas soft-deleted tampoco se purgan nunca.
3. **`deleteBlock` sin transacción y sin gracia** — `note.repository.js:433-440`:
   SELECT de paths + DELETE en dos statements; una imagen añadida entre ambos
   queda huérfana. Además borra archivos al instante (hard-delete irreversible),
   inconsistente con la gracia de 24h del borrado de notas.

## Fix
Decidir UNA política y aplicarla en todos los caminos. Propuesta:
- **Purga diferida**: al borrar nota/bloque no tocar archivos; un job (cron del
  host o `setInterval` en el server) purga filas con `deleted_at > X días` y
  sus archivos, más archivos de `uploads/` sin fila que los referencie
  (barrido de huérfanos, que también limpia el punto 1 retroactivamente).
- En el error handler del upload (o catch del controller):
  `unlink(req.file.path)` cuando el service falla.
- `deleteBlock`: `DELETE ... RETURNING filename` en la misma transacción.

## Relacionado (ya documentado en docs/analysis/security.md)
`/api/images` se sirve sin autenticación (`server.js:53`). Si se toca esta zona,
considerar mover el static detrás de `authenticate` + verificación de ownership
del filename.

## Verificación
- Upload a blockId ajeno → 404 y `uploads/` sin archivo nuevo.
- Borrar nota con imágenes → archivos siguen X días y desaparecen tras el job.
