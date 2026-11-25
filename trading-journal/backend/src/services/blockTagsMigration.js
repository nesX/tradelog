import { TAG_GROUPS, TAG_GROUP_COLORS } from '../constants/tagGroups.js';

/**
 * Migración de notas-categoría a tags de bloque (spec tags-bloques.md §7, task 041).
 *
 * Una nota-categoría junta bloques, o referencias a bloques, de un tema. El mapeo
 * dice qué tags representa cada una; la migración:
 *   1. valida el mapeo contra la BD (usuario, notas propias y vivas, nombres, grupos);
 *   2. resuelve cada tag por nombre (sin distinguir mayúsculas), creándolo si falta;
 *   3. con `noteDefaults` (true por defecto), asigna los tags a la nota, para que sus
 *      bloques nuevos los reciban;
 *   4. Fase A: pone los tags en los bloques directos de la nota que no son referencias;
 *   5. Fase B: por cada referencia de la nota a un bloque válido, pone los tags en el
 *      bloque destino y la reporta como `redundante` (la referencia ya solo duplica);
 *      las rotas y las que apuntan a una nota se reportan sin tocar nada.
 *
 * Nunca borra referencias, notas ni tags (D10). Todo corre en una transacción con el
 * mismo advisory lock por usuario que withUserLock: en dry-run termina en ROLLBACK y
 * en apply en COMMIT. Cada INSERT usa RETURNING, así que el reporte lista solo las
 * filas que de verdad se insertaron: es lo que borra el rollback.
 *
 * La CLI (backend/scripts/migrate-block-tags.js) lee los argumentos, abre el cliente
 * y escribe el reporte; aquí solo está la lógica, con el cliente inyectado.
 */

// Problemas del mapeo o del reporte de rollback: se listan todos y no se toca nada.
export class MappingError extends Error {
  constructor(problems, title = 'El mapeo no es válido') {
    super(`${title}:\n- ${problems.join('\n- ')}`);
    this.name = 'MappingError';
    this.problems = problems;
  }
}

const isPositiveInt = (v) => Number.isInteger(v) && v > 0;

/**
 * Valida la forma del mapeo, sin BD. Devuelve el mapeo normalizado
 * ({ userId, notes: [{ noteId, tags: [{ name, group }], noteDefaults }] }) o lanza
 * MappingError con todos los problemas encontrados.
 */
export const parseMapping = (mapping) => {
  const problems = [];
  if (!mapping || typeof mapping !== 'object') throw new MappingError(['el mapeo tiene que ser un objeto JSON']);
  if (!isPositiveInt(mapping.userId)) problems.push('userId tiene que ser un entero positivo');
  if (!Array.isArray(mapping.notes) || mapping.notes.length === 0) {
    problems.push('notes tiene que ser una lista con al menos una nota');
  }

  const seen = new Set();
  const notes = (Array.isArray(mapping.notes) ? mapping.notes : []).map((entry, i) => {
    const where = `notes[${i}]`;
    if (!isPositiveInt(entry?.noteId)) problems.push(`${where}: noteId tiene que ser un entero positivo`);
    else if (seen.has(entry.noteId)) problems.push(`${where}: la nota ${entry.noteId} está repetida en el mapeo`);
    else seen.add(entry.noteId);

    if (entry?.noteDefaults !== undefined && typeof entry.noteDefaults !== 'boolean') {
      problems.push(`${where}: noteDefaults tiene que ser true o false`);
    }
    if (!Array.isArray(entry?.tags) || entry.tags.length === 0) {
      problems.push(`${where}: tags tiene que ser una lista con al menos un tag`);
    }

    const tags = (Array.isArray(entry?.tags) ? entry.tags : []).map((tag, j) => {
      const name = typeof tag?.name === 'string' ? tag.name.trim() : '';
      if (name.length < 1 || name.length > 100) {
        problems.push(`${where}.tags[${j}]: el nombre tiene que tener entre 1 y 100 caracteres`);
      }
      const group = tag?.group ?? 'libre';
      if (!TAG_GROUPS.includes(group)) {
        problems.push(`${where}.tags[${j}]: grupo "${group}" inválido (válidos: ${TAG_GROUPS.join(', ')})`);
      }
      return { name, group };
    });

    return { noteId: entry?.noteId, tags, noteDefaults: entry?.noteDefaults ?? true };
  });

  if (problems.length > 0) throw new MappingError(problems);
  return { userId: mapping.userId, notes };
};

/**
 * Estado de una referencia según su destino (pura, para testearla sin BD).
 *
 * @param {object} reference - { metadata, linked_note_id }
 * @param {object|null} target - bloque destino si `target_block_id` existe en la BD:
 *   { block_type, user_id, deleted_at }; null si no existe.
 * @param {number} userId
 * @returns {'valido' | 'rota' | 'rota_referencia' | 'apunta_a_nota'}
 *   'valido' recibe los tags y se reporta como `redundante`; 'rota_referencia' se
 *   reporta como `rota` con un warning.
 */
