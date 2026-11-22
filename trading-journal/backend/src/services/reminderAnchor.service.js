import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import * as noteRepo from '../repositories/note.repository.js';

/**
 * Valida el anclaje de una alerta o un recordatorio: el bloque o la nota es del
 * usuario y no está borrado. Solo se anclan notas `type = 'note'` y sus bloques:
 * las `section` no tienen bloques y las `todo` son las notas ocultas de los
 * pendientes (el deep-link /notes/:id no les sirve).
 * @returns {Promise<{ block_id: number|null, note_id: number|null }>} exactamente uno
 */
export const resolveAnchor = async (userId, { block_id, note_id }, exec) => {
  let noteId = note_id;
  if (block_id) {
    const block = await noteRepo.findBlockByIdAndUser(block_id, userId, exec);
    if (!block) throw new NotFoundError('Bloque no encontrado');
    noteId = block.note_id;
  }
  const note = await noteRepo.findNoteByIdAndUser(noteId, userId, exec);
  if (!note) throw new NotFoundError('Nota no encontrada');
  if (note.type !== 'note') {
    throw new ValidationError('Solo se pueden anclar recordatorios a notas y a sus bloques');
  }
  return block_id ? { block_id, note_id: null } : { block_id: null, note_id: noteId };
};
