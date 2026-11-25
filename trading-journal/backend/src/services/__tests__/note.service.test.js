import { jest } from '@jest/globals';

/**
 * Test de la lógica de "Repaso" (revisit) del note.service con el repositorio
 * mockeado (sin BD). Espejo del enfoque de trade.service.test.js: en ESM hay que
 * registrar los mocks con `jest.unstable_mockModule` ANTES de importar el módulo.
 */

const mockNoteRepo = {
  setRevisit: jest.fn(),
  findMarkedForRevisit: jest.fn(),
  getBlockById: jest.fn(),
  findNoteByIdAndUser: jest.fn(),
  softDelete: jest.fn(),
  deleteBlock: jest.fn(),
  getTagByName: jest.fn(),
  getTagById: jest.fn(),
  createTag: jest.fn(),
  updateTag: jest.fn(),
  getTagsByIds: jest.fn(),
  assignTags: jest.fn(),
  findBlockByIdAndUser: jest.fn(),
  addBlockTag: jest.fn(),
  removeBlockTag: jest.fn(),
  getBlockTags: jest.fn(),
  createBlock: jest.fn(),
  copyNoteTagsToBlock: jest.fn(),
  applyNoteTagsToBlocks: jest.fn(),
  findBlocksByTags: jest.fn(),
  getBlockDetail: jest.fn(),
  getFullTree: jest.fn(),
  search: jest.fn(),
  getTagGroups: jest.fn(),
  getTagGroupById: jest.fn(),
  getTagGroupByName: jest.fn(),
  countTagGroups: jest.fn(),
  createTagGroup: jest.fn(),
  updateTagGroup: jest.fn(),
  deleteTagGroup: jest.fn(),
  reorderTagGroups: jest.fn(),
};

// Cliente ficticio de la transacción: withUserLock ejecuta el callback directo.
const mockClient = { query: jest.fn() };

// El service importa también el repo de trades; se mockea vacío para no arrastrar BD.
jest.unstable_mockModule('../../repositories/note.repository.js', () => mockNoteRepo);
jest.unstable_mockModule('../../repositories/trade.repository.js', () => ({}));
jest.unstable_mockModule('../../config/database.js', () => ({
  withUserLock: (_userId, fn) => fn(mockClient),
}));

const {
  toggleRevisit,
  getRevisitData,
  deleteBlock,
  createTag,
  updateTag,
  assignTags,
  addBlockTag,
  removeBlockTag,
  createBlock,
  applyNoteTagsToBlocks,
  getBlocksByTags,
  getBlock,
  buildSearchQuery,
  search,
  exportAsJSON,
  exportAsMarkdown,
  createTagGroup,
  updateTagGroup,
  deleteTagGroup,
  reorderTagGroups,
} = await import('../note.service.js');
const { NotFoundError, ValidationError, ConflictError } = await import('../../middleware/errorHandler.js');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('note.service — repaso', () => {
  describe('toggleRevisit', () => {
    it('marca un bloque para repaso y devuelve el bloque', async () => {
      const block = { id: 10, note_id: 3, marked_for_revisit: true };
      mockNoteRepo.setRevisit.mockResolvedValue(block);

      const result = await toggleRevisit(10, 1, true);

      expect(result).toBe(block);
      expect(mockNoteRepo.setRevisit).toHaveBeenCalledWith(10, 1, true);
    });

    it('lanza NotFoundError si el bloque no existe o no pertenece al usuario', async () => {
      mockNoteRepo.setRevisit.mockResolvedValue(null);

      await expect(toggleRevisit(999, 1, true)).rejects.toBeInstanceOf(NotFoundError);
      await expect(toggleRevisit(999, 1, true)).rejects.toThrow(/Bloque no encontrado/i);
    });
  });

  describe('getRevisitData', () => {
    it('devuelve los bloques marcados y pendingHours (null por defecto)', async () => {
      const blocks = [{ id: 1 }, { id: 2 }];
      mockNoteRepo.findMarkedForRevisit.mockResolvedValue(blocks);

      const result = await getRevisitData(1);

      expect(result).toEqual({ blocks, pendingHours: null });
      expect(mockNoteRepo.findMarkedForRevisit).toHaveBeenCalledWith(1, null);
    });

    it('propaga pendingHours al repositorio', async () => {
      mockNoteRepo.findMarkedForRevisit.mockResolvedValue([]);

      const result = await getRevisitData(1, 168);

      expect(result).toEqual({ blocks: [], pendingHours: 168 });
      expect(mockNoteRepo.findMarkedForRevisit).toHaveBeenCalledWith(1, 168);
    });
  });
});

