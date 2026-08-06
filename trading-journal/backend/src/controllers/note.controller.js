import { sendSuccess, sendCreated, sendDeleted } from '../utils/response.js';
import * as noteService from '../services/note.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { deleteFileIfExists } from '../utils/fileUtils.js';
import { imageCaptionSchema } from '../validators/note.validator.js';

// ============================================================
// NOTAS
// ============================================================

export const getTree = async (req, res) => {
  const data = await noteService.getTree(req.user.id);
  sendSuccess(res, data);
};

export const getNote = async (req, res) => {
  const data = await noteService.getNote(req.user.id, parseInt(req.params.id));
  sendSuccess(res, data);
};

export const createNote = async (req, res) => {
  const data = await noteService.createNote(req.user.id, req.body);
  sendCreated(res, data, 'Nota creada');
};

export const updateNoteTitle = async (req, res) => {
  const data = await noteService.updateNoteTitle(req.user.id, parseInt(req.params.id), req.body.title);
  sendSuccess(res, data, 'Título actualizado');
};

export const deleteNote = async (req, res) => {
  await noteService.deleteNote(req.user.id, parseInt(req.params.id));
  sendDeleted(res, 'Nota eliminada');
};

export const restoreNote = async (req, res) => {
  const data = await noteService.restoreNote(req.user.id, parseInt(req.params.id));
  sendSuccess(res, data, 'Nota restaurada');
};

export const moveNote = async (req, res) => {
  const data = await noteService.moveNote(req.user.id, parseInt(req.params.id), req.body.parent_note_id);
  sendSuccess(res, data, 'Nota movida');
};

export const moveDndNote = async (req, res) => {
  const noteId = parseInt(req.params.id, 10);
  const { targetId, dropType } = req.body;
  const data = await noteService.moveDnd({ noteId, targetId, dropType, userId: req.user.id });
  sendSuccess(res, data, 'Nota movida');
};

export const moveBlockDnd = async (req, res) => {
  const blockId = parseInt(req.params.blockId, 10);
  const { targetBlockId, dropType } = req.body;
  const data = await noteService.moveBlockDnd({ blockId, targetBlockId, dropType, userId: req.user.id });
  sendSuccess(res, data, 'Bloque movido');
};

export const moveBlockToNote = async (req, res) => {
  const blockId = parseInt(req.params.blockId, 10);
  const { target_note_id } = req.body;
  const data = await noteService.moveBlockToNote({ blockId, targetNoteId: target_note_id, userId: req.user.id });
  sendSuccess(res, data, 'Bloque movido a otra nota');
};

export const reorderNotes = async (req, res) => {
  await noteService.reorderNotes(req.user.id, req.body.note_ids);
  sendSuccess(res, null, 'Notas reordenadas');
};

export const search = async (req, res) => {
  const { q, tag_ids, limit } = req.query;
  const tagIds = tag_ids ? tag_ids.split(',').map(Number).filter(Boolean) : [];
  const results = await noteService.search(req.user.id, { q, tagIds, limit });
  sendSuccess(res, results);
};

// ============================================================
// BLOQUES
// ============================================================

export const createBlock = async (req, res) => {
  const data = await noteService.createBlock(req.user.id, parseInt(req.params.noteId), req.body);
  sendCreated(res, data, 'Bloque creado');
};

export const updateBlock = async (req, res) => {
  const data = await noteService.updateBlockContent(req.user.id, parseInt(req.params.blockId), req.body.content);
  sendSuccess(res, data, 'Bloque actualizado');
};

export const deleteBlock = async (req, res) => {
  await noteService.deleteBlock(req.user.id, parseInt(req.params.blockId));
  sendDeleted(res, 'Bloque eliminado');
};

export const reorderBlocks = async (req, res) => {
  await noteService.reorderBlocks(req.user.id, parseInt(req.params.noteId), req.body.block_ids);
  sendSuccess(res, null, 'Bloques reordenados');
};

export const updateBlockMetadata = async (req, res) => {
  const data = await noteService.updateBlockMetadata(req.user.id, parseInt(req.params.blockId), req.body);
  sendSuccess(res, data, 'Metadata actualizado');
};

// ============================================================
// IMÁGENES
// ============================================================

