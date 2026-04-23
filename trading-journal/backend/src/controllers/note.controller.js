import { sendSuccess, sendCreated, sendDeleted } from '../utils/response.js';
import * as noteService from '../services/note.service.js';

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

export const moveNote = async (req, res) => {
  const data = await noteService.moveNote(req.user.id, parseInt(req.params.id), req.body.parent_note_id);
  sendSuccess(res, data, 'Nota movida');
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
  const data = await noteService.addImageToBlock(
    req.user.id,
    parseInt(req.params.blockId),
    req.file,
    req.body.caption
  );
  sendCreated(res, data, 'Imagen agregada');
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
