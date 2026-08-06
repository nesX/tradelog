import path from 'path';
import { generateKeyBetween } from 'fractional-indexing';
import { config } from '../config/env.js';
import { withUserLock } from '../config/database.js';
import { NotFoundError, ValidationError, ConflictError } from '../middleware/errorHandler.js';
import { deleteFileIfExists } from '../utils/fileUtils.js';
import * as repo from '../repositories/note.repository.js';
import * as tradeRepo from '../repositories/trade.repository.js';

const uploadsDir = () => path.resolve(config.upload.dir);

// Tope de anidamiento del árbol de notas. Evita jerarquías absurdamente profundas
// que degradan el render recursivo del export y la UI. (Los CTEs recursivos ya
// tienen su propio cap de profundidad como guard anti-ciclos, ver repo.)
const MAX_NOTE_DEPTH = 10;

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

export const createNote = async (userId, { title, parent_note_id, type = 'note' }) => {
  if (type === 'section') {
    if (parent_note_id) throw new ValidationError('Las secciones solo pueden crearse a nivel raíz');
    if (!title || title.trim() === '') throw new ValidationError('La sección debe tener un nombre');
  }

  if (parent_note_id) {
    const parent = await repo.getById(userId, parent_note_id);
    if (!parent) throw new NotFoundError('Nota padre no encontrada');
    if (parent.type === 'section') throw new ValidationError('Una nota no puede tener una sección como padre');
    const parentDepth = await repo.getNoteDepth(parent_note_id);
    if (parentDepth >= MAX_NOTE_DEPTH) {
      throw new ValidationError(`No se puede anidar más de ${MAX_NOTE_DEPTH} niveles de notas`);
    }
  }

  // Bajo advisory lock: el cálculo de posición (leer última + generateKeyBetween)
  // y el INSERT son atómicos, evitando claves fractional duplicadas entre pestañas.
  return withUserLock(userId, (client) =>
    repo.create(userId, { title, parent_note_id: parent_note_id || null, type }, client)
  );
};

export const updateNoteTitle = async (userId, noteId, title) => {
  const note = await repo.updateTitle(userId, noteId, title);
  if (!note) throw new NotFoundError('Nota no encontrada');
  return note;
};

export const deleteNote = async (userId, noteId) => {
  const note = await repo.getById(userId, noteId);
  if (!note) throw new NotFoundError('Nota no encontrada');

  // Política unificada: soft-delete recuperable. Los archivos de imagen NO se tocan
  // aquí (ni para notas ni para secciones); la purga diferida (`purgeDeletedNotes`)
  // los elimina recién cuando la nota supera la gracia de config.notePurge.days.
  // Así, restaurar dentro del plazo conserva las imágenes intactas y no quedan
  // archivos <24h filtrados para siempre como pasaba antes.
  await repo.softDelete(userId, noteId);
};

/**
 * Restaura una nota soft-deleted y su subtree (undo del borrado). Solo revierte las
 * filas que cayeron en el MISMO borrado (mismo deleted_at que la raíz); un
 * descendiente borrado en un evento anterior permanece borrado. Si el padre de la
 * nota restaurada sigue borrado, la nota se recoloca como raíz (parent_note_id =
 * NULL) para no quedar huérfana invisible — caso raro, solo posible restaurando vía
 * API fuera de la ventana del toast de undo.
 */
export const restoreNote = async (userId, noteId) => {
  const note = await repo.getDeletedById(userId, noteId);
  if (!note) throw new NotFoundError('Nota no encontrada');
  if (!note.deleted_at) throw new ValidationError('La nota no está eliminada');

  return withUserLock(userId, async (client) => {
    const restoredIds = await repo.restoreSubtree(userId, noteId, note.deleted_at, client);
    if (restoredIds.length === 0) throw new NotFoundError('Nota no encontrada');

    // Si el padre sigue borrado (o ya no existe), reubicar como nota raíz. `move`
    // recalcula la posición al final de las raíces, evitando colisiones de clave.
    if (note.parent_note_id) {
      const parent = await repo.findNoteByIdAndUser(note.parent_note_id, userId, client);
      if (!parent) {
        await repo.move(userId, noteId, null, client);
      }
    }

    return { id: noteId, restored: restoredIds.length };
  });
};