describe('note.service — deleteBlock', () => {
  it('borrar el bloque de una sub-nota borra también la sub-nota y su subtree', async () => {
    mockNoteRepo.getBlockById.mockResolvedValue({
      id: 5, note_id: 10, user_id: 1, block_type: 'reference', linked_note_id: 20,
    });
    mockNoteRepo.findNoteByIdAndUser.mockResolvedValue({ id: 20, parent_note_id: 10 });
    mockNoteRepo.softDelete.mockResolvedValue([20, 21]);
    mockNoteRepo.deleteBlock.mockResolvedValue([]);

    const result = await deleteBlock(1, 5);

    expect(result).toEqual({ deleted_note_ids: [20, 21] });
    expect(mockNoteRepo.softDelete).toHaveBeenCalledWith(1, 20, mockClient);
    expect(mockNoteRepo.deleteBlock).toHaveBeenCalledWith(5, mockClient);
  });

  it('un enlace a una nota que no es hija de la nota del bloque solo borra el bloque', async () => {
    mockNoteRepo.getBlockById.mockResolvedValue({
      id: 5, note_id: 10, user_id: 1, block_type: 'reference', linked_note_id: 20,
    });
    mockNoteRepo.findNoteByIdAndUser.mockResolvedValue({ id: 20, parent_note_id: 99 });
    mockNoteRepo.deleteBlock.mockResolvedValue([]);

    const result = await deleteBlock(1, 5);

    expect(result).toEqual({ deleted_note_ids: [] });
    expect(mockNoteRepo.softDelete).not.toHaveBeenCalled();
    expect(mockNoteRepo.deleteBlock).toHaveBeenCalledWith(5, mockClient);
  });

  it('un bloque que no es reference no consulta notas enlazadas', async () => {
    mockNoteRepo.getBlockById.mockResolvedValue({ id: 6, note_id: 10, user_id: 1, block_type: 'text' });
    mockNoteRepo.deleteBlock.mockResolvedValue([]);

    const result = await deleteBlock(1, 6);

    expect(result).toEqual({ deleted_note_ids: [] });
    expect(mockNoteRepo.findNoteByIdAndUser).not.toHaveBeenCalled();
    expect(mockNoteRepo.softDelete).not.toHaveBeenCalled();
  });

  it('lanza NotFoundError si el bloque es de otro usuario y no borra nada', async () => {
    mockNoteRepo.getBlockById.mockResolvedValue({
      id: 5, note_id: 10, user_id: 2, block_type: 'reference', linked_note_id: 20,
    });

    await expect(deleteBlock(1, 5)).rejects.toBeInstanceOf(NotFoundError);
    expect(mockNoteRepo.softDelete).not.toHaveBeenCalled();
    expect(mockNoteRepo.deleteBlock).not.toHaveBeenCalled();
  });
});

