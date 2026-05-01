import path from 'path';
import { generateKeyBetween } from 'fractional-indexing';
import { config } from '../config/env.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import { deleteFileIfExists } from '../utils/fileUtils.js';
import * as repo from '../repositories/note.repository.js';

const uploadsDir = () => path.resolve(config.upload.dir);

const deleteFiles = async (filenames) => {
  for (const filename of filenames) {
    if (filename) {
      await deleteFileIfExists(path.join(uploadsDir(), filename));
    }
  }
};

// ============================================================
// NOTAS
// ============================================================

export const getTree = async (userId) => {
  return repo.getTree(userId);
};

export const getNote = async (userId, noteId) => {
  const note = await repo.getById(userId, noteId);
  if (!note) throw new NotFoundError('Nota no encontrada');
  return note;
};

export const createNote = async (userId, { title, parent_note_id }) => {
  if (parent_note_id) {
    const parent = await repo.getById(userId, parent_note_id);
    if (!parent) throw new NotFoundError('Nota padre no encontrada');
  }
  return repo.create(userId, { title, parent_note_id: parent_note_id || null });
};

export const updateNoteTitle = async (userId, noteId, title) => {
  const note = await repo.updateTitle(userId, noteId, title);
  if (!note) throw new NotFoundError('Nota no encontrada');
  return note;
};

export const deleteNote = async (userId, noteId) => {
  const note = await repo.getById(userId, noteId);
  if (!note) throw new NotFoundError('Nota no encontrada');

  // Obtener todos los descendientes (incluyendo la nota misma) para limpiar imágenes
  const deletedIds = await repo.softDelete(userId, noteId);
  const imagePaths = await repo.getImagePathsByNoteIds(deletedIds);
  await deleteFiles(imagePaths);
};

export const moveNote = async (userId, noteId, newParentId) => {
  const note = await repo.getById(userId, noteId);
  if (!note) throw new NotFoundError('Nota no encontrada');

  if (newParentId !== null && newParentId !== undefined) {
    const parent = await repo.getById(userId, newParentId);
    if (!parent) throw new NotFoundError('Nota destino no encontrada');

    const isDesc = await repo.isDescendant(noteId, newParentId);
    if (isDesc) {
      throw new ValidationError('No puedes mover una nota dentro de sí misma o sus sub-notas');
    }
  }

  const updated = await repo.move(userId, noteId, newParentId ?? null);
  if (!updated) throw new NotFoundError('Nota no encontrada');
  return updated;
};

export const reorderNotes = async (userId, noteIds) => {
  const notes = await repo.getNotesByIds(userId, noteIds);

  if (notes.length !== noteIds.length) {
    throw new ValidationError('Algunas notas no existen o no te pertenecen');
  }

  const parentIds = new Set(notes.map((n) => n.parent_note_id));
  if (parentIds.size > 1) {
    throw new ValidationError('Todas las notas deben ser hermanas (mismo padre)');
  }

  await repo.reorderSiblings(userId, noteIds);
};

// ============================================================
// DRAG & DROP — movimiento con fractional indexing
// ============================================================

/**
 * Mueve una nota a una nueva posición/padre usando fractional indexing.
 * Un único UPDATE por operación, sin reescribir hermanos.
 *
 * @param {Object} params
 * @param {number} params.noteId     - Nota a mover (source)
 * @param {number} params.targetId   - Nota referencia del destino
 * @param {'sibling-above'|'sibling-below'|'child'} params.dropType
 * @param {number} params.userId
 */
export const moveDnd = async ({ noteId, targetId, dropType, userId }) => {
  if (noteId === targetId) {
    throw new ValidationError('No puedes mover una nota sobre sí misma');
  }

  const [sourceNote, targetNote] = await Promise.all([
    repo.findNoteByIdAndUser(noteId, userId),
    repo.findNoteByIdAndUser(targetId, userId),
  ]);

  if (!sourceNote) throw new NotFoundError('Nota origen no encontrada');
  if (!targetNote) throw new NotFoundError('Nota destino no encontrada');

  // Evitar ciclos: el destino no puede ser descendiente del source
  const descendantIds = await repo.getDescendantIds(noteId);
  if (descendantIds.includes(targetId)) {
    throw new ValidationError('No puedes mover una nota dentro de uno de sus descendientes');
  }

  let newParentId;
  let newPosition;

  if (dropType === 'child') {
    // Anidar como hijo del target → al final de sus hijos
    newParentId = targetId;
    const lastChildPos = await repo.getLastChildPosition(targetId);
    newPosition = generateKeyBetween(lastChildPos, null);
  } else {
    // Sibling: mismo padre que el target
    newParentId = targetNote.parent_note_id;
    const side = dropType === 'sibling-above' ? 'above' : 'below';
    const { before, after } = await repo.getSiblingPositions(
      newParentId,
      userId,
      targetNote.position,
      side
    );
    newPosition = generateKeyBetween(before, after);
  }

  const updated = await repo.updateNoteParentAndPosition(noteId, newParentId, newPosition, userId);
  if (!updated) throw new NotFoundError('No se pudo mover la nota');
  return updated;
};

