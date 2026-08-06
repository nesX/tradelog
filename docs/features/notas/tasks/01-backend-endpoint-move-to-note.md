# Task 01 — Backend: endpoint `move-to-note` (validator + ruta + controller)

## Objetivo

Exponer `PATCH /api/notes/blocks/:blockId/move-to-note` con body `{ target_note_id }`.

## Cambios

- `backend/src/validators/note.validator.js`: nuevo `moveBlockToNoteSchema`
  (`target_note_id: Joi.number().integer().positive().required()`).
- `backend/src/routes/note.routes.js`: ruta `PATCH /blocks/:blockId/move-to-note`
  junto a `/blocks/:blockId/move-dnd` (zona de rutas de bloques sin `:noteId`).
- `backend/src/controllers/note.controller.js`: `moveBlockToNote` — parsea params/body
  y delega en el service. Respuesta vía `sendSuccess` con `{ block, source_note_id }`.

## Criterios de aceptación

- Body inválido (sin `target_note_id`, negativo, no numérico) → 400 con `sendValidationError`.
- Requiere `authenticate` (hereda del `router.use`).