describe('note.service — colisión de nombres de tag (C3)', () => {
  it('createTag traduce el 23505 del índice único a ValidationError', async () => {
    mockNoteRepo.getTagByName.mockResolvedValue(null);
    mockNoteRepo.createTag.mockRejectedValue({ code: '23505' });

    const promise = createTag(1, { name: 'NQ' });
    await expect(promise).rejects.toBeInstanceOf(ValidationError);
    await expect(promise).rejects.toThrow('Ya existe un tag con ese nombre');
  });

  it('createTag propaga cualquier otro error', async () => {
    const dbError = Object.assign(new Error('conexión perdida'), { code: '08006' });
    mockNoteRepo.getTagByName.mockResolvedValue(null);
    mockNoteRepo.createTag.mockRejectedValue(dbError);

    await expect(createTag(1, { name: 'NQ' })).rejects.toBe(dbError);
  });

  it('createTag pasa group_id al repositorio tras comprobar que el grupo es del usuario', async () => {
    mockNoteRepo.getTagByName.mockResolvedValue(null);
    mockNoteRepo.getTagGroupById.mockResolvedValue({ id: 7, name: 'Activo' });
    mockNoteRepo.createTag.mockResolvedValue({ id: 3 });

    await createTag(1, { name: 'NQ', color: '#3B82F6', group_id: 7 });

    expect(mockNoteRepo.getTagGroupById).toHaveBeenCalledWith(1, 7);
    expect(mockNoteRepo.createTag).toHaveBeenCalledWith(1, { name: 'NQ', color: '#3B82F6', group_id: 7 });
  });

  it('createTag en Libre (group_id null o ausente) no busca grupo', async () => {
    mockNoteRepo.getTagByName.mockResolvedValue(null);
    mockNoteRepo.createTag.mockResolvedValue({ id: 3 });

    await createTag(1, { name: 'NQ', group_id: null });
    await createTag(1, { name: 'ES' });

    expect(mockNoteRepo.getTagGroupById).not.toHaveBeenCalled();
    expect(mockNoteRepo.createTag).toHaveBeenCalledTimes(2);
  });

  it('createTag y updateTag con un grupo ajeno → 404 sin escribir', async () => {
    mockNoteRepo.getTagByName.mockResolvedValue(null);
    mockNoteRepo.getTagById.mockResolvedValue({ id: 3 });
    mockNoteRepo.getTagGroupById.mockResolvedValue(null);

    await expect(createTag(1, { name: 'NQ', group_id: 99 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateTag(1, 3, { group_id: 99 })).rejects.toThrow('Grupo no encontrado');
    expect(mockNoteRepo.createTag).not.toHaveBeenCalled();
    expect(mockNoteRepo.updateTag).not.toHaveBeenCalled();
  });

  it('updateTag a Libre (group_id null) no busca grupo', async () => {
    mockNoteRepo.getTagById.mockResolvedValue({ id: 3 });
    mockNoteRepo.updateTag.mockResolvedValue({ id: 3, group_id: null });

    await updateTag(1, 3, { group_id: null });

    expect(mockNoteRepo.getTagGroupById).not.toHaveBeenCalled();
    expect(mockNoteRepo.updateTag).toHaveBeenCalledWith(1, 3, { group_id: null });
  });

  it('updateTag traduce el 23505 a ValidationError y propaga el resto', async () => {
    mockNoteRepo.getTagById.mockResolvedValue({ id: 3 });
    mockNoteRepo.getTagByName.mockResolvedValue(null);
    mockNoteRepo.updateTag.mockRejectedValueOnce({ code: '23505' });
    await expect(updateTag(1, 3, { name: 'NQ' })).rejects.toThrow('Ya existe un tag con ese nombre');

    const dbError = new Error('otro');
    mockNoteRepo.updateTag.mockRejectedValueOnce(dbError);
    await expect(updateTag(1, 3, { name: 'NQ' })).rejects.toBe(dbError);
  });
});

describe('note.service — tags de bloque', () => {
  const tags = [{ id: 4, name: 'NQ', color: '#3B82F6', group_id: 1 }];

  it('addBlockTag: bloque inexistente o ajeno → 404', async () => {
    mockNoteRepo.findBlockByIdAndUser.mockResolvedValue(null);

    await expect(addBlockTag(1, 10, 4)).rejects.toThrow('Bloque no encontrado');
    expect(mockNoteRepo.addBlockTag).not.toHaveBeenCalled();
  });

  it('addBlockTag: bloque de referencia → 400', async () => {
    mockNoteRepo.findBlockByIdAndUser.mockResolvedValue({ id: 10, block_type: 'reference' });

    const promise = addBlockTag(1, 10, 4);
    await expect(promise).rejects.toBeInstanceOf(ValidationError);
    await expect(promise).rejects.toThrow('Los bloques de referencia no llevan tags');
  });

  it('addBlockTag: tag ajeno → 404', async () => {
    mockNoteRepo.findBlockByIdAndUser.mockResolvedValue({ id: 10, block_type: 'text' });
    mockNoteRepo.getTagById.mockResolvedValue(null);

    const promise = addBlockTag(1, 10, 99);
    await expect(promise).rejects.toBeInstanceOf(NotFoundError);
    await expect(promise).rejects.toThrow('Tag no encontrado');
    expect(mockNoteRepo.addBlockTag).not.toHaveBeenCalled();
  });

  it('addBlockTag devuelve { block_id, tags } con la lista actual', async () => {
    mockNoteRepo.findBlockByIdAndUser.mockResolvedValue({ id: 10, block_type: 'text' });
    mockNoteRepo.getTagById.mockResolvedValue({ id: 4 });
    mockNoteRepo.getBlockTags.mockResolvedValue(new Map([[10, tags]]));

    const result = await addBlockTag(1, 10, 4);

    expect(mockNoteRepo.addBlockTag).toHaveBeenCalledWith(10, 4, 1);
    expect(result).toEqual({ block_id: 10, tags });
  });

  it('removeBlockTag: referencia → 400', async () => {
    mockNoteRepo.findBlockByIdAndUser.mockResolvedValue({ id: 10, block_type: 'reference' });

    await expect(removeBlockTag(1, 10, 4)).rejects.toBeInstanceOf(ValidationError);
    expect(mockNoteRepo.removeBlockTag).not.toHaveBeenCalled();
  });

  it('removeBlockTag no comprueba el tag y devuelve [] si el bloque queda sin tags', async () => {
    mockNoteRepo.findBlockByIdAndUser.mockResolvedValue({ id: 10, block_type: 'image_gallery' });
    mockNoteRepo.getBlockTags.mockResolvedValue(new Map());

    const result = await removeBlockTag(1, 10, 4);

    expect(mockNoteRepo.getTagById).not.toHaveBeenCalled();
    expect(mockNoteRepo.removeBlockTag).toHaveBeenCalledWith(10, 4, 1);
    expect(result).toEqual({ block_id: 10, tags: [] });
  });

  it('createBlock copia los tags de la nota con el client del lock', async () => {
    mockNoteRepo.findNoteByIdAndUser.mockResolvedValue({ id: 3, type: 'note' });
    mockNoteRepo.createBlock.mockResolvedValue({ id: 10, note_id: 3, block_type: 'text' });
    mockNoteRepo.getBlockTags.mockResolvedValue(new Map([[10, tags]]));

    const result = await createBlock(1, 3, { block_type: 'text' });

    expect(mockNoteRepo.createBlock).toHaveBeenCalledWith(3, { block_type: 'text' }, mockClient);
    expect(mockNoteRepo.copyNoteTagsToBlock).toHaveBeenCalledWith(10, 3, 1, mockClient);
    expect(mockNoteRepo.getBlockTags).toHaveBeenCalledWith([10], 1, mockClient);
    expect(result).toEqual({ id: 10, note_id: 3, block_type: 'text', tags });
  });

  it('createBlock no copia tags a una referencia', async () => {
    mockNoteRepo.findNoteByIdAndUser.mockResolvedValue({ id: 3, type: 'note' });
    mockNoteRepo.createBlock.mockResolvedValue({ id: 11, note_id: 3, block_type: 'reference' });

    const result = await createBlock(1, 3, { block_type: 'reference', metadata: {} });

    expect(mockNoteRepo.copyNoteTagsToBlock).not.toHaveBeenCalled();
    expect(result.tags).toEqual([]);
  });

  it('applyNoteTagsToBlocks: nota ajena → 404', async () => {
    mockNoteRepo.findNoteByIdAndUser.mockResolvedValue(null);

    await expect(applyNoteTagsToBlocks(1, 3)).rejects.toBeInstanceOf(NotFoundError);
    expect(mockNoteRepo.applyNoteTagsToBlocks).not.toHaveBeenCalled();
  });

  it('applyNoteTagsToBlocks cuenta bloques distintos y asignaciones', async () => {
    mockNoteRepo.findNoteByIdAndUser.mockResolvedValue({ id: 3, type: 'note' });
    mockNoteRepo.applyNoteTagsToBlocks.mockResolvedValue([5, 5, 6]);

    const result = await applyNoteTagsToBlocks(1, 3);

    expect(result).toEqual({ blocks_updated: 2, assignments_created: 3 });
  });

  it('assignTags con ids repetidos no falla y asigna sin duplicados', async () => {
    mockNoteRepo.findNoteByIdAndUser.mockResolvedValue({ id: 3, type: 'note' });
    mockNoteRepo.getTagsByIds.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    await assignTags(1, 3, [1, 1, 2]);

    expect(mockNoteRepo.getTagsByIds).toHaveBeenCalledWith(1, [1, 2]);
    expect(mockNoteRepo.assignTags).toHaveBeenCalledWith(3, [1, 2]);
  });
});

describe('note.service — repaso por tag', () => {
  it('deduplica los ids antes de comprobarlos', async () => {
    mockNoteRepo.getTagsByIds.mockResolvedValue([
      { id: 1, group_id: 1 },
      { id: 4, group_id: 2 },
    ]);
    mockNoteRepo.findBlocksByTags.mockResolvedValue([]);

    await getBlocksByTags(1, [1, 1, 4]);

    expect(mockNoteRepo.getTagsByIds).toHaveBeenCalledWith(1, [1, 4]);
  });

  it('más de 50 tags → ValidationError', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => i + 1);

    await expect(getBlocksByTags(1, ids)).rejects.toBeInstanceOf(ValidationError);
    expect(mockNoteRepo.getTagsByIds).not.toHaveBeenCalled();
  });

  it('un tag ajeno o borrado → ValidationError', async () => {
    mockNoteRepo.getTagsByIds.mockResolvedValue([{ id: 1, group_id: 1 }]);

    const promise = getBlocksByTags(1, [1, 99]);
    await expect(promise).rejects.toBeInstanceOf(ValidationError);
    await expect(promise).rejects.toThrow('Algunos tags no existen o no te pertenecen');
  });

  it('group_count cuenta grupos distintos (dos de tipo y uno de activo → 2)', async () => {
    mockNoteRepo.getTagsByIds.mockResolvedValue([
      { id: 1, group_id: 1 },
      { id: 4, group_id: 2 },
      { id: 7, group_id: 2 },
    ]);
    mockNoteRepo.findBlocksByTags.mockResolvedValue([]);

    const result = await getBlocksByTags(1, [1, 4, 7]);

    expect(mockNoteRepo.findBlocksByTags).toHaveBeenCalledWith(1, [1, 4, 7], 2, 500);
    expect(result).toEqual({ items: [], total: 0, truncated: false });
  });

  it('group_count: Libre (group_id null) cuenta como un grupo más', async () => {
    mockNoteRepo.getTagsByIds.mockResolvedValue([
      { id: 1, group_id: 1 },
      { id: 8, group_id: null },
      { id: 9, group_id: null },
    ]);
    mockNoteRepo.findBlocksByTags.mockResolvedValue([]);

    await getBlocksByTags(1, [1, 8, 9]);

    expect(mockNoteRepo.findBlocksByTags).toHaveBeenCalledWith(1, [1, 8, 9], 2, 500);
  });

  it('truncated cuando el total supera los items devueltos', async () => {
    mockNoteRepo.getTagsByIds.mockResolvedValue([{ id: 1, group_id: 1 }]);
    mockNoteRepo.findBlocksByTags.mockResolvedValue([
      { block_id: 9, total: 812 },
      { block_id: 8, total: 812 },
    ]);

    const result = await getBlocksByTags(1, [1]);

    expect(result).toEqual({ items: [{ block_id: 9 }, { block_id: 8 }], total: 812, truncated: true });
  });

  it('getBlock: bloque ajeno o de nota borrada → 404', async () => {
    mockNoteRepo.getBlockDetail.mockResolvedValue(null);

    await expect(getBlock(1, 10)).rejects.toThrow('Bloque no encontrado');
  });
});

