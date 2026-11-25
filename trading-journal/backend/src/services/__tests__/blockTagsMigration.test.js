import { jest } from '@jest/globals';
import {
  parseMapping,
  classifyReference,
  migrateBlockTags,
  rollbackBlockTags,
  MappingError,
} from '../blockTagsMigration.js';

/**
 * Lógica de la migración de notas-categoría a tags de bloque (task 041), con el
 * cliente de BD simulado: cada query se resuelve según su SQL.
 */

// Cliente que responde por patrón de SQL; `handlers` es [regex, (params) => rows].
const fakeClient = (handlers) => {
  const query = jest.fn(async (sql, params = []) => {
    for (const [pattern, handler] of handlers) {
      if (pattern.test(sql)) {
        const rows = handler(params) ?? [];
        return { rows, rowCount: rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  });
  return { query };
};

const executed = (client) => client.query.mock.calls.map(([sql]) => sql.trim().split(/\s+/).slice(0, 3).join(' '));

describe('blockTagsMigration — parseMapping', () => {
  it('normaliza el mapeo: Libre (null) y noteDefaults true por defecto', () => {
    const result = parseMapping({
      userId: 1,
      notes: [
        { noteId: 12, tags: [{ name: ' NQ ' }, { name: 'zeta', group: 'LIBRE' }, { name: 'ES', group: ' Activo ' }] },
      ],
    });

    expect(result).toEqual({
      userId: 1,
      notes: [
        {
          noteId: 12,
          tags: [
            { name: 'NQ', group: null },
            { name: 'zeta', group: null },
            { name: 'ES', group: 'Activo' },
          ],
          noteDefaults: true,
        },
      ],
    });
  });

  it('junta todos los problemas en un MappingError', () => {
    const bad = {
      userId: 0,
      notes: [
        { noteId: 12, tags: [{ name: '', group: 'tipo' }] },
        { noteId: 12, tags: [{ name: 'x'.repeat(101), group: 3 }], noteDefaults: 'sí' },
        { noteId: 'a', tags: [] },
      ],
    };

    let error;
    try {
      parseMapping(bad);
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(MappingError);
    expect(error.problems).toEqual(
      expect.arrayContaining([
        'userId tiene que ser un entero positivo',
        'notes[0].tags[0]: el nombre tiene que tener entre 1 y 100 caracteres',
        'notes[1]: la nota 12 está repetida en el mapeo',
        'notes[1]: noteDefaults tiene que ser true o false',
        'notes[1].tags[0]: el nombre tiene que tener entre 1 y 100 caracteres',
        'notes[1].tags[0]: group tiene que ser el nombre de un grupo',
        'notes[2]: noteId tiene que ser un entero positivo',
        'notes[2]: tags tiene que ser una lista con al menos un tag',
      ])
    );
  });
});

describe('blockTagsMigration — classifyReference', () => {
  const userId = 1;
  const toBlock = { metadata: { target_block_id: 5, target_note_id: 2 } };

  it('un bloque destino válido recibe los tags (redundante)', () => {
    expect(classifyReference(toBlock, { block_type: 'text', user_id: 1, deleted_at: null }, userId)).toBe('valido');
  });

  it('destino inexistente, ajeno o en la papelera → rota', () => {
    expect(classifyReference(toBlock, null, userId)).toBe('rota');
    expect(classifyReference(toBlock, { block_type: 'text', user_id: 2, deleted_at: null }, userId)).toBe('rota');
    expect(classifyReference(toBlock, { block_type: 'text', user_id: 1, deleted_at: '2026-11-01' }, userId)).toBe(
      'rota'
    );
  });

  it('destino que es otra referencia → rota con warning', () => {
    expect(classifyReference(toBlock, { block_type: 'reference', user_id: 1, deleted_at: null }, userId)).toBe(
      'rota_referencia'
    );
  });

  it('sin bloque destino: apunta a una nota (esquema nuevo o sub-nota) o está rota', () => {
    expect(classifyReference({ metadata: { target_note_id: 2 } }, null, userId)).toBe('apunta_a_nota');
    expect(classifyReference({ metadata: {}, linked_note_id: 3 }, null, userId)).toBe('apunta_a_nota');
    expect(classifyReference({ metadata: { label: 'Referencia' } }, null, userId)).toBe('rota');
  });
});

describe('blockTagsMigration — migrateBlockTags', () => {
  const mapping = {
    userId: 1,
    notes: [
      {
        noteId: 12,
        tags: [
          { name: 'proyección', group: 'tipo' },
          { name: 'NQ', group: 'Activo' },
          { name: 'scalping', group: 'estrategia' },
        ],
      },
    ],
  };

  // Grupos del usuario: Activo (1), Tipo (2), Estrategia (3).
  const groups = [
    { id: 1, name: 'Activo', color: '#3B82F6' },
    { id: 2, name: 'Tipo', color: '#F59E0B' },
    { id: 3, name: 'Estrategia', color: '#8B5CF6' },
  ];

  // proyección no existe; NQ existe en Libre; scalping existe en otro grupo.
  const scenario = () => {
    const existingTags = {
      nq: { id: 4, name: 'NQ', group_id: null },
      scalping: { id: 6, name: 'Scalping', group_id: 2 },
    };
    return fakeClient([
      [/FROM users/, () => [{ id: 1 }]],
      [/FROM note_tag_groups/, () => groups],
      [
        /FROM notes WHERE id = ANY/,
        () => [{ id: 12, user_id: 1, title: 'Proyecciones', type: 'note', deleted_at: null }],
      ],
      [
        /FROM note_tags WHERE user_id = \$1 AND LOWER/,
        ([, name]) => [existingTags[name.toLowerCase()]].filter(Boolean),
      ],
      [/INSERT INTO note_tags/, ([, name, , groupId]) => [{ id: 9, name, group_id: groupId }]],
      [
        /INSERT INTO note_tag_assignments/,
        ([noteId, tagIds]) => tagIds.map((tagId) => ({ note_id: noteId, tag_id: tagId })),
      ],
      [
        /block_type <> 'reference'/,
        ([, tagIds]) => [100, 101].flatMap((b) => tagIds.map((t) => ({ block_id: b, tag_id: t }))),
      ],
      [
        /block_type = 'reference'/,
        () => [
          { id: 200, metadata: { target_block_id: 300 } },
          { id: 201, metadata: { target_block_id: 999 } },
          { id: 202, metadata: { target_note_id: 7 } },
        ],
      ],
      [
        /FROM note_blocks b JOIN notes n/,
        ([id]) =>
          id === 300 ? [{ id: 300, block_type: 'text', user_id: 1, deleted_at: null, note_title: 'Análisis NQ' }] : [],
      ],
      [
        /unnest\(\$2::int\[\]\) AS t\(id\)\s+ON CONFLICT/,
        ([blockId, tagIds]) => tagIds.map((t) => ({ block_id: blockId, tag_id: t })),
      ],
      [/SELECT title FROM notes/, () => [{ title: 'Nota destino' }]],
    ]);
  };

  it('dry-run: resuelve tags, reporta lo insertado y termina en ROLLBACK', async () => {
    const client = scenario();

    const report = await migrateBlockTags(client, mapping);

    expect(report.mode).toBe('dry-run');
    expect(report.created_tags).toEqual([{ id: 9, name: 'proyección', group: 'Tipo' }]);
    expect(report.group_changes).toEqual([{ tag_id: 4, name: 'NQ', from: 'Libre', to: 'Activo' }]);
    expect(report.warnings).toEqual([
      'El tag "Scalping" ya está en el grupo "Tipo" y se respeta (el mapeo pide "Estrategia")',
    ]);
    expect(report.inserted_note_tags).toHaveLength(3);
    // 2 bloques × 3 tags en la fase A + 3 en el destino de la referencia válida
    expect(report.inserted_block_tags).toHaveLength(9);
    expect(report.notes[0]).toMatchObject({ note_id: 12, blocks_tagged: 2, assignments_created: 6, references: 3 });
    expect(report.references.map((r) => [r.reference_block_id, r.status])).toEqual([
      [200, 'redundante'],
      [201, 'rota'],
      [202, 'apunta_a_nota'],
    ]);
    expect(report.references[0]).toMatchObject({ target_note_title: 'Análisis NQ', assignments_created: 3 });

    const statements = executed(client);
    expect(statements[0]).toBe('BEGIN');
    expect(statements[1]).toBe('SELECT pg_advisory_xact_lock($1)');
    expect(statements.at(-1)).toBe('ROLLBACK');
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE note_tags SET group_id'), [1, 4, 1]);
    // El tag nuevo nace con el color de su grupo.
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO note_tags'), [
      1,
      'proyección',
      '#F59E0B',
      2,
    ]);
  });

  it('un grupo que el usuario no tiene es un error del mapeo y no toca nada', async () => {
    const client = scenario();

    const promise = migrateBlockTags(client, {
      userId: 1,
      notes: [
        {
          noteId: 12,
          tags: [
            { name: 'NQ', group: 'Activo' },
            { name: 'ganador', group: 'resultado' },
          ],
        },
      ],
    });

    await expect(promise).rejects.toBeInstanceOf(MappingError);
    await expect(promise).rejects.toThrow('notes[0].tags[1]: el grupo "resultado" no existe');
    const statements = executed(client);
    expect(statements.at(-1)).toBe('ROLLBACK');
    expect(statements.some((s) => s.startsWith('INSERT') || s.startsWith('UPDATE'))).toBe(false);
  });

  it('un tag nuevo en Libre nace con el color de Libre y sin grupo', async () => {
    const client = scenario();

    const report = await migrateBlockTags(client, { userId: 1, notes: [{ noteId: 12, tags: [{ name: 'nuevo' }] }] });

    expect(report.created_tags).toEqual([{ id: 9, name: 'nuevo', group: 'Libre' }]);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO note_tags'), [
      1,
      'nuevo',
      '#6B7280',
      null,
    ]);
  });

  it('--apply termina en COMMIT', async () => {
    const client = scenario();

    const report = await migrateBlockTags(client, mapping, { apply: true });

    expect(report.mode).toBe('apply');
    expect(executed(client).at(-1)).toBe('COMMIT');
  });

  it('noteDefaults: false no asigna los tags a la nota', async () => {
    const client = scenario();

    const report = await migrateBlockTags(client, {
      ...mapping,
      notes: [{ ...mapping.notes[0], noteDefaults: false }],
    });

    expect(report.inserted_note_tags).toEqual([]);
    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO note_tag_assignments'),
      expect.anything()
    );
  });

  it('una nota ajena, borrada o de otro tipo falla en la validación sin tocar nada', async () => {
    const client = fakeClient([
      [/FROM users/, () => [{ id: 1 }]],
      [
        /FROM notes WHERE id = ANY/,
        () => [
          { id: 12, user_id: 2, title: 'Ajena', type: 'note', deleted_at: null },
          { id: 13, user_id: 1, title: 'Borrada', type: 'note', deleted_at: '2026-11-01' },
          { id: 14, user_id: 1, title: 'Sección', type: 'section', deleted_at: null },
        ],
      ],
    ]);
    const tags = [{ name: 'NQ' }];

    const promise = migrateBlockTags(
      client,
      { userId: 1, notes: [12, 13, 14].map((noteId) => ({ noteId, tags })) },
      { apply: true }
    );

    await expect(promise).rejects.toBeInstanceOf(MappingError);
    const statements = executed(client);
    expect(statements.at(-1)).toBe('ROLLBACK');
    expect(statements.some((s) => s.startsWith('INSERT') || s.startsWith('UPDATE'))).toBe(false);
  });
});