export const addImage = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: { message: 'No se recibió ningún archivo', code: 'NO_FILE' } });
  }
  try {
    // El body multipart no pasa por el middleware `validate`; validar el caption
    // aquí evita que un caption >1000 chars reviente contra el VARCHAR(1000) (PG
    // 22001 → 500). Dentro del try para que el catch limpie el archivo ya subido.
    const { error } = imageCaptionSchema.validate({ caption: req.body.caption });
    if (error) throw new ValidationError('El caption no puede superar 1000 caracteres');

    const data = await noteService.addImageToBlock(
      req.user.id,
      parseInt(req.params.blockId),
      req.file,
      req.body.caption
    );
    sendCreated(res, data, 'Imagen agregada');
  } catch (err) {
    // Multer ya escribió el archivo a disco antes de llegar al service; si el service
    // falla (bloque inexistente/ajeno/no-galería) hay que borrarlo para no dejar un
    // huérfano permanente en uploads/.
    if (req.file?.path) await deleteFileIfExists(req.file.path);
    throw err;
  }
};

export const updateImage = async (req, res) => {
  const data = await noteService.updateImageCaption(req.user.id, parseInt(req.params.imageId), req.body.caption);
  sendSuccess(res, data, 'Caption actualizado');
};

export const deleteImage = async (req, res) => {
  await noteService.deleteImage(req.user.id, parseInt(req.params.imageId));
  sendDeleted(res, 'Imagen eliminada');
};

export const reorderImages = async (req, res) => {
  await noteService.reorderImages(req.user.id, parseInt(req.params.blockId), req.body.image_ids);
  sendSuccess(res, null, 'Imágenes reordenadas');
};

// ============================================================
// TRADES DE BLOQUE (trade_reference)
// ============================================================

export const addTradeToBlock = async (req, res) => {
  const data = await noteService.addTradeToBlock(
    req.user.id,
    parseInt(req.params.blockId),
    parseInt(req.body.trade_id)
  );
  sendCreated(res, data, 'Trade añadido al bloque');
};

export const removeTradeFromBlock = async (req, res) => {
  await noteService.removeTradeFromBlock(
    req.user.id,
    parseInt(req.params.blockId),
    parseInt(req.params.tradeId)
  );
  sendDeleted(res, 'Trade removido del bloque');
};

// ============================================================
// TAGS
// ============================================================

export const getTags = async (req, res) => {
  const data = await noteService.getTags(req.user.id);
  sendSuccess(res, data);
};

export const createTag = async (req, res) => {
  const data = await noteService.createTag(req.user.id, req.body);
  sendCreated(res, data, 'Tag creado');
};

export const updateTag = async (req, res) => {
  const data = await noteService.updateTag(req.user.id, parseInt(req.params.tagId), req.body);
  sendSuccess(res, data, 'Tag actualizado');
};

export const deleteTag = async (req, res) => {
  await noteService.deleteTag(req.user.id, parseInt(req.params.tagId));
  sendDeleted(res, 'Tag eliminado');
};

export const assignTags = async (req, res) => {
  await noteService.assignTags(req.user.id, parseInt(req.params.noteId), req.body.tag_ids);
  sendSuccess(res, null, 'Tags asignados');
};

export const removeTags = async (req, res) => {
  await noteService.removeTags(req.user.id, parseInt(req.params.noteId), req.body.tag_ids);
  sendSuccess(res, null, 'Tags removidos');
};

// ============================================================
// EXPORTACIÓN
// ============================================================

export const exportJSON = async (req, res) => {
  const data = await noteService.exportAsJSON(req.user.id);
  sendSuccess(res, data);
};

export const exportMarkdown = async (req, res) => {
  const content = await noteService.exportAsMarkdown(req.user.id);
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.send(content);
};

// ============================================================
// SEGUIMIENTO DE BLOQUES
// ============================================================

export const toggleFollowUp = async (req, res) => {
  const blockId = parseInt(req.params.blockId, 10);
  const block = await noteService.toggleFollowUp(blockId, req.user.id, Boolean(req.body.requires_follow_up));
  sendSuccess(res, block, 'Estado de seguimiento actualizado');
};

export const getReview = async (req, res) => {
  // Query ya validada/coercida por noteReviewSchema (validate(..., 'query')).
  const { hours = 24, pendingHours: rawPending } = req.query;
  // 'all' → sin límite de antigüedad (null); si no, es un número ya validado.
  const pendingHours = rawPending === 'all' || rawPending == null ? null : rawPending;

  const data = await noteService.getReviewData(req.user.id, hours, pendingHours);
  sendSuccess(res, data);
};