describe('note.service — buildSearchQuery', () => {
  it('una palabra a medio escribir → prefijo', () => {
    expect(buildSearchQuery('proyec')).toEqual({ text: 'proyec:*', mode: 'prefix' });
  });

  it('varias palabras → AND y prefijo solo en la última', () => {
    expect(buildSearchQuery('nq proyec')).toEqual({ text: 'nq & proyec:*', mode: 'prefix' });
  });

  it('comillas, `or` como palabra o `-` al inicio → websearch tal cual', () => {
    expect(buildSearchQuery('"trade perdido"')).toEqual({ text: '"trade perdido"', mode: 'websearch' });
    expect(buildSearchQuery('nq -btc')).toEqual({ text: 'nq -btc', mode: 'websearch' });
    expect(buildSearchQuery('nq OR es')).toEqual({ text: 'nq OR es', mode: 'websearch' });
  });

  it('`or` dentro de una palabra o `-` en medio no son websearch', () => {
    expect(buildSearchQuery('oro')).toEqual({ text: 'oro:*', mode: 'prefix' });
    expect(buildSearchQuery('stop-loss')).toEqual({ text: 'stop & loss:*', mode: 'prefix' });
  });

  it('descarta la sintaxis de to_tsquery: solo tokens limpios', () => {
    expect(buildSearchQuery('c++ (test):')).toEqual({ text: 'c & test:*', mode: 'prefix' });
    expect(buildSearchQuery('a & !b | c')).toEqual({ text: 'a & b & c:*', mode: 'prefix' });
  });

  it('conserva letras con tilde y ñ', () => {
    expect(buildSearchQuery('proyección niño')).toEqual({ text: 'proyección & niño:*', mode: 'prefix' });
  });

  it('sin palabras → sin texto', () => {
    expect(buildSearchQuery('???')).toBeNull();
    expect(buildSearchQuery('  ')).toBeNull();
    expect(buildSearchQuery(undefined)).toBeNull();
    expect(buildSearchQuery('"')).toBeNull();
  });
});