export const classifyReference = (reference, target, userId) => {
  const metadata = reference.metadata || {};
  if (metadata.target_block_id == null) {
    // Sin bloque destino: apunta a una nota (esquema nuevo o sub-nota) o no apunta a nada.
    return metadata.target_note_id != null || reference.linked_note_id != null ? 'apunta_a_nota' : 'rota';
  }
  if (!target || target.user_id !== userId || target.deleted_at) return 'rota';
  if (target.block_type === 'reference') return 'rota_referencia';
  return 'valido';
};

// Resuelve los tags del mapeo por nombre, creándolos o pasándolos de 'libre' al
// grupo del mapeo. Devuelve Map nombre en minúsculas → { id, name, group_key }.
const resolveTags = async (client, userId, notes, report) => {
  const resolved = new Map();
  for (const note of notes) {
    for (const { name, group } of note.tags) {
      const key = name.toLowerCase();
      const known = resolved.get(key);
      if (known) {
        if (known.group_key !== group) {
          report.warnings.push(
            `El tag "${known.name}" queda en el grupo "${known.group_key}"; la nota ${note.noteId} lo pide en "${group}"`
          );
        }
        continue;
      }

      const existing = await client.query(
        `SELECT id, name, group_key FROM note_tags WHERE user_id = $1 AND LOWER(name) = LOWER($2)`,
        [userId, name]
      );
      let tag = existing.rows[0];
      if (!tag) {
        const created = await client.query(
          `INSERT INTO note_tags (user_id, name, color, group_key) VALUES ($1, $2, $3, $4)
           RETURNING id, name, group_key`,
          [userId, name, TAG_GROUP_COLORS[group], group]
        );
        tag = created.rows[0];
        report.created_tags.push({ id: tag.id, name: tag.name, group_key: tag.group_key });
      } else if (tag.group_key === 'libre' && group !== 'libre') {
        await client.query(`UPDATE note_tags SET group_key = $1 WHERE id = $2 AND user_id = $3`, [
          group,
          tag.id,
          userId,
        ]);
        report.group_changes.push({ tag_id: tag.id, name: tag.name, from: 'libre', to: group });
        tag = { ...tag, group_key: group };
      } else if (tag.group_key !== group) {
        report.warnings.push(
          `El tag "${tag.name}" ya está en el grupo "${tag.group_key}" y se respeta (el mapeo pide "${group}")`
        );
      }
      resolved.set(key, tag);
    }
  }
  return resolved;
};

// Valida contra la BD lo que parseMapping no puede ver. Devuelve Map id → nota.
const loadNotes = async (client, userId, notes) => {
  const problems = [];
  const user = await client.query(`SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL`, [userId]);
  if (user.rows.length === 0) problems.push(`el usuario ${userId} no existe`);

  const ids = notes.map((n) => n.noteId);
  const result = await client.query(
    `SELECT id, user_id, title, type, deleted_at FROM notes WHERE id = ANY($1::int[])`,
    [ids]
  );
  const byId = new Map(result.rows.map((n) => [n.id, n]));
  for (const id of ids) {
    const note = byId.get(id);
    if (!note || note.user_id !== userId) problems.push(`la nota ${id} no existe o no es del usuario ${userId}`);
    else if (note.deleted_at) problems.push(`la nota ${id} ("${note.title}") está en la papelera`);
    else if (note.type !== 'note')
      problems.push(`la nota ${id} ("${note.title}") es de tipo ${note.type}, no una nota`);
  }
  if (problems.length > 0) throw new MappingError(problems);
  return byId;
};

const insertBlockTags = async (client, blockSql, params) => {
  const result = await client.query(
    `INSERT INTO note_block_tag_assignments (block_id, tag_id)
     ${blockSql}
     ON CONFLICT DO NOTHING
     RETURNING block_id, tag_id`,
    params
  );
  return result.rows;
};

/**
 * Corre la migración en una transacción. Con `apply` confirma; si no, deshace todo
 * al final (dry-run). Devuelve el reporte; lanza MappingError si el mapeo no valida.
 */