/**
 * Mueve un bloque dentro de su nota con fractional indexing.
 * Bloques no anidan: solo sibling-above / sibling-below.
 *
 * @param {Object} params
 * @param {number} params.blockId       - Bloque a mover
 * @param {number} params.targetBlockId - Bloque referencia del destino
 * @param {'sibling-above'|'sibling-below'} params.dropType
 * @param {number} params.userId
 */
export const moveBlockDnd = async ({ blockId, targetBlockId, dropType, userId }) => {
  if (blockId === targetBlockId) {
    throw new ValidationError('No puedes mover un bloque sobre sí mismo');
  }
  if (dropType === 'child') {
    throw new ValidationError('Los bloques no pueden contener otros bloques');
  }

  const [sourceBlock, targetBlock] = await Promise.all([
    repo.findBlockByIdAndUser(blockId, userId),
    repo.findBlockByIdAndUser(targetBlockId, userId),
  ]);

  if (!sourceBlock) throw new NotFoundError('Bloque origen no encontrado');
  if (!targetBlock) throw new NotFoundError('Bloque destino no encontrado');

  if (sourceBlock.note_id !== targetBlock.note_id) {
    throw new ValidationError('Mover bloques entre notas distintas no está soportado en V1');
  }

  const side = dropType === 'sibling-above' ? 'above' : 'below';
  const { before, after } = await repo.getSiblingBlockPositions(
    targetBlock.note_id,
    targetBlock.position,
    side
  );
  const newPosition = generateKeyBetween(before, after);

  const updated = await repo.updateBlockPosition(blockId, newPosition, userId);
  if (!updated) throw new NotFoundError('No se pudo mover el bloque');
  return updated;
};

export const search = async (userId, { q, tagIds, limit }) => {
  if (!q?.trim() && (!tagIds || tagIds.length === 0)) {
    throw new ValidationError('Se requiere texto de búsqueda o al menos un tag');
  }
  return repo.search(userId, { q: q?.trim() ?? '', tagIds: tagIds ?? [], limit });
};

// ============================================================
// BLOQUES
// ============================================================

export const createBlock = async (userId, noteId, data) => {
  const note = await repo.getById(userId, noteId);
  if (!note) throw new NotFoundError('Nota no encontrada');

  if (data.block_type === 'note_link' && data.linked_note_id) {
    const linkedNote = await repo.getById(userId, data.linked_note_id);
    if (!linkedNote) throw new NotFoundError('Nota vinculada no encontrada');
  }

  return repo.createBlock(noteId, data);
};

export const updateBlockContent = async (userId, blockId, content) => {
  const block = await repo.getBlockById(blockId);
  if (!block) throw new NotFoundError('Bloque no encontrado');
  if (block.user_id !== userId) throw new NotFoundError('Bloque no encontrado');
  if (block.block_type !== 'text' && block.block_type !== 'callout') {
    throw new ValidationError('Solo se puede editar el contenido de bloques de texto o callout');
  }
  return repo.updateBlockContent(blockId, content);
};

export const updateBlockMetadata = async (userId, blockId, newMetadata) => {
  const block = await repo.getBlockById(blockId);
  if (!block) throw new NotFoundError('Bloque no encontrado');
  if (block.user_id !== userId) throw new NotFoundError('Bloque no encontrado');
  if (!['callout', 'image_gallery'].includes(block.block_type)) {
    throw new ValidationError('Solo se puede actualizar metadata de bloques callout o image_gallery');
  }
  const existing = block.metadata || {};
  const merged = { ...existing, ...newMetadata };
  if (newMetadata.icon === null) delete merged.icon;
  return repo.updateBlockMetadata(blockId, merged);
};

