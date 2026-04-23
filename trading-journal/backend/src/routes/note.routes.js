import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { upload, handleMulterError } from '../middleware/upload.js';
import * as ctrl from '../controllers/note.controller.js';
import {
  createNoteSchema,
  updateNoteTitleSchema,
  reorderNotesSchema,
  moveNoteSchema,
  createBlockSchema,
  updateBlockSchema,
  updateCalloutMetadataSchema,
  reorderBlocksSchema,
  createTagSchema,
  updateTagSchema,
  assignTagsSchema,
  removeTagsSchema,
  updateImageCaptionSchema,
  reorderImagesSchema,
  noteSearchSchema,
} from '../validators/note.validator.js';

const router = Router();
router.use(authenticate);

// ---------------------------------------------------------------
// Rutas estáticas ANTES de las rutas con :id para evitar conflictos
// ---------------------------------------------------------------

// Exportación
router.get('/export/json', ctrl.exportJSON);
router.get('/export/markdown', ctrl.exportMarkdown);

// Árbol de notas
router.get('/tree', ctrl.getTree);

// Búsqueda full-texto
router.get('/search', validate(noteSearchSchema, 'query'), ctrl.search);

// Reordenar notas (no tiene :id)
router.patch('/reorder', validate(reorderNotesSchema), ctrl.reorderNotes);

// Tags — globales
router.get('/tags', ctrl.getTags);
router.post('/tags', validate(createTagSchema), ctrl.createTag);
router.patch('/tags/:tagId', validate(updateTagSchema), ctrl.updateTag);
router.delete('/tags/:tagId', ctrl.deleteTag);

// Bloques (rutas sin noteId param)
router.patch('/blocks/:blockId', validate(updateBlockSchema), ctrl.updateBlock);
router.patch('/blocks/:blockId/metadata', validate(updateCalloutMetadataSchema), ctrl.updateBlockMetadata);
router.delete('/blocks/:blockId', ctrl.deleteBlock);

// Imágenes
router.post(
  '/blocks/:blockId/images',
  upload.single('image'),
  handleMulterError,
  ctrl.addImage
);
router.patch('/blocks/:blockId/images/reorder', validate(reorderImagesSchema), ctrl.reorderImages);
router.patch('/images/:imageId', validate(updateImageCaptionSchema), ctrl.updateImage);
router.delete('/images/:imageId', ctrl.deleteImage);

// ---------------------------------------------------------------
// CRUD de notas
// ---------------------------------------------------------------

router.post('/', validate(createNoteSchema), ctrl.createNote);
router.get('/:id', ctrl.getNote);
router.patch('/:id/title', validate(updateNoteTitleSchema), ctrl.updateNoteTitle);
router.delete('/:id', ctrl.deleteNote);
router.patch('/:id/move', validate(moveNoteSchema), ctrl.moveNote);

// Tags asignados a una nota
router.post('/:noteId/tags', validate(assignTagsSchema), ctrl.assignTags);
router.delete('/:noteId/tags', validate(removeTagsSchema), ctrl.removeTags);

// Bloques dentro de una nota
router.post('/:noteId/blocks', validate(createBlockSchema), ctrl.createBlock);
router.patch('/:noteId/blocks/reorder', validate(reorderBlocksSchema), ctrl.reorderBlocks);

export default router;