describe('note.service — search', () => {
  const EMPTY = { notes: [], total_notes: 0, total_blocks: 0, truncated: false };

  it('sin texto ni tags → ValidationError', async () => {
    await expect(search(1, { limit: 30 })).rejects.toBeInstanceOf(ValidationError);
    await expect(search(1, { q: '???', tagIds: [], limit: 30 })).rejects.toThrow('Escribe algo o elige un tag');
    expect(mockNoteRepo.search).not.toHaveBeenCalled();
  });

  it('solo texto: no consulta tags y pasa la query armada', async () => {
    mockNoteRepo.search.mockResolvedValue(EMPTY);

    await search(1, { q: 'nq proyec', limit: 30 });

    expect(mockNoteRepo.getTagsByIds).not.toHaveBeenCalled();
    expect(mockNoteRepo.search).toHaveBeenCalledWith(1, {
      query: { text: 'nq & proyec:*', mode: 'prefix' },
      tagIds: [],
      groupCount: 0,
      limit: 30,
      maxIds: 500,
      snippetsPerNote: 3,
    });
  });

  it('groupCount sale del helper compartido (dos de tipo y uno de activo → 2)', async () => {
    mockNoteRepo.getTagsByIds.mockResolvedValue([
      { id: 1, group_id: 1 },
      { id: 4, group_id: 2 },
      { id: 7, group_id: 2 },
    ]);
    mockNoteRepo.search.mockResolvedValue(EMPTY);

    await search(1, { q: '???', tagIds: [1, 4, 7, 4], limit: 10 });

    expect(mockNoteRepo.getTagsByIds).toHaveBeenCalledWith(1, [1, 4, 7]);
    expect(mockNoteRepo.search).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ query: null, tagIds: [1, 4, 7], groupCount: 2, limit: 10 })
    );
  });

  it('un tag ajeno → ValidationError, igual que el repaso por tag', async () => {
    mockNoteRepo.getTagsByIds.mockResolvedValue([]);

    await expect(search(1, { q: 'nq', tagIds: [99], limit: 30 })).rejects.toThrow(
      'Algunos tags no existen o no te pertenecen'
    );
    expect(mockNoteRepo.search).not.toHaveBeenCalled();
  });
});