export const deleteBlock = async (userId, blockId) => {
  const block = await repo.getBlockById(blockId);
  if (!block) throw new NotFoundError('Bloque no encontrado');
  if (block.user_id !== userId) throw new NotFoundError('Bloque no encontrado');

  const imagePaths = await repo.deleteBlock(blockId);
  await deleteFiles(imagePaths);
};

export const reorderBlocks = async (userId, noteId, blockIds) => {
  const note = await repo.getById(userId, noteId);
  if (!note) throw new NotFoundError('Nota no encontrada');

  const existing = await repo.getBlocksByNoteId(noteId);
  const existingIds = new Set(existing.map((b) => b.id));
  for (const id of blockIds) {
    if (!existingIds.has(id)) {
      throw new ValidationError('Algunos bloques no pertenecen a esta nota');
    }
  }

  await repo.reorderBlocks(noteId, blockIds);
};

// ============================================================
// IMÁGENES
// ============================================================

export const addImageToBlock = async (userId, blockId, file, caption) => {
  const block = await repo.getBlockById(blockId);
  if (!block) throw new NotFoundError('Bloque no encontrado');
  if (block.user_id !== userId) throw new NotFoundError('Bloque no encontrado');
  if (block.block_type !== 'image_gallery') {
    throw new ValidationError('Solo se pueden agregar imágenes a bloques de galería');
  }

  return repo.addImage(blockId, {
    image_path: file.filename,
    caption: caption || null,
  });
};

export const updateImageCaption = async (userId, imageId, caption) => {
  const image = await repo.getImageById(imageId);
  if (!image) throw new NotFoundError('Imagen no encontrada');
  if (image.user_id !== userId) throw new NotFoundError('Imagen no encontrada');

  return repo.updateImageCaption(imageId, caption);
};

export const deleteImage = async (userId, imageId) => {
  const image = await repo.getImageById(imageId);
  if (!image) throw new NotFoundError('Imagen no encontrada');
  if (image.user_id !== userId) throw new NotFoundError('Imagen no encontrada');

  const imagePath = await repo.deleteImage(imageId);
  if (imagePath) {
    await deleteFileIfExists(path.join(uploadsDir(), imagePath));
  }
};

export const reorderImages = async (userId, blockId, imageIds) => {
  const block = await repo.getBlockById(blockId);
  if (!block) throw new NotFoundError('Bloque no encontrado');
  if (block.user_id !== userId) throw new NotFoundError('Bloque no encontrado');

  const existing = await repo.getImagesByBlockId(blockId);
  const existingIds = new Set(existing.map((i) => i.id));
  for (const id of imageIds) {
    if (!existingIds.has(id)) {
      throw new ValidationError('Algunas imágenes no pertenecen a este bloque');
    }
  }

  await repo.reorderImages(blockId, imageIds);
};

// ============================================================
// TAGS
// ============================================================

export const getTags = async (userId) => {
  return repo.getTags(userId);
};

export const createTag = async (userId, { name, color }) => {
  const existing = await repo.getTagByName(userId, name);
  if (existing) throw new ValidationError('Ya existe un tag con ese nombre');
  return repo.createTag(userId, { name, color });
};

export const updateTag = async (userId, tagId, data) => {
  const tag = await repo.getTagById(userId, tagId);
  if (!tag) throw new NotFoundError('Tag no encontrado');

  if (data.name) {
    const existing = await repo.getTagByName(userId, data.name);
    if (existing && existing.id !== tagId) {
      throw new ValidationError('Ya existe un tag con ese nombre');
    }
  }

  return repo.updateTag(userId, tagId, data);
};

export const deleteTag = async (userId, tagId) => {
  const tag = await repo.getTagById(userId, tagId);
  if (!tag) throw new NotFoundError('Tag no encontrado');
  await repo.deleteTag(userId, tagId);
};

export const assignTags = async (userId, noteId, tagIds) => {
  const note = await repo.getById(userId, noteId);
  if (!note) throw new NotFoundError('Nota no encontrada');

  if (tagIds.length > 0) {
    const foundTags = await repo.getTagsByIds(userId, tagIds);
    if (foundTags.length !== tagIds.length) {
      throw new ValidationError('Algunos tags no existen o no te pertenecen');
    }
  }

  await repo.assignTags(noteId, tagIds);
};