/**
 * Purga diferida: borra definitivamente las notas soft-deleted cuya gracia venció
 * (config.notePurge.days) junto con sus archivos de imagen en disco. El hard-delete
 * arrastra bloques, imágenes (filas), tags y sub-notas vía ON DELETE CASCADE.
 * Idempotente y seguro para correr periódicamente. Solo borra archivos de las notas
 * que efectivamente purga (sin barrido ciego de uploads/).
 */
export const purgeDeletedNotes = async () => {
  const noteIds = await repo.getPurgeableNoteIds(config.notePurge.days);
  if (noteIds.length === 0) return { purgedNotes: 0, deletedFiles: 0 };

  const imagePaths = await repo.getImagePathsByNoteIds(noteIds);
  const purgedNotes = await repo.hardDeleteNotes(noteIds);
  await deleteFiles(imagePaths);
  return { purgedNotes, deletedFiles: imagePaths.length };
};

export const moveNote = async (userId, noteId, newParentId) => {
  const note = await repo.getById(userId, noteId);
  if (!note) throw new NotFoundError('Nota no encontrada');

  if (note.type === 'section' && newParentId !== null && newParentId !== undefined) {
    throw new ValidationError('Las secciones no pueden anidarse');
  }

  return withUserLock(userId, async (client) => {
    if (newParentId !== null && newParentId !== undefined) {
      const parent = await repo.getById(userId, newParentId);
      if (!parent) throw new NotFoundError('Nota destino no encontrada');
      if (parent.type === 'section') throw new ValidationError('Una nota no puede tener una sección como padre');

      const isDesc = await repo.isDescendant(noteId, newParentId);
      if (isDesc) {
        throw new ValidationError('No puedes mover una nota dentro de sí misma o sus sub-notas');
      }
    }

    // `move` ahora recalcula la posición (al final del nuevo padre) en vez de
    // conservar la vieja, evitando colisiones de clave con los nuevos hermanos.
    const updated = await repo.move(userId, noteId, newParentId ?? null, client);
    if (!updated) throw new NotFoundError('Nota no encontrada');
    return updated;
  });
};

