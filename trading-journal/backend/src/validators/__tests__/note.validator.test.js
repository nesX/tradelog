import {
  createNoteSchema,
  noteSearchSchema,
  assignTagsSchema,
  createBlockSchema,
} from '../note.validator.js';

describe('note.validator', () => {
  describe('createNoteSchema', () => {
    it('aplica title y type por defecto', () => {
      const { error, value } = createNoteSchema.validate({});
      expect(error).toBeUndefined();
      expect(value.title).toBe('Sin título');
      expect(value.type).toBe('note');
    });

    it('rechaza type=section con parent_note_id (regla custom)', () => {
      const { error } = createNoteSchema.validate({
        type: 'section',
        parent_note_id: 3,
      });
      expect(error).toBeDefined();
    });

    it('acepta una nota hija (note con parent_note_id)', () => {
      const { error, value } = createNoteSchema.validate({
        type: 'note',
        parent_note_id: 3,
      });
      expect(error).toBeUndefined();
      expect(value.parent_note_id).toBe(3);
    });
  });

  describe('noteSearchSchema', () => {
    it('aplica limit por defecto y acepta tag_ids CSV', () => {
      const { error, value } = noteSearchSchema.validate({ tag_ids: '4,5' });
      expect(error).toBeUndefined();
      expect(value.limit).toBe(30);
      expect(value.tag_ids).toBe('4,5');
    });

    it('rechaza tag_ids CSV inválido', () => {
      expect(noteSearchSchema.validate({ tag_ids: '4,,5' }).error).toBeDefined();
    });
  });

  describe('assignTagsSchema', () => {
    it('requiere tag_ids', () => {
      expect(assignTagsSchema.validate({}).error).toBeDefined();
    });

    it('acepta array vacío (required pero sin min)', () => {
      const { error } = assignTagsSchema.validate({ tag_ids: [] });
      expect(error).toBeUndefined();
    });
  });

  describe('createBlockSchema', () => {
    it('rechaza block_type no permitido', () => {
      expect(
        createBlockSchema.validate({ block_type: 'video' }).error,
      ).toBeDefined();
    });

    it('acepta un bloque de texto y da metadata default {}', () => {
      const { error, value } = createBlockSchema.validate({
        block_type: 'text',
        content: 'hola',
      });
      expect(error).toBeUndefined();
      expect(value.metadata).toEqual({});
    });
  });
});