export const removeTags = async (userId, noteId, tagIds) => {
  const note = await repo.getById(userId, noteId);
  if (!note) throw new NotFoundError('Nota no encontrada');
  await repo.removeTags(noteId, tagIds);
};

// ============================================================
// EXPORTACIÓN
// ============================================================

const buildNoteTree = (notes, blocksMap, parentId = null) => {
  return notes
    .filter((n) => n.parent_note_id === parentId)
    .map((n) => ({
      id: n.id,
      title: n.title,
      tags: n.tag_names || [],
      created_at: n.created_at,
      blocks: (blocksMap[n.id] || []).map((b) => {
        if (b.block_type === 'text') {
          return { type: 'text', content: b.content };
        }
        if (b.block_type === 'callout') {
          return { type: 'callout', content: b.content, metadata: b.metadata || {} };
        }
        if (b.block_type === 'image_gallery') {
          return { type: 'image_gallery', images: b.images || [] };
        }
        return { type: 'note_link', linked_note_title: b.linked_note_title };
      }),
      children: buildNoteTree(notes, blocksMap, n.id),
    }));
};

const renderMarkdownTree = (notes, blocksMap, parentId = null, depth = 1) => {
  const heading = '#'.repeat(Math.min(depth, 6));
  const lines = [];

  const children = notes.filter((n) => n.parent_note_id === parentId);
  for (const note of children) {
    lines.push(`${heading} ${note.title}`);
    if (note.tag_names && note.tag_names.length > 0) {
      lines.push(`> Tags: ${note.tag_names.join(', ')}`);
    }
    lines.push('');

    for (const block of blocksMap[note.id] || []) {
      if (block.block_type === 'text' && block.content) {
        lines.push(block.content);
        lines.push('');
      } else if (block.block_type === 'callout' && block.content) {
        const meta = block.metadata || {};
        const LABELS = { info: 'Información', warning: 'Advertencia', success: 'Éxito', error: 'Error', note: 'Nota' };
        const label = LABELS[meta.style] || 'Nota';
        const prefix = meta.icon ? `${meta.icon} ${label}` : label;
        lines.push(`> **${prefix}**`);
        for (const line of block.content.split('\n')) {
          lines.push(`> ${line}`);
        }
        lines.push('');
      } else if (block.block_type === 'image_gallery') {
        for (const img of block.images || []) {
          lines.push(`![${img.caption || ''}](${img.filename})`);
        }
        lines.push('');
      } else if (block.block_type === 'note_link') {
        lines.push(`→ Sub-nota: ${block.linked_note_title || 'Nota eliminada'}`);
        lines.push('');
      }
    }

    const childContent = renderMarkdownTree(notes, blocksMap, note.id, depth + 1);
    if (childContent) lines.push(childContent);
  }

  return lines.join('\n');
};

export const exportAsJSON = async (userId) => {
  const { notes, blocks, tags } = await repo.getFullTree(userId);

  const blocksMap = {};
  for (const block of blocks) {
    if (!blocksMap[block.note_id]) blocksMap[block.note_id] = [];
    blocksMap[block.note_id].push(block);
  }

  return {
    exported_at: new Date().toISOString(),
    version: '1.0',
    total_notes: notes.length,
    total_tags: tags.length,
    tags: tags.map((t) => ({ name: t.name, color: t.color })),
    notes: buildNoteTree(notes, blocksMap, null),
  };
};

export const exportAsMarkdown = async (userId) => {
  const { notes, blocks } = await repo.getFullTree(userId);

  const blocksMap = {};
  for (const block of blocks) {
    if (!blocksMap[block.note_id]) blocksMap[block.note_id] = [];
    blocksMap[block.note_id].push(block);
  }

  return renderMarkdownTree(notes, blocksMap, null, 1);
};

// ============================================================
// SEGUIMIENTO DE BLOQUES
// ============================================================

export const toggleFollowUp = async (blockId, userId, requiresFollowUp) => {
  const block = await repo.setFollowUp(blockId, userId, requiresFollowUp);
  if (!block) throw new NotFoundError('Bloque no encontrado');
  return block;
};

export const getReviewData = async (userId, recentHours = 24) => {
  const [pending, recent] = await Promise.all([
    repo.findPendingFollowUp(userId),
    repo.findRecentActivity(userId, recentHours),
  ]);
  return { pending, recent, recentHours };
};