export const reorderNotes = async (userId, noteIds) => {
  return withUserLock(userId, async (client) => {
    const notes = await repo.getNotesByIds(userId, noteIds, client);

    if (notes.length !== noteIds.length) {
      throw new ValidationError('Algunas notas no existen o no te pertenecen');
    }

    const parentIds = new Set(notes.map((n) => n.parent_note_id));
    if (parentIds.size > 1) {
      throw new ValidationError('Todas las notas deben ser hermanas (mismo padre)');
    }

    // La lista debe incluir a TODOS los hermanos; un reorden parcial reasigna desde
    // 'a0' y colisiona con las posiciones de los omitidos.
    const siblingIds = await repo.getSiblingNoteIds(userId, notes[0].parent_note_id, client);
    if (siblingIds.length !== noteIds.length) {
      throw new ValidationError('El reordenamiento debe incluir a todas las notas hermanas');
    }

    await repo.reorderSiblings(userId, noteIds, client);
  });
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

  // Toda la operación (validación anti-ciclos + lectura de vecinos + UPDATE) corre
  // dentro de una transacción con advisory lock por usuario. Así dos moves
  // concurrentes ("A dentro de B" y "B dentro de A") no pueden crear un ciclo, ni
  // dos moves sobre los mismos hermanos generar claves fractional duplicadas.
  return withUserLock(userId, async (client) => {
    const [sourceNote, targetNote] = await Promise.all([
      repo.findNoteByIdAndUser(noteId, userId, client),
      repo.findNoteByIdAndUser(targetId, userId, client),
    ]);

    if (!sourceNote) throw new NotFoundError('Nota origen no encontrada');
    if (!targetNote) throw new NotFoundError('Nota destino no encontrada');

    // Evitar ciclos: el destino no puede ser descendiente del source
    const descendantIds = await repo.getDescendantIds(noteId, client);
    if (descendantIds.includes(targetId)) {
      throw new ValidationError('No puedes mover una nota dentro de uno de sus descendientes');
    }

    // Secciones solo pueden ser siblings a nivel raíz, nunca children
    if (sourceNote.type === 'section' && dropType === 'child') {
      throw new ValidationError('Las secciones no pueden anidarse');
    }
    // Notas no pueden ser hijas de una sección
    if (sourceNote.type === 'note' && dropType === 'child' && targetNote.type === 'section') {
      throw new ValidationError('Una nota no puede tener una sección como padre');
    }

    let newParentId;
    let newPosition;

    if (dropType === 'child') {
      // Anidar como hijo del target → al final de sus hijos
      newParentId = targetId;
      const lastChildPos = await repo.getLastChildPosition(targetId, client);
      newPosition = generateKeyBetween(lastChildPos, null);
    } else {
      // Sibling: mismo padre que el target
      newParentId = targetNote.parent_note_id;
      // Una sección solo puede vivir a nivel raíz: soltarla como sibling de una nota
      // anidada le daría un padre y violaría el CHECK `sections_only_at_root` (error
      // genérico 400). Rechazar con mensaje claro.
      if (sourceNote.type === 'section' && newParentId !== null) {
        throw new ValidationError('Las secciones solo pueden ubicarse a nivel raíz');
      }
      const side = dropType === 'sibling-above' ? 'above' : 'below';
      const { before, after } = await repo.getSiblingPositions(
        newParentId,
        userId,
        targetNote.position,
        side,
        noteId,
        client
      );
      newPosition = generateKeyBetween(before, after);
    }

    // Tope de profundidad del nuevo padre (guard best-effort; no contempla la altura
    // del subárbol movido, pero acota el crecimiento por operación).
    if (newParentId !== null) {
      const parentDepth = await repo.getNoteDepth(newParentId, client);
      if (parentDepth >= MAX_NOTE_DEPTH) {
        throw new ValidationError(`No se puede anidar más de ${MAX_NOTE_DEPTH} niveles de notas`);
      }
    }

    const updated = await repo.updateNoteParentAndPosition(noteId, newParentId, newPosition, userId, client);
    if (!updated) throw new NotFoundError('No se pudo mover la nota');
    return updated;
  });
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

  return withUserLock(userId, async (client) => {
    const [sourceBlock, targetBlock] = await Promise.all([
      repo.findBlockByIdAndUser(blockId, userId, client),
      repo.findBlockByIdAndUser(targetBlockId, userId, client),
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
      side,
      client
    );
    const newPosition = generateKeyBetween(before, after);

    const updated = await repo.updateBlockPosition(blockId, newPosition, userId, client);
    if (!updated) throw new NotFoundError('No se pudo mover el bloque');
    return updated;
  });
};

/**
 * Mueve un bloque a OTRA nota (V2 del guard de moveBlockDnd). El bloque se apenda
 * al final de la nota destino; sus imágenes/trades/flag de seguimiento viajan con
 * él (cuelgan de block_id). Todo bajo withUserLock: el cálculo de posición y el
 * UPDATE (más el reparent de sub-nota si aplica) son atómicos.
 *
 * Caso sub-nota: si el bloque es `reference` y su nota vinculada cuelga de la nota
 * origen, se reparenta también la sub-nota al destino para no desincronizar el
 * árbol del sidebar (antes el cliente lo hacía con 3 requests sin transacción).
 *
 * @param {Object} params
 * @param {number} params.blockId      - Bloque a mover
 * @param {number} params.targetNoteId - Nota destino
 * @param {number} params.userId
 */
export const moveBlockToNote = async ({ blockId, targetNoteId, userId }) => {
  return withUserLock(userId, async (client) => {
    const block = await repo.findBlockByIdAndUser(blockId, userId, client);
    if (!block) throw new NotFoundError('Bloque no encontrado');

    const targetNote = await repo.findNoteByIdAndUser(targetNoteId, userId, client);
    if (!targetNote) throw new NotFoundError('Nota destino no encontrada');
    if (targetNote.type === 'section') {
      throw new ValidationError('Las secciones no pueden contener bloques');
    }
    if (block.note_id === targetNoteId) {
      throw new ValidationError('El bloque ya está en esa nota');
    }

    if (block.block_type === 'reference' && block.linked_note_id) {
      const linked = await repo.findNoteByIdAndUser(block.linked_note_id, userId, client);
      // Solo es una sub-nota "real" si cuelga de la nota origen del bloque.
      if (linked && linked.parent_note_id === block.note_id) {
        if (linked.id === targetNoteId) {
          throw new ValidationError('No puedes mover una sub-nota dentro de sí misma');
        }
        const descendantIds = await repo.getDescendantIds(linked.id, client);
        if (descendantIds.includes(targetNoteId)) {
          throw new ValidationError('No puedes mover una sub-nota dentro de sus propias sub-notas');
        }
        await repo.move(userId, linked.id, targetNoteId, client);
      }
    }

    const lastPos = await repo.getLastBlockPosition(targetNoteId, client);
    const newPosition = generateKeyBetween(lastPos, null);
    const updated = await repo.updateBlockNoteAndPosition(blockId, targetNoteId, newPosition, client);
    if (!updated) throw new NotFoundError('No se pudo mover el bloque');

    return { block: updated, source_note_id: block.note_id };
  });
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
  if (note.type === 'section') throw new ValidationError('Las secciones no pueden tener bloques');

  // linked_note_id solo tiene sentido en bloques 'reference' (legacy); rechazarlo en
  // cualquier otro tipo y validar SIEMPRE ownership para evitar IDOR (leer títulos ajenos).
  if (data.linked_note_id != null) {
    if (data.block_type !== 'reference') {
      throw new ValidationError('linked_note_id solo es válido en bloques de tipo reference');
    }
    const linkedNote = await repo.getById(userId, data.linked_note_id);
    if (!linkedNote) throw new NotFoundError('Nota vinculada no encontrada');
  }

  await assertReferenceTargetsOwned(userId, data.metadata);

  // Bajo advisory lock: cálculo de posición + INSERT atómicos (sin claves duplicadas).
  return withUserLock(userId, (client) => repo.createBlock(noteId, data, client));
};

// Valida existencia + ownership de los targets de una referencia (esquema nuevo, migración 022).
// Evita referencias basura y fugas server-side. Lanza NotFoundError si el target es ajeno.
const assertReferenceTargetsOwned = async (userId, metadata) => {
  if (!metadata) return;
  const { target_note_id: targetNoteId, target_block_id: targetBlockId } = metadata;

  if (targetNoteId != null) {
    const targetNote = await repo.getById(userId, targetNoteId);
    if (!targetNote) throw new NotFoundError('Nota referenciada no encontrada');
  }
  if (targetBlockId != null) {
    const targetBlock = await repo.getBlockById(targetBlockId);
    if (!targetBlock || targetBlock.user_id !== userId) {
      throw new NotFoundError('Bloque referenciado no encontrado');
    }
  }
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
  if (!['callout', 'image_gallery', 'reference'].includes(block.block_type)) {
    throw new ValidationError('Solo se puede actualizar metadata de bloques callout, image_gallery o reference');
  }
  await assertReferenceTargetsOwned(userId, newMetadata);
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

  return withUserLock(userId, async (client) => {
    const existing = await repo.getBlocksByNoteId(noteId, client);
    const existingIds = new Set(existing.map((b) => b.id));
    for (const id of blockIds) {
      if (!existingIds.has(id)) {
        throw new ValidationError('Algunos bloques no pertenecen a esta nota');
      }
    }
    // La lista debe incluir a TODOS los bloques de la nota (reorden completo).
    if (existing.length !== blockIds.length) {
      throw new ValidationError('El reordenamiento debe incluir a todos los bloques de la nota');
    }

    await repo.reorderBlocks(noteId, blockIds, client);
  });
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
// TRADES DE BLOQUE (trade_reference)
// ============================================================

export const addTradeToBlock = async (userId, blockId, tradeId) => {
  const owner = await repo.getBlockOwner(blockId);
  if (!owner || owner.user_id !== userId) throw new NotFoundError('Bloque no encontrado');
  if (owner.block_type !== 'trade_reference') {
    throw new ValidationError('Solo se pueden añadir trades a bloques trade_reference');
  }
  const trade = await tradeRepo.findById(userId, tradeId);
  if (!trade) throw new NotFoundError('Trade no encontrado');
  const added = await repo.addTradeToBlock(blockId, tradeId);
  if (!added) throw new ConflictError('El trade ya está en este bloque');
  return added;
};

export const removeTradeFromBlock = async (userId, blockId, tradeId) => {
  const owner = await repo.getBlockOwner(blockId);
  if (!owner || owner.user_id !== userId) throw new NotFoundError('Bloque no encontrado');
  await repo.removeTradeFromBlock(blockId, tradeId);
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

// Agrupa las notas por parent_note_id una sola vez, evitando el filter O(n²) por
// nivel del recorrido recursivo del export.
const groupNotesByParent = (notes) => {
  const map = new Map();
  for (const n of notes) {
    const key = n.parent_note_id ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(n);
  }
  return map;
};

const buildNoteTree = (childrenByParent, blocksMap, parentId = null) => {
  return (childrenByParent.get(parentId ?? null) || [])
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
        if (b.block_type === 'trade_reference') {
          return { type: 'trade_reference', trades: b.trades || [] };
        }
        return {
          type: 'reference',
          label: b.linked_note_title || b.metadata?.label || 'Referencia',
          target_note_id: b.metadata?.target_note_id ?? b.linked_note_id ?? null,
          target_block_id: b.metadata?.target_block_id ?? null,
        };
      }),
      children: buildNoteTree(childrenByParent, blocksMap, n.id),
    }));
};