describe('note.service — export con tags de bloque', () => {
  const tree = {
    notes: [{ id: 1, parent_note_id: null, title: 'Nota', tag_names: ['NQ'], created_at: '2026-11-01' }],
    blocks: [
      { id: 10, note_id: 1, block_type: 'text', content: 'Proyección', tag_names: ['NQ', 'proyección'] },
      { id: 11, note_id: 1, block_type: 'callout', content: 'Ojo', metadata: { style: 'warning' }, tag_names: ['NQ'] },
      { id: 12, note_id: 1, block_type: 'text', content: 'Sin tags', tag_names: [] },
      { id: 13, note_id: 1, block_type: 'reference', metadata: { label: 'Ref', target_block_id: 10 } },
    ],
    tags: [
      { id: 4, name: 'NQ', color: '#3B82F6', group_id: 1, group_name: 'Activo' },
      { id: 5, name: 'zeta', color: '#6B7280', group_id: null, group_name: null },
    ],
  };

  it('JSON: group (nombre o Libre) en el diccionario y tags en cada bloque, en el orden recibido', async () => {
    mockNoteRepo.getFullTree.mockResolvedValue(tree);

    const result = await exportAsJSON(1);

    expect(result.tags).toEqual([
      { name: 'NQ', color: '#3B82F6', group: 'Activo' },
      { name: 'zeta', color: '#6B7280', group: 'Libre' },
    ]);
    const blocks = result.notes[0].blocks;
    expect(blocks[0]).toEqual({ type: 'text', content: 'Proyección', tags: ['NQ', 'proyección'] });
    expect(blocks[2].tags).toEqual([]);
    expect(blocks[3]).toMatchObject({ type: 'reference', target_block_id: 10, tags: [] });
  });

  it('Markdown: línea de tags tras los bloques etiquetados, fuera del callout', async () => {
    mockNoteRepo.getFullTree.mockResolvedValue(tree);

    const md = await exportAsMarkdown(1);

    expect(md).toContain('Proyección\n\n> Tags: NQ, proyección\n');
    expect(md).toContain('> **Advertencia**\n> Ojo\n\n> Tags: NQ\n');
    expect(md).toContain('Sin tags\n\n→ Ref');
  });
});