describe('blockTagsMigration — rollbackBlockTags', () => {
  it('rechaza un reporte de dry-run sin abrir transacción', async () => {
    const client = fakeClient([]);

    await expect(rollbackBlockTags(client, { mode: 'dry-run', userId: 1 })).rejects.toBeInstanceOf(MappingError);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('borra exactamente las filas del reporte dentro de su userId', async () => {
    const client = fakeClient([
      [/DELETE FROM note_block_tag_assignments/, () => [{}, {}]],
      [/DELETE FROM note_tag_assignments/, () => [{}]],
    ]);
    const report = {
      mode: 'apply',
      userId: 1,
      inserted_block_tags: [
        { block_id: 100, tag_id: 4 },
        { block_id: 101, tag_id: 4 },
      ],
      inserted_note_tags: [{ note_id: 12, tag_id: 4 }],
      created_tags: [{ id: 9, name: 'proyección', group: 'Tipo' }],
      group_changes: [],
    };

    const result = await rollbackBlockTags(client, report);

    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM note_block_tag_assignments'), [
      1,
      [100, 101],
      [4, 4],
    ]);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM note_tag_assignments'), [
      1,
      [12],
      [4],
    ]);
    expect(executed(client).at(-1)).toBe('COMMIT');
    expect(result).toMatchObject({ deleted_block_tags: 2, deleted_note_tags: 1, created_tags: report.created_tags });
  });
});