const renderMarkdownTree = (childrenByParent, blocksMap, parentId = null, depth = 1) => {
  const heading = '#'.repeat(Math.min(depth, 6));
  const lines = [];

  const children = childrenByParent.get(parentId ?? null) || [];
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
      } else if (block.block_type === 'reference') {
        const label = block.linked_note_title || block.metadata?.label || 'Referencia';
        lines.push(`→ ${label}`);
        lines.push('');
      } else if (block.block_type === 'trade_reference') {
        const trades = block.trades || [];
        if (trades.length > 0) {
          lines.push('**Trades referenciados:**');
          for (const t of trades) {
            if (t) lines.push(`- ${t.symbol} (#${t.id})`);
          }
          lines.push('');
        }
      }
    }

    const childContent = renderMarkdownTree(childrenByParent, blocksMap, note.id, depth + 1);
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
    notes: buildNoteTree(groupNotesByParent(notes), blocksMap, null),
  };
};

export const exportAsMarkdown = async (userId) => {
  const { notes, blocks } = await repo.getFullTree(userId);

  const blocksMap = {};
  for (const block of blocks) {
    if (!blocksMap[block.note_id]) blocksMap[block.note_id] = [];
    blocksMap[block.note_id].push(block);
  }

  return renderMarkdownTree(groupNotesByParent(notes), blocksMap, null, 1);
};

// ============================================================
// SEGUIMIENTO DE BLOQUES
// ============================================================

export const toggleFollowUp = async (blockId, userId, requiresFollowUp) => {
  const block = await repo.setFollowUp(blockId, userId, requiresFollowUp);
  if (!block) throw new NotFoundError('Bloque no encontrado');
  return block;
};

export const getReviewData = async (userId, recentHours = 24, pendingHours = null) => {
  const [pending, recent] = await Promise.all([
    repo.findPendingFollowUp(userId, pendingHours),
    repo.findRecentActivity(userId, recentHours),
  ]);
  return { pending, recent, recentHours, pendingHours };
};