export const migrateBlockTags = async (client, rawMapping, { apply = false } = {}) => {
  const { userId, notes } = parseMapping(rawMapping);
  const report = {
    userId,
    mode: apply ? 'apply' : 'dry-run',
    generated_at: new Date().toISOString(),
    created_tags: [],
    group_changes: [],
    warnings: [],
    inserted_note_tags: [],
    inserted_block_tags: [],
    notes: [],
    references: [],
  };

  await client.query('BEGIN');
  try {
    // Mismo lock que withUserLock: no cruzarse con un createBlock del usuario.
    await client.query('SELECT pg_advisory_xact_lock($1)', [userId]);

    const notesById = await loadNotes(client, userId, notes);
    const tagsByName = await resolveTags(client, userId, notes, report);

    for (const entry of notes) {
      const note = notesById.get(entry.noteId);
      const tagIds = [...new Set(entry.tags.map((t) => tagsByName.get(t.name.toLowerCase()).id))];

      if (entry.noteDefaults) {
        const inserted = await client.query(
          `INSERT INTO note_tag_assignments (note_id, tag_id)
           SELECT $1::int, t.id FROM unnest($2::int[]) AS t(id)
           ON CONFLICT DO NOTHING
           RETURNING note_id, tag_id`,
          [note.id, tagIds]
        );
        report.inserted_note_tags.push(...inserted.rows);
      }

      // Fase A: bloques directos que no son referencias (sin sub-notas).
      const phaseA = await insertBlockTags(
        client,
        `SELECT b.id, t.id FROM note_blocks b CROSS JOIN unnest($2::int[]) AS t(id)
         WHERE b.note_id = $1 AND b.block_type <> 'reference'`,
        [note.id, tagIds]
      );
      report.inserted_block_tags.push(...phaseA);

      // Fase B: referencias de la nota.
      const refs = await client.query(
        `SELECT id, metadata, linked_note_id FROM note_blocks
         WHERE note_id = $1 AND block_type = 'reference'
         ORDER BY position COLLATE "C" ASC`,
        [note.id]
      );
      let referenceCount = 0;
      for (const ref of refs.rows) {
        referenceCount += 1;
        const metadata = ref.metadata || {};
        const targetBlockId = metadata.target_block_id ?? null;
        let target = null;
        if (targetBlockId != null) {
          const found = await client.query(
            `SELECT b.id, b.block_type, n.user_id, n.deleted_at, n.title AS note_title
             FROM note_blocks b JOIN notes n ON n.id = b.note_id
             WHERE b.id = $1`,
            [targetBlockId]
          );
          target = found.rows[0] || null;
        }

        const kind = classifyReference(ref, target, userId);
        const entryReport = {
          reference_block_id: ref.id,
          note_id: note.id,
          note_title: note.title,
          target_block_id: targetBlockId,
          target_note_title: null,
          status: kind === 'valido' ? 'redundante' : kind === 'rota_referencia' ? 'rota' : kind,
          assignments_created: 0,
        };

        if (kind === 'valido') {
          entryReport.target_note_title = target.note_title;
          const inserted = await insertBlockTags(client, `SELECT $1::int, t.id FROM unnest($2::int[]) AS t(id)`, [
            target.id,
            tagIds,
          ]);
          report.inserted_block_tags.push(...inserted);
          entryReport.assignments_created = inserted.length;
        } else if (kind === 'rota_referencia') {
          report.warnings.push(
            `La referencia ${ref.id} (nota ${note.id}) apunta a otra referencia (bloque ${targetBlockId}): se reporta como rota`
          );
        } else if (kind === 'apunta_a_nota') {
          const targetNoteId = metadata.target_note_id ?? ref.linked_note_id;
          const targetNote = await client.query(
            `SELECT title FROM notes WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
            [targetNoteId, userId]
          );
          entryReport.target_note_title = targetNote.rows[0]?.title ?? null;
        }
        report.references.push(entryReport);
      }

      report.notes.push({
        note_id: note.id,
        note_title: note.title,
        tags: entry.tags.map((t) => tagsByName.get(t.name.toLowerCase()).name),
        note_defaults: entry.noteDefaults,
        blocks_tagged: new Set(phaseA.map((r) => r.block_id)).size,
        assignments_created: phaseA.length,
        references: referenceCount,
      });
    }

    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    return report;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
};

const REPORT_ERROR = 'El reporte no sirve para el rollback';

/**
 * Deshace un --apply: borra exactamente las filas que el reporte dice que insertó,
 * dentro de su userId. No borra los tags creados ni revierte los cambios de grupo:
 * los devuelve para hacerlo a mano.
 */
export const rollbackBlockTags = async (client, report) => {
  if (!report || report.mode !== 'apply') {
    throw new MappingError(['no es de un --apply (los de dry-run no insertaron nada)'], REPORT_ERROR);
  }
  if (!isPositiveInt(report.userId)) throw new MappingError(['no tiene userId'], REPORT_ERROR);

  const blockRows = report.inserted_block_tags || [];
  const noteRows = report.inserted_note_tags || [];

  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock($1)', [report.userId]);
    const blocks = await client.query(
      `DELETE FROM note_block_tag_assignments a
       USING note_blocks b, notes n
       WHERE a.block_id = b.id AND b.note_id = n.id AND n.user_id = $1
         AND (a.block_id, a.tag_id) IN (SELECT * FROM unnest($2::int[], $3::int[]))`,
      [report.userId, blockRows.map((r) => r.block_id), blockRows.map((r) => r.tag_id)]
    );
    const notes = await client.query(
      `DELETE FROM note_tag_assignments a
       USING notes n
       WHERE a.note_id = n.id AND n.user_id = $1
         AND (a.note_id, a.tag_id) IN (SELECT * FROM unnest($2::int[], $3::int[]))`,
      [report.userId, noteRows.map((r) => r.note_id), noteRows.map((r) => r.tag_id)]
    );
    await client.query('COMMIT');
    return {
      deleted_block_tags: blocks.rowCount,
      deleted_note_tags: notes.rowCount,
      created_tags: report.created_tags || [],
      group_changes: report.group_changes || [],
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
};