describe('note.service — grupos de tags', () => {
  const group = { id: 7, name: 'Sesión', color: '#3B82F6', position: 4, tag_count: 0 };

  it('createTagGroup crea el grupo con nombre y color', async () => {
    mockNoteRepo.getTagGroupByName.mockResolvedValue(null);
    mockNoteRepo.countTagGroups.mockResolvedValue(4);
    mockNoteRepo.createTagGroup.mockResolvedValue(group);

    const result = await createTagGroup(1, { name: 'Sesión', color: '#3B82F6' });

    expect(mockNoteRepo.createTagGroup).toHaveBeenCalledWith(1, { name: 'Sesión', color: '#3B82F6' });
    expect(result).toBe(group);
  });

  it('nombre repetido (sin mayúsculas) → ConflictError', async () => {
    mockNoteRepo.getTagGroupByName.mockResolvedValue({ id: 3, name: 'Sesión' });

    const promise = createTagGroup(1, { name: 'SESIÓN' });
    await expect(promise).rejects.toBeInstanceOf(ConflictError);
    await expect(promise).rejects.toThrow('Ya existe un grupo con ese nombre');
    expect(mockNoteRepo.createTagGroup).not.toHaveBeenCalled();
  });

  it('el 23505 de una creación simultánea también es ConflictError', async () => {
    mockNoteRepo.getTagGroupByName.mockResolvedValue(null);
    mockNoteRepo.countTagGroups.mockResolvedValue(0);
    mockNoteRepo.createTagGroup.mockRejectedValue({ code: '23505' });

    await expect(createTagGroup(1, { name: 'Sesión' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('"Libre" está reservado, al crear y al renombrar, sin distinguir mayúsculas', async () => {
    mockNoteRepo.getTagGroupById.mockResolvedValue(group);

    await expect(createTagGroup(1, { name: 'libre' })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateTagGroup(1, 7, { name: 'LIBRE' })).rejects.toThrow(
      '"Libre" es el grupo de los tags sin grupo'
    );
    expect(mockNoteRepo.createTagGroup).not.toHaveBeenCalled();
    expect(mockNoteRepo.updateTagGroup).not.toHaveBeenCalled();
  });

  it('tope de 20 grupos por usuario', async () => {
    mockNoteRepo.getTagGroupByName.mockResolvedValue(null);
    mockNoteRepo.countTagGroups.mockResolvedValue(20);

    const promise = createTagGroup(1, { name: 'Otro' });
    await expect(promise).rejects.toBeInstanceOf(ValidationError);
    await expect(promise).rejects.toThrow('Se pueden tener como máximo 20 grupos');
    expect(mockNoteRepo.createTagGroup).not.toHaveBeenCalled();
  });

  it('grupo ajeno o inexistente → NotFoundError al renombrar y al borrar', async () => {
    mockNoteRepo.getTagGroupById.mockResolvedValue(null);

    await expect(updateTagGroup(1, 99, { color: '#000000' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteTagGroup(1, 99)).rejects.toThrow('Grupo no encontrado');
    expect(mockNoteRepo.updateTagGroup).not.toHaveBeenCalled();
    expect(mockNoteRepo.deleteTagGroup).not.toHaveBeenCalled();
  });

  it('un id que no es entero (NaN de la URL) → NotFoundError sin consultar', async () => {
    await expect(deleteTagGroup(1, NaN)).rejects.toBeInstanceOf(NotFoundError);
    expect(mockNoteRepo.getTagGroupById).not.toHaveBeenCalled();
  });

  it('renombrar con su propio nombre (otra capitalización) no es conflicto', async () => {
    mockNoteRepo.getTagGroupById.mockResolvedValue(group);
    mockNoteRepo.getTagGroupByName.mockResolvedValue({ id: 7, name: 'Sesión' });
    mockNoteRepo.updateTagGroup.mockResolvedValue({ ...group, name: 'sesión' });

    await updateTagGroup(1, 7, { name: 'sesión' });

    expect(mockNoteRepo.updateTagGroup).toHaveBeenCalledWith(1, 7, { name: 'sesión' });
  });

  it('renombrar con el nombre de otro grupo → ConflictError', async () => {
    mockNoteRepo.getTagGroupById.mockResolvedValue(group);
    mockNoteRepo.getTagGroupByName.mockResolvedValue({ id: 3, name: 'Tipo' });

    await expect(updateTagGroup(1, 7, { name: 'tipo' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('recolorear no comprueba el nombre', async () => {
    mockNoteRepo.getTagGroupById.mockResolvedValue(group);
    mockNoteRepo.updateTagGroup.mockResolvedValue({ ...group, color: '#000000' });

    await updateTagGroup(1, 7, { color: '#000000' });

    expect(mockNoteRepo.getTagGroupByName).not.toHaveBeenCalled();
  });

  it('borrar un grupo devuelve cuántos tags pasaron a Libre', async () => {
    mockNoteRepo.getTagGroupById.mockResolvedValue({ ...group, tag_count: 3 });
    mockNoteRepo.deleteTagGroup.mockResolvedValue({ id: 7, moved_tags: 3 });

    const result = await deleteTagGroup(1, 7);

    expect(mockNoteRepo.deleteTagGroup).toHaveBeenCalledWith(1, 7);
    expect(result).toEqual({ id: 7, moved_tags: 3 });
  });

  describe('reorderTagGroups', () => {
    const own = [{ id: 1 }, { id: 2 }, { id: 3 }];

    it('acepta exactamente los grupos del usuario y devuelve la lista nueva', async () => {
      const reordered = [{ id: 3 }, { id: 1 }, { id: 2 }];
      mockNoteRepo.getTagGroups.mockResolvedValueOnce(own).mockResolvedValueOnce(reordered);

      const result = await reorderTagGroups(1, [3, 1, 2]);

      expect(mockNoteRepo.reorderTagGroups).toHaveBeenCalledWith(1, [3, 1, 2]);
      expect(result).toBe(reordered);
    });

    it.each([
      ['de menos', [3, 1]],
      ['de más (ajeno)', [3, 1, 2, 9]],
      ['repetidos', [3, 1, 1]],
      ['uno cambiado', [3, 1, 9]],
    ])('ids %s → ValidationError sin escribir', async (_label, ids) => {
      mockNoteRepo.getTagGroups.mockResolvedValue(own);

      await expect(reorderTagGroups(1, ids)).rejects.toBeInstanceOf(ValidationError);
      expect(mockNoteRepo.reorderTagGroups).not.toHaveBeenCalled();
    });
  });
});
