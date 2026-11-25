import { pool } from '../config/database.js';
import { generateKeyBetween } from 'fractional-indexing';
import { FREE_GROUP_COLOR } from '../constants/tagGroups.js';

// Orden canónico de los tags: por la posición de su grupo, Libre (group_id NULL)
// al final, y luego por nombre. Va con tagGroupJoin: `tagAlias` es el alias de
// note_tags y `groupAlias` el de note_tag_groups (literales fijos, nunca datos).
const tagGroupJoin = (tagAlias, groupAlias) =>
  `LEFT JOIN note_tag_groups ${groupAlias} ON ${groupAlias}.id = ${tagAlias}.group_id`;
const tagOrder = (tagAlias, groupAlias) =>
  `${groupAlias}.position NULLS LAST, ${groupAlias}.id, LOWER(${tagAlias}.name)`;

// Shape de un tag en todas las respuestas.
const TAG_COLUMNS = 'id, name, color, group_id, created_at';

// ============================================================
// NOTAS
// ============================================================

export const getTree = async (userId) => {
  const result = await pool.query(
    `SELECT n.id, n.parent_note_id, n.title, n.position, n.type, n.created_at, n.updated_at,
      (SELECT COUNT(*) FROM note_blocks nb WHERE nb.note_id = n.id) as block_count,
      -- Posición del bloque 'reference' que representa esta sub-nota dentro de su
      -- nota padre. Permite al cliente ordenar las sub-notas igual que se ven
      -- dentro de la nota. NULL si no hay bloque (p. ej. sub-nota creada desde el
      -- árbol lateral) o si la nota es raíz.
      (SELECT nb.position FROM note_blocks nb
       WHERE nb.note_id = n.parent_note_id AND nb.linked_note_id = n.id
       ORDER BY nb.position COLLATE "C" ASC LIMIT 1) as parent_block_position,
      COALESCE(
        (SELECT json_agg(json_build_object('id', nt.id, 'name', nt.name, 'color', nt.color, 'group_id', nt.group_id))
         FROM note_tag_assignments nta
         JOIN note_tags nt ON nt.id = nta.tag_id
         WHERE nta.note_id = n.id), '[]'
      ) as tags
    FROM notes n
    WHERE n.user_id = $1 AND n.deleted_at IS NULL AND n.type <> 'todo'
    ORDER BY n.position COLLATE "C" ASC, n.created_at ASC`,
    [userId]
  );
  return result.rows;
};

export const getById = async (userId, noteId) => {
  const noteResult = await pool.query(
    `SELECT * FROM notes WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [noteId, userId]
  );
  if (noteResult.rows.length === 0) return null;

  const blocksResult = await pool.query(
    `SELECT ${BLOCK_DETAIL_COLUMNS}
    FROM note_blocks nb
    ${LINKED_NOTE_JOIN}
    WHERE nb.note_id = $1
    ORDER BY nb.position COLLATE "C" ASC`,
    [noteId, userId]
  );

  // Tags de todos los bloques en una sola query (nunca una por bloque).
  const blockTags = await getBlockTags(
    blocksResult.rows.map((b) => b.id),
    userId
  );
  for (const block of blocksResult.rows) block.tags = blockTags.get(block.id) ?? [];

  const tagsResult = await pool.query(
    `SELECT nt.id, nt.name, nt.color, nt.group_id
    FROM note_tag_assignments nta
    JOIN note_tags nt ON nt.id = nta.tag_id
    ${tagGroupJoin('nt', 'g')}
    WHERE nta.note_id = $1
    ORDER BY ${tagOrder('nt', 'g')}`,
    [noteId]
  );

  // Alertas y recordatorios de nivel nota (los de bloque van en cada bloque)
  const noteRemindersResult = await pool.query(
    `SELECT ${blockReminderColumns('$1::int', 'note_id')}`,
    [noteId]
  );

  const note = noteResult.rows[0];
  note.blocks = blocksResult.rows;
  note.tags = tagsResult.rows;
  note.price_alerts = noteRemindersResult.rows[0].price_alerts;
  note.date_reminders = noteRemindersResult.rows[0].date_reminders;
  return note;
};

/**
 * Subqueries json_agg con las alertas de precio y los recordatorios por fecha de
 * un anclaje, para pintar los chips sin otra petición. `anchorExpr` es la
 * expresión del id (columna o parámetro) y `anchorColumn` la columna de anclaje
 * ('block_id' | 'note_id'); ambos son literales fijos, nunca datos. Dentro de
 * json_agg los NUMERIC salen como números JSON.
 */
const blockReminderColumns = (anchorExpr, anchorColumn) => `
      COALESCE(
        (SELECT json_agg(
          json_build_object(
            'id', pa.id, 'symbol', pa.symbol, 'direction', pa.direction,
            'target_price', pa.target_price, 'is_invalidation', pa.is_invalidation,
            'near_pct', pa.near_pct, 'deadline_at', pa.deadline_at, 'message', pa.message,
            'status', pa.status, 'armed_at', pa.armed_at, 'triggered_at', pa.triggered_at,
            'price_at_creation', pa.price_at_creation, 'contract_type', ms.contract_type, 'tick_size', ms.tick_size,
            'last_price', ms.last_price, 'last_price_at', ms.last_price_at
          ) ORDER BY pa.created_at ASC
        )
        FROM price_alerts pa
        JOIN market_symbols ms ON ms.symbol = pa.symbol
        WHERE pa.${anchorColumn} = ${anchorExpr}), '[]'
      ) as price_alerts,
      COALESCE(
        (SELECT json_agg(
          json_build_object(
            'id', dr.id, 'remind_at', dr.remind_at, 'message', dr.message,
            'status', dr.status, 'sent_at', dr.sent_at
          ) ORDER BY dr.remind_at ASC
        )
        FROM date_reminders dr
        WHERE dr.${anchorColumn} = ${anchorExpr}), '[]'
      ) as date_reminders`;

// Columnas de un bloque tal como las ve el editor: la fila, sus imágenes, trades,
// recordatorios y el título de la sub-nota enlazada. Las comparten getById (todos
// los bloques de una nota) y getBlockDetail (un bloque suelto, para el visor), así
// los dos devuelven el mismo shape. Van con LINKED_NOTE_JOIN, que usa $2 = user_id.
const BLOCK_DETAIL_COLUMNS = `nb.*,
      COALESCE(
        (SELECT json_agg(
          json_build_object('id', nbi.id, 'image_path', nbi.image_path, 'caption', nbi.caption, 'position', nbi.position, 'created_at', nbi.created_at)
          ORDER BY nbi.position ASC
        )
        FROM note_block_images nbi WHERE nbi.block_id = nb.id), '[]'
      ) as images,
      COALESCE(
        (SELECT json_agg(
          json_build_object(
            'id', t.id,
            'symbol', t.symbol,
            'side', t.trade_type,
            'status', t.status,
            'pnl', t.pnl,
            'pnl_percentage', t.pnl_percentage,
            'entry_date', t.entry_date,
            'first_image', (SELECT ti.filename FROM trade_images ti
                            WHERE ti.trade_id = t.id ORDER BY ti.id ASC LIMIT 1)
          ) ORDER BY nbt.position ASC
        )
        FROM note_block_trades nbt
        LEFT JOIN trades t ON t.id = nbt.trade_id AND t.deleted_at IS NULL
        WHERE nbt.block_id = nb.id), '[]'
      ) as trades,
      ${blockReminderColumns('nb.id', 'block_id')},
      ln.title as linked_note_title`;

const LINKED_NOTE_JOIN = `LEFT JOIN notes ln ON ln.id = nb.linked_note_id AND ln.deleted_at IS NULL AND ln.user_id = $2`;

/**
 * Un bloque suelto con el mismo shape que cada elemento de `blocks` en getById,
 * más `tags` y `note: { id, title }`. null si el bloque no es del usuario o su
 * nota está en la papelera.
 */
export const getBlockDetail = async (userId, blockId) => {
  const result = await pool.query(
    `SELECT ${BLOCK_DETAIL_COLUMNS}, n.title AS note_title
    FROM note_blocks nb
    JOIN notes n ON n.id = nb.note_id AND n.user_id = $2 AND n.deleted_at IS NULL
    ${LINKED_NOTE_JOIN}
    WHERE nb.id = $1`,
    [blockId, userId]
  );
  if (result.rows.length === 0) return null;

  const { note_title: noteTitle, ...block } = result.rows[0];
  const blockTags = await getBlockTags([block.id], userId);
  block.tags = blockTags.get(block.id) ?? [];
  block.note = { id: block.note_id, title: noteTitle };
  return block;
};

export const create = async (userId, { title = 'Sin título', parent_note_id = null, type = 'note' }, exec = pool) => {

  const lastResult = await exec.query(
    `SELECT position as last_pos
     FROM notes
     WHERE user_id = $1 AND parent_note_id IS NOT DISTINCT FROM $2 AND deleted_at IS NULL
     ORDER BY position COLLATE "C" DESC
     LIMIT 1`,
    [userId, parent_note_id]
  );

  const position = generateKeyBetween(lastResult.rows[0]?.last_pos ?? null, null);

  const result = await exec.query(
    `INSERT INTO notes (user_id, parent_note_id, title, position, type)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, parent_note_id, title, position, type]
  );
  return result.rows[0];
};

export const updateTitle = async (userId, noteId, title) => {
  const result = await pool.query(
    `UPDATE notes SET title = $1 WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING *`,
    [title, noteId, userId]
  );
  return result.rows[0] || null;
};

export const softDelete = async (userId, noteId, exec = pool) => {
  // Cap de profundidad (depth < 100) + DISTINCT como guard anti-ciclos: si por una
  // carrera quedara un ciclo en el árbol, el CTE no entra en recursión infinita.
  // `AND deleted_at IS NULL` en el UPDATE evita re-marcar descendientes ya borrados
  // (que perderían su deleted_at original).
  const result = await exec.query(
    `WITH RECURSIVE descendants AS (
      SELECT id, 1 AS depth FROM notes WHERE id = $1 AND user_id = $2
      UNION ALL
      SELECT n.id, d.depth + 1 FROM notes n INNER JOIN descendants d ON n.parent_note_id = d.id
      WHERE d.depth < 100
    )
    UPDATE notes SET deleted_at = NOW()
    WHERE id IN (SELECT DISTINCT id FROM descendants) AND deleted_at IS NULL
    RETURNING id`,
    [noteId, userId]
  );
  return result.rows.map((r) => r.id);
};

// Nota por id + usuario SIN filtrar por deleted_at. Necesario para restaurar: hay
// que leer el deleted_at (y el parent) de una nota ya borrada.
export const getDeletedById = async (userId, noteId, exec = pool) => {
  const result = await exec.query(
    `SELECT id, parent_note_id, deleted_at, type FROM notes WHERE id = $1 AND user_id = $2`,
    [noteId, userId]
  );
  return result.rows[0] || null;
};

// Restaura (deleted_at = NULL) la nota raíz y su subtree, pero SOLO las filas cuyo
// deleted_at coincide con el de la raíz — es decir, las que cayeron en el MISMO
// borrado. Un descendiente borrado ANTES (timestamp más viejo) conserva su
// deleted_at y permanece borrado. Espejo del CTE recursivo de softDelete, con el
// mismo guard de profundidad/DISTINCT anti-ciclos.
export const restoreSubtree = async (userId, noteId, rootDeletedAt, exec = pool) => {
  const result = await exec.query(
    `WITH RECURSIVE subtree AS (
      SELECT id, 1 AS depth FROM notes WHERE id = $1 AND user_id = $2
      UNION ALL
      SELECT n.id, s.depth + 1 FROM notes n INNER JOIN subtree s ON n.parent_note_id = s.id
      WHERE s.depth < 100
    )
    UPDATE notes SET deleted_at = NULL
    WHERE id IN (SELECT DISTINCT id FROM subtree)
      AND user_id = $2
      AND deleted_at = $3
    RETURNING id`,
    [noteId, userId, rootDeletedAt]
  );
  return result.rows.map((r) => r.id);
};

export const isDescendant = async (noteId, targetId) => {
  const result = await pool.query(
    `WITH RECURSIVE descendants AS (
      SELECT id, 1 AS depth FROM notes WHERE id = $1
      UNION ALL
      SELECT n.id, d.depth + 1 FROM notes n INNER JOIN descendants d ON n.parent_note_id = d.id
      WHERE d.depth < 100
    )
    SELECT EXISTS(SELECT 1 FROM descendants WHERE id = $2) as is_descendant`,
    [noteId, targetId]
  );
  return result.rows[0].is_descendant;
};

export const move = async (userId, noteId, newParentId, exec = pool) => {
  // Recalcular la posición al final de los hijos del nuevo padre (excluyéndose a sí
  // misma), en vez de conservar la posición vieja (relativa a otros hermanos), que
  // podía colisionar con las claves fractional de los nuevos hermanos.
  const lastResult = await exec.query(
    `SELECT position FROM notes
     WHERE user_id = $1 AND parent_note_id IS NOT DISTINCT FROM $2 AND deleted_at IS NULL AND id != $3
     ORDER BY position COLLATE "C" DESC
     LIMIT 1`,
    [userId, newParentId, noteId]
  );
  const position = generateKeyBetween(lastResult.rows[0]?.position ?? null, null);

  const result = await exec.query(
    `UPDATE notes SET parent_note_id = $1, position = $2, updated_at = NOW()
     WHERE id = $3 AND user_id = $4 AND deleted_at IS NULL RETURNING *`,
    [newParentId, position, noteId, userId]
  );
  return result.rows[0] || null;
};

// Reasigna posiciones de una lista de hermanos. Debe llamarse dentro de una
// transacción con lock (ver withUserLock): el service valida antes que la lista
// incluya a TODOS los hermanos, si no, reasignar desde 'a0' colisiona con los omitidos.
export const reorderSiblings = async (userId, noteIds, exec = pool) => {
  let prev = null;
  for (const noteId of noteIds) {
    const key = generateKeyBetween(prev, null);
    await exec.query(
      `UPDATE notes SET position = $1 WHERE id = $2 AND user_id = $3`,
      [key, noteId, userId]
    );
    prev = key;
  }
};

// Ids de todos los hermanos (mismo padre) del usuario, para validar el reorden completo.
export const getSiblingNoteIds = async (userId, parentNoteId, exec = pool) => {
  const result = await exec.query(
    `SELECT id FROM notes
     WHERE parent_note_id IS NOT DISTINCT FROM $1 AND user_id = $2 AND deleted_at IS NULL
       AND type <> 'todo'`,
    [parentNoteId, userId]
  );
  return result.rows.map((r) => r.id);
};

// Obtener todas las notas (IDs) de una lista de IDs para validación
// ============================================================
// DRAG & DROP — NOTAS
// ============================================================

/**
 * Obtiene todos los IDs de descendientes de una nota (recursivo).
 * Usado para validar ciclos al mover.
 */
export const getDescendantIds = async (noteId, exec = pool) => {
  // Guard anti-ciclos: cap de profundidad + DISTINCT (ver softDelete).
  const result = await exec.query(
    `WITH RECURSIVE descendants AS (
       SELECT id, 1 AS depth FROM notes
       WHERE parent_note_id = $1 AND deleted_at IS NULL
       UNION ALL
       SELECT n.id, d.depth + 1 FROM notes n
       INNER JOIN descendants d ON n.parent_note_id = d.id
       WHERE n.deleted_at IS NULL AND d.depth < 100
     )
     SELECT DISTINCT id FROM descendants`,
    [noteId]
  );
  return result.rows.map((r) => r.id);
};

/**
 * Profundidad de una nota (nº de ancestros incluyéndose; raíz = 1). Guard de ciclos
 * con cap de profundidad, igual que el resto de CTEs recursivos.
 */
export const getNoteDepth = async (noteId, exec = pool) => {
  const result = await exec.query(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_note_id, 1 AS depth FROM notes WHERE id = $1
       UNION ALL
       SELECT n.id, n.parent_note_id, a.depth + 1
       FROM notes n INNER JOIN ancestors a ON n.id = a.parent_note_id
       WHERE a.depth < 100
     )
     SELECT MAX(depth) AS depth FROM ancestors`,
    [noteId]
  );
  return result.rows[0]?.depth ?? 0;
};

/**
 * Busca una nota verificando propiedad del usuario.
 */
export const findNoteByIdAndUser = async (noteId, userId, exec = pool) => {
  const result = await exec.query(
    `SELECT id, user_id, parent_note_id, title, position, type
     FROM notes
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [noteId, userId]
  );
  return result.rows[0] || null;
};

/**
 * Posición de la última nota hija de un padre dado.
 * Retorna null si el padre no tiene hijos.
 */
export const getLastChildPosition = async (parentNoteId, exec = pool) => {
  const result = await exec.query(
    `SELECT position FROM notes
     WHERE parent_note_id = $1 AND deleted_at IS NULL
     ORDER BY position COLLATE "C" DESC
     LIMIT 1`,
    [parentNoteId]
  );
  return result.rows[0]?.position ?? null;
};

/**
 * Obtiene posiciones inmediatamente antes y después de un target
 * dentro del mismo padre. Usado para insertar como sibling.
 *
 * @param {number|null} parentNoteId
 * @param {number} userId - Solo si parentNoteId es null (notas raíz)
 * @param {string} targetPosition - Posición del nodo target
 * @param {'above'|'below'} side
 */
export const getSiblingPositions = async (parentNoteId, userId, targetPosition, side, excludeNoteId = null, exec = pool) => {
  const isRoot = parentNoteId === null;
  const parentClause = isRoot
    ? 'parent_note_id IS NULL AND user_id = $2'
    : 'parent_note_id = $2';
  const parentParam = isRoot ? userId : parentNoteId;

  if (side === 'above') {
    const params = [targetPosition, parentParam];
    let excludeClause = '';
    if (excludeNoteId !== null) { params.push(excludeNoteId); excludeClause = ` AND id != $${params.length}`; }
    const before = await exec.query(
      `SELECT position FROM notes
       WHERE ${parentClause} AND deleted_at IS NULL AND position COLLATE "C" < $1${excludeClause}
       ORDER BY position COLLATE "C" DESC LIMIT 1`,
      params
    );
    return { before: before.rows[0]?.position ?? null, after: targetPosition };
  } else {
    const params = [targetPosition, parentParam];
    let excludeClause = '';
    if (excludeNoteId !== null) { params.push(excludeNoteId); excludeClause = ` AND id != $${params.length}`; }
    const after = await exec.query(
      `SELECT position FROM notes
       WHERE ${parentClause} AND deleted_at IS NULL AND position COLLATE "C" > $1${excludeClause}
       ORDER BY position COLLATE "C" ASC LIMIT 1`,
      params
    );
    return { before: targetPosition, after: after.rows[0]?.position ?? null };
  }
};

/**
 * Persiste el move: actualiza padre y posición en una sola fila.
 */
export const updateNoteParentAndPosition = async (noteId, newParentId, newPosition, userId, exec = pool) => {
  const result = await exec.query(
    `UPDATE notes
     SET parent_note_id = $1, position = $2, updated_at = NOW()
     WHERE id = $3 AND user_id = $4 AND deleted_at IS NULL
     RETURNING *`,
    [newParentId, newPosition, noteId, userId]
  );
  return result.rows[0] || null;
};

// ============================================================
// DRAG & DROP — BLOQUES
// ============================================================

/**
 * Bloque con verificación de propiedad vía su nota.
 */
export const findBlockByIdAndUser = async (blockId, userId, exec = pool) => {
  const result = await exec.query(
    `SELECT b.id, b.note_id, b.position, b.block_type, b.linked_note_id
     FROM note_blocks b
     INNER JOIN notes n ON n.id = b.note_id
     WHERE b.id = $1 AND n.user_id = $2 AND n.deleted_at IS NULL`,
    [blockId, userId]
  );
  return result.rows[0] || null;
};

/**
 * Posiciones siblings dentro de la misma nota para DnD.
 */
export const getSiblingBlockPositions = async (noteId, targetPosition, side, exec = pool) => {
  if (side === 'above') {
    const before = await exec.query(
      `SELECT position FROM note_blocks
       WHERE note_id = $1 AND position COLLATE "C" < $2
       ORDER BY position COLLATE "C" DESC LIMIT 1`,
      [noteId, targetPosition]
    );
    return { before: before.rows[0]?.position ?? null, after: targetPosition };
  } else {
    const after = await exec.query(
      `SELECT position FROM note_blocks
       WHERE note_id = $1 AND position COLLATE "C" > $2
       ORDER BY position COLLATE "C" ASC LIMIT 1`,
      [noteId, targetPosition]
    );
    return { before: targetPosition, after: after.rows[0]?.position ?? null };
  }
};

/**
 * Actualiza solo la posición de un bloque (single-row UPDATE).
 */
export const updateBlockPosition = async (blockId, newPosition, userId, exec = pool) => {
  // No tocar updated_at: un reorden no es "actividad" para la vista de Revisión.
  // El trigger update_note_blocks_updated_at excluye los cambios de solo-posición
  // (ver 024_migration_block_updated_at_skip_reorder.sql).
  const result = await exec.query(
    `UPDATE note_blocks b
     SET position = $1
     FROM notes n
     WHERE b.id = $2 AND b.note_id = n.id
       AND n.user_id = $3 AND n.deleted_at IS NULL
     RETURNING b.*`,
    [newPosition, blockId, userId]
  );
  return result.rows[0] || null;
};

/**
 * Última posición de bloque en una nota (para apendar al final).
 */
export const getLastBlockPosition = async (noteId, exec = pool) => {
  const result = await exec.query(
    `SELECT position FROM note_blocks
     WHERE note_id = $1
     ORDER BY position COLLATE "C" DESC
     LIMIT 1`,
    [noteId]
  );
  return result.rows[0]?.position ?? null;
};

/**
 * Mueve un bloque a otra nota: cambia note_id y position en un solo UPDATE.
 * La propiedad (usuario) se valida en el service antes de llamar; no toca
 * updated_at (el trigger de la migración 024 ignora cambios de note_id/position,
 * mover no es "actividad" para la vista de Revisión).
 */
export const updateBlockNoteAndPosition = async (blockId, targetNoteId, newPosition, exec = pool) => {
  const result = await exec.query(
    `UPDATE note_blocks
     SET note_id = $1, position = $2
     WHERE id = $3
     RETURNING *`,
    [targetNoteId, newPosition, blockId]
  );
  return result.rows[0] || null;
};

export const getNotesByIds = async (userId, noteIds, exec = pool) => {
  const result = await exec.query(
    `SELECT id, parent_note_id FROM notes
     WHERE id = ANY($1) AND user_id = $2 AND deleted_at IS NULL`,
    [noteIds, userId]
  );
  return result.rows;
};

// Todas las rutas de imágenes de los bloques de las notas dadas (sin filtro de edad).
// Usado por la purga diferida: al borrar definitivamente una nota, sus archivos
// también se van.
export const getImagePathsByNoteIds = async (noteIds) => {
  if (!noteIds || noteIds.length === 0) return [];
  const result = await pool.query(
    `SELECT nbi.image_path
     FROM note_block_images nbi
     JOIN note_blocks nb ON nb.id = nbi.block_id
     WHERE nb.note_id = ANY($1)`,
    [noteIds]
  );
  return result.rows.map((r) => r.image_path);
};

// Ids de notas soft-deleted cuyo deleted_at superó la gracia (días). Candidatas a
// purga definitiva. Se incluyen tanto raíces como descendientes marcados.
export const getPurgeableNoteIds = async (graceDays) => {
  const result = await pool.query(
    `SELECT id FROM notes
     WHERE deleted_at IS NOT NULL
       AND deleted_at < NOW() - ($1 * INTERVAL '1 day')`,
    [graceDays]
  );
  return result.rows.map((r) => r.id);
};

// Borrado DEFINITIVO (hard-delete) de notas por id. El ON DELETE CASCADE de los FKs
// arrastra bloques, imágenes (filas), asignaciones de tags y sub-notas.
export const hardDeleteNotes = async (noteIds) => {
  if (!noteIds || noteIds.length === 0) return 0;
  const result = await pool.query(`DELETE FROM notes WHERE id = ANY($1)`, [noteIds]);
  return result.rowCount;
};

// ============================================================
// BLOQUES
// ============================================================

export const createBlock = async (noteId, { block_type, content = null, linked_note_id = null, position, metadata = {} }, exec = pool) => {
  // COLLATE "C" para ordenar por bytes, igual que fractional-indexing y que el
  // resto de consultas. Sin esto, una collation locale-aware desordena before/after
  // y generateKeyBetween acaba generando claves duplicadas.
  const allBlocksResult = await exec.query(
    `SELECT position FROM note_blocks WHERE note_id = $1 ORDER BY position COLLATE "C" ASC`,
    [noteId]
  );
  const allPositions = allBlocksResult.rows.map((r) => r.position);

  let before = null;
  let after = null;
  if (position !== undefined && position !== null) {
    const insertIdx = Math.min(Math.max(0, position), allPositions.length);
    before = allPositions[insertIdx - 1] ?? null;
    after = allPositions[insertIdx] ?? null;
  } else {
    before = allPositions[allPositions.length - 1] ?? null;
    after = null;
  }

  // Salvaguarda ante datos antiguos con posiciones duplicadas: fractional-indexing
  // exige before < after estrictamente. Si coinciden, insertamos tras la siguiente
  // posición estrictamente mayor (o al final si no existe), evitando el crash.
  if (before !== null && after !== null && before >= after) {
    after = allPositions.find((p) => p > before) ?? null;
  }

  const pos = generateKeyBetween(before, after);

  const result = await exec.query(
    `INSERT INTO note_blocks (note_id, block_type, content, linked_note_id, position, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [noteId, block_type, content, linked_note_id, pos, JSON.stringify(metadata)]
  );
  return result.rows[0];
};

export const updateBlockMetadata = async (blockId, metadata) => {
  const result = await pool.query(
    `UPDATE note_blocks SET metadata = $1 WHERE id = $2 RETURNING *`,
    [JSON.stringify(metadata), blockId]
  );
  return result.rows[0] || null;
};

export const getBlockById = async (blockId) => {
  const result = await pool.query(
    `SELECT nb.*, n.user_id
     FROM note_blocks nb
     JOIN notes n ON n.id = nb.note_id
     WHERE nb.id = $1 AND n.deleted_at IS NULL`,
    [blockId]
  );
  return result.rows[0] || null;
};

export const updateBlockContent = async (blockId, content) => {
  const result = await pool.query(
    `UPDATE note_blocks SET content = $1 WHERE id = $2 RETURNING *`,
    [content, blockId]
  );
  return result.rows[0] || null;
};

export const deleteBlock = async (blockId, exec = pool) => {
  // Un solo statement: borra las imágenes (RETURNING sus paths) y el bloque de forma
  // atómica. Antes eran dos queries: una imagen añadida entre el SELECT y el DELETE
  // quedaba huérfana en disco.
  const result = await exec.query(
    `WITH imgs AS (
       DELETE FROM note_block_images WHERE block_id = $1 RETURNING image_path
     ), del AS (
       DELETE FROM note_blocks WHERE id = $1
     )
     SELECT image_path FROM imgs`,
    [blockId]
  );
  return result.rows.map((r) => r.image_path);
};

// Reasigna posiciones de una lista de bloques. Debe llamarse dentro de una
// transacción con lock; el service valida que la lista incluya a todos los bloques.
export const reorderBlocks = async (noteId, blockIds, exec = pool) => {
  let prev = null;
  for (const blockId of blockIds) {
    const key = generateKeyBetween(prev, null);
    await exec.query(
      `UPDATE note_blocks SET position = $1 WHERE id = $2 AND note_id = $3`,
      [key, blockId, noteId]
    );
    prev = key;
  }
};

export const getBlocksByNoteId = async (noteId, exec = pool) => {
  const result = await exec.query(
    `SELECT id FROM note_blocks WHERE note_id = $1`,
    [noteId]
  );
  return result.rows;
};

// ============================================================
// IMÁGENES DE BLOQUE
// ============================================================

export const addImage = async (blockId, { image_path, caption, position }) => {
  let pos = position;
  if (pos === undefined || pos === null) {
    const posResult = await pool.query(
      `SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM note_block_images WHERE block_id = $1`,
      [blockId]
    );
    pos = posResult.rows[0].next_pos;
  }
  const result = await pool.query(
    `INSERT INTO note_block_images (block_id, image_path, caption, position)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [blockId, image_path, caption || null, pos]
  );
  return result.rows[0];
};

export const getImageById = async (imageId) => {
  const result = await pool.query(
    `SELECT nbi.*, nb.note_id, n.user_id
     FROM note_block_images nbi
     JOIN note_blocks nb ON nb.id = nbi.block_id
     JOIN notes n ON n.id = nb.note_id
     WHERE nbi.id = $1 AND n.deleted_at IS NULL`,
    [imageId]
  );
  return result.rows[0] || null;
};

export const updateImageCaption = async (imageId, caption) => {
  const result = await pool.query(
    `UPDATE note_block_images SET caption = $1 WHERE id = $2 RETURNING *`,
    [caption || null, imageId]
  );
  return result.rows[0] || null;
};

export const deleteImage = async (imageId) => {
  const result = await pool.query(
    `DELETE FROM note_block_images WHERE id = $1 RETURNING image_path`,
    [imageId]
  );
  return result.rows[0]?.image_path || null;
};

export const reorderImages = async (blockId, imageIds) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < imageIds.length; i++) {
      await client.query(
        `UPDATE note_block_images SET position = $1 WHERE id = $2 AND block_id = $3`,
        [i, imageIds[i], blockId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const getImagesByBlockId = async (blockId) => {
  const result = await pool.query(
    `SELECT id FROM note_block_images WHERE block_id = $1`,
    [blockId]
  );
  return result.rows;
};

// ============================================================
// TRADES DE BLOQUE (trade_reference)
// ============================================================

export const getBlockOwner = async (blockId) => {
  const result = await pool.query(
    `SELECT n.user_id, n.id AS note_id, nb.block_type
     FROM note_blocks nb
     JOIN notes n ON n.id = nb.note_id
     WHERE nb.id = $1 AND n.deleted_at IS NULL`,
    [blockId]
  );
  return result.rows[0] || null;
};

export const addTradeToBlock = async (blockId, tradeId) => {
  // INSERT ... SELECT en un solo statement: el cálculo de posición (MAX+1) y el
  // INSERT son atómicos, sin la carrera del read-then-write anterior.
  // Devuelve null si el trade ya estaba en el bloque (ON CONFLICT) → el service
  // lo traduce a 409.
  const result = await pool.query(
    `INSERT INTO note_block_trades (block_id, trade_id, position)
     SELECT $1, $2, COALESCE(MAX(position), -1) + 1
     FROM note_block_trades WHERE block_id = $1
     ON CONFLICT (block_id, trade_id) DO NOTHING
     RETURNING *`,
    [blockId, tradeId]
  );
  return result.rows[0] || null;
};

export const removeTradeFromBlock = async (blockId, tradeId) => {
  await pool.query(
    `DELETE FROM note_block_trades WHERE block_id = $1 AND trade_id = $2`,
    [blockId, tradeId]
  );
};

// ============================================================
// TAGS
// ============================================================

export const getTags = async (userId) => {
  // Orden por nombre (no el canónico): el frontend agrupa con la lista de grupos.
  const result = await pool.query(
    `SELECT ${TAG_COLUMNS} FROM note_tags WHERE user_id = $1 ORDER BY name ASC`,
    [userId]
  );
  return result.rows;
};

// `group_id` null o ausente: Libre.
export const createTag = async (userId, { name, color, group_id }) => {
  const result = await pool.query(
    `INSERT INTO note_tags (user_id, name, color, group_id) VALUES ($1, $2, $3, $4) RETURNING ${TAG_COLUMNS}`,
    [userId, name, color || FREE_GROUP_COLOR, group_id ?? null]
  );
  return result.rows[0];
};

export const getTagByName = async (userId, name) => {
  const result = await pool.query(
    `SELECT ${TAG_COLUMNS} FROM note_tags WHERE user_id = $1 AND LOWER(name) = LOWER($2)`,
    [userId, name]
  );
  return result.rows[0] || null;
};

export const getTagById = async (userId, tagId) => {
  const result = await pool.query(
    `SELECT ${TAG_COLUMNS} FROM note_tags WHERE id = $1 AND user_id = $2`,
    [tagId, userId]
  );
  return result.rows[0] || null;
};

export const updateTag = async (userId, tagId, { name, color, group_id }) => {
  const fields = [];
  const values = [];
  let idx = 1;
  if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
  if (color !== undefined) { fields.push(`color = $${idx++}`); values.push(color); }
  if (group_id !== undefined) { fields.push(`group_id = $${idx++}`); values.push(group_id); }
  if (fields.length === 0) return await getTagById(userId, tagId);

  values.push(tagId, userId);
  const result = await pool.query(
    `UPDATE note_tags SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING ${TAG_COLUMNS}`,
    values
  );
  return result.rows[0] || null;
};

export const deleteTag = async (userId, tagId) => {
  const result = await pool.query(
    `DELETE FROM note_tags WHERE id = $1 AND user_id = $2 RETURNING id`,
    [tagId, userId]
  );
  return result.rows[0] || null;
};

// OJO: semántica replace-all (PUT-like) bajo un POST. Sustituye TODAS las
// asignaciones de la nota por `tagIds`; con `tag_ids: []` borra todos los tags.
// El validador no exige min(1) a propósito (permite "limpiar tags"). Documentado
// aquí para que no se confunda con un "añadir tags" incremental.
export const assignTags = async (noteId, tagIds) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM note_tag_assignments WHERE note_id = $1`, [noteId]);
    for (const tagId of tagIds) {
      await client.query(
        `INSERT INTO note_tag_assignments (note_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [noteId, tagId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const removeTags = async (noteId, tagIds) => {
  await pool.query(
    `DELETE FROM note_tag_assignments WHERE note_id = $1 AND tag_id = ANY($2)`,
    [noteId, tagIds]
  );
};

export const getTagsByIds = async (userId, tagIds) => {
  const result = await pool.query(
    `SELECT id, group_id FROM note_tags WHERE id = ANY($1) AND user_id = $2`,
    [tagIds, userId]
  );
  return result.rows;
};

// ============================================================
// GRUPOS DE TAGS
// ============================================================
// Libre (tags con group_id NULL) no es una fila: aquí solo están los grupos propios.

// `tag_count` va en todas las respuestas de grupos (la confirmación de borrado lo usa).
const TAG_GROUP_COLUMNS = `g.id, g.name, g.color, g.position,
  (SELECT COUNT(*) FROM note_tags t WHERE t.group_id = g.id)::int AS tag_count`;

export const getTagGroups = async (userId) => {
  const result = await pool.query(
    `SELECT ${TAG_GROUP_COLUMNS} FROM note_tag_groups g WHERE g.user_id = $1 ORDER BY g.position, g.id`,
    [userId]
  );
  return result.rows;
};

export const getTagGroupById = async (userId, groupId) => {
  const result = await pool.query(
    `SELECT ${TAG_GROUP_COLUMNS} FROM note_tag_groups g WHERE g.id = $1 AND g.user_id = $2`,
    [groupId, userId]
  );
  return result.rows[0] || null;
};

export const getTagGroupByName = async (userId, name) => {
  const result = await pool.query(
    `SELECT id, name FROM note_tag_groups WHERE user_id = $1 AND LOWER(name) = LOWER($2)`,
    [userId, name]
  );
  return result.rows[0] || null;
};

export const countTagGroups = async (userId) => {
  const result = await pool.query(`SELECT COUNT(*)::int AS n FROM note_tag_groups WHERE user_id = $1`, [userId]);
  return result.rows[0].n;
};

// El grupo nuevo va al final.
export const createTagGroup = async (userId, { name, color }) => {
  const result = await pool.query(
    `INSERT INTO note_tag_groups (user_id, name, color, position)
     SELECT $1, $2, $3, COALESCE(MAX(position) + 1, 0) FROM note_tag_groups WHERE user_id = $1
     RETURNING id, name, color, position, 0 AS tag_count`,
    [userId, name, color || FREE_GROUP_COLOR]
  );
  return result.rows[0];
};

export const updateTagGroup = async (userId, groupId, { name, color }) => {
  const fields = [];
  const values = [];
  let idx = 1;
  if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
  if (color !== undefined) { fields.push(`color = $${idx++}`); values.push(color); }
  if (fields.length === 0) return getTagGroupById(userId, groupId);

  values.push(groupId, userId);
  const result = await pool.query(
    `UPDATE note_tag_groups g SET ${fields.join(', ')} WHERE g.id = $${idx++} AND g.user_id = $${idx}
     RETURNING ${TAG_GROUP_COLUMNS}`,
    values
  );
  return result.rows[0] || null;
};

/**
 * Borra el grupo; sus tags pasan a Libre por el ON DELETE SET NULL de
 * note_tags.group_id, sin tocar sus asignaciones. `moved_tags` los cuenta con el
 * mismo snapshot que el DELETE.
 */
export const deleteTagGroup = async (userId, groupId) => {
  const result = await pool.query(
    `WITH moved AS (SELECT COUNT(*)::int AS n FROM note_tags WHERE group_id = $1 AND user_id = $2)
     DELETE FROM note_tag_groups WHERE id = $1 AND user_id = $2
     RETURNING id, (SELECT n FROM moved) AS moved_tags`,
    [groupId, userId]
  );
  return result.rows[0] || null;
};

// `groupIds` ya validado en el service: exactamente los grupos del usuario.
export const reorderTagGroups = async (userId, groupIds) => {
  await pool.query(
    `UPDATE note_tag_groups g
     SET position = (o.ord - 1)::int
     FROM unnest($2::int[]) WITH ORDINALITY AS o(id, ord)
     WHERE g.id = o.id AND g.user_id = $1`,
    [userId, groupIds]
  );
};

// ============================================================
// TAGS DE BLOQUE
// ============================================================
// note_blocks no tiene user_id: el dueño se comprueba por su nota.

// Grupos distintos entre los tags de un bloque (alias `t`), para el AND entre
// grupos. Libre (NULL) cuenta como el grupo 0: COUNT(DISTINCT) ignora los NULL,
// así que sin el COALESCE un tag Libre no sumaría y el AND no se cumpliría nunca.
const DISTINCT_TAG_GROUPS = 'COUNT(DISTINCT COALESCE(t.group_id, 0))';

/**
 * Tags de varios bloques en una sola query, en orden canónico. Devuelve un Map
 * block_id → [{ id, name, color, group_id }]; los bloques sin tags no aparecen.
 */
export const getBlockTags = async (blockIds, userId, exec = pool) => {
  const map = new Map();
  if (!blockIds || blockIds.length === 0) return map;
  const result = await exec.query(
    `SELECT a.block_id, t.id, t.name, t.color, t.group_id
     FROM note_block_tag_assignments a
     JOIN note_tags t ON t.id = a.tag_id AND t.user_id = $2
     ${tagGroupJoin('t', 'g')}
     WHERE a.block_id = ANY($1::int[])
     ORDER BY ${tagOrder('t', 'g')}`,
    [blockIds, userId]
  );
  for (const { block_id: blockId, ...tag } of result.rows) {
    if (!map.has(blockId)) map.set(blockId, []);
    map.get(blockId).push(tag);
  }
  return map;
};

// Idempotente: si el tag ya estaba, no inserta nada.
export const addBlockTag = async (blockId, tagId, userId) => {
  await pool.query(
    `INSERT INTO note_block_tag_assignments (block_id, tag_id)
     SELECT b.id, t.id
     FROM note_blocks b
     JOIN notes n ON n.id = b.note_id AND n.user_id = $3 AND n.deleted_at IS NULL
     JOIN note_tags t ON t.id = $2 AND t.user_id = $3
     WHERE b.id = $1
     ON CONFLICT DO NOTHING`,
    [blockId, tagId, userId]
  );
};

export const removeBlockTag = async (blockId, tagId, userId) => {
  await pool.query(
    `DELETE FROM note_block_tag_assignments a
     USING note_blocks b, notes n
     WHERE a.block_id = b.id AND b.note_id = n.id
       AND b.id = $1 AND a.tag_id = $2 AND n.user_id = $3`,
    [blockId, tagId, userId]
  );
};

// Tags por defecto de un bloque nuevo: copia los de su nota (§4.4 del spec).
export const copyNoteTagsToBlock = async (blockId, noteId, userId, exec = pool) => {
  await exec.query(
    `INSERT INTO note_block_tag_assignments (block_id, tag_id)
     SELECT $1::int, nta.tag_id
     FROM note_tag_assignments nta
     JOIN note_tags t ON t.id = nta.tag_id AND t.user_id = $3
     WHERE nta.note_id = $2
     ON CONFLICT DO NOTHING`,
    [blockId, noteId, userId]
  );
};

/**
 * Agrega los tags de la nota a sus bloques directos que no son referencias. Solo
 * agrega, nunca quita. Devuelve el block_id de cada asignación creada (un bloque
 * aparece una vez por tag nuevo).
 */
export const applyNoteTagsToBlocks = async (noteId, userId) => {
  const result = await pool.query(
    `INSERT INTO note_block_tag_assignments (block_id, tag_id)
     SELECT b.id, nta.tag_id
     FROM note_blocks b
     JOIN notes n ON n.id = b.note_id AND n.user_id = $2 AND n.deleted_at IS NULL
     JOIN note_tag_assignments nta ON nta.note_id = b.note_id
     JOIN note_tags t ON t.id = nta.tag_id AND t.user_id = $2
     WHERE b.note_id = $1 AND b.block_type <> 'reference'
     ON CONFLICT DO NOTHING
     RETURNING block_id`,
    [noteId, userId]
  );
  return result.rows.map((r) => r.block_id);
};

/**
 * Repaso por tag: bloques con al menos un tag seleccionado de CADA grupo presente
 * en la selección (OR dentro de un grupo, AND entre grupos). `groupCount` es el
 * número de grupos distintos entre `tagIds`, con Libre como uno más. Excluye
 * referencias, notas en la papelera y las notas ocultas de los pendientes. Cada
 * fila lleva `total` (todas las que cumplen, antes del LIMIT).
 */
export const findBlocksByTags = async (userId, tagIds, groupCount, limit) => {
  const result = await pool.query(
    `WITH matched AS (
       SELECT a.block_id
       FROM note_block_tag_assignments a
       JOIN note_tags t ON t.id = a.tag_id AND t.user_id = $1
       WHERE a.tag_id = ANY($2::int[])
       GROUP BY a.block_id
       HAVING ${DISTINCT_TAG_GROUPS} = $3
     )
     SELECT b.id AS block_id, b.note_id, n.title AS note_title, b.block_type,
            CASE WHEN b.block_type IN ('text', 'callout') THEN LEFT(b.content, 140) END AS preview,
            b.created_at, b.updated_at, b.marked_for_revisit,
            (COUNT(*) OVER ())::int AS total
     FROM matched m
     JOIN note_blocks b ON b.id = m.block_id
     JOIN notes n ON n.id = b.note_id AND n.user_id = $1
                 AND n.deleted_at IS NULL AND n.type = 'note'
     WHERE b.block_type <> 'reference'
     ORDER BY b.created_at DESC, b.id DESC
     LIMIT $4`,
    [userId, tagIds, groupCount, limit]
  );
  return result.rows;
};

// ============================================================
// BÚSQUEDA
// ============================================================

// Función de tsquery de cada modo de buildSearchQuery (note.service.js). Lista
// cerrada: el nombre va fijo en el SQL y el texto del usuario siempre como parámetro.
const TSQUERY_FNS = { prefix: 'to_tsquery', websearch: 'websearch_to_tsquery' };

/**
 * Búsqueda de bloques agrupados por nota (semántica en el service `search`).
 *
 * Dos fases, para que se usen los índices GIN de la migración 015:
 * - Fase 1 (`title_hits`, `content_hits`, `tag_hits`): candidatos por predicados
 *   que coinciden EXACTAMENTE con las expresiones indexadas
 *   (`to_tsvector('spanish', COALESCE(title|content, ''))`), así el planner usa
 *   Bitmap Index Scan sobre `idx_notes_title_fts` e `idx_note_blocks_content_fts`
 *   en vez de calcular el tsvector de todo el contenido al vuelo.
 * - Fase 2: rank sobre los bloques que cumplen, y ts_headline solo para los
 *   `snippetsPerNote` mejores de cada nota devuelta (lo caro).
 *
 * Devuelve una fila por (nota, bloque con snippet), en orden; una nota que solo
 * hace match por título trae una fila con block_id NULL. Los totales van en cada fila.
 */
const searchSql = ({ tsq, tagsParam, groupCountParam }) => {
  const hasText = Boolean(tsq);
  const hasTags = Boolean(tagsParam);

  const ctes = [];
  if (hasText) {
    ctes.push(`title_hits AS (
      SELECT n.id AS note_id
      FROM notes n
      WHERE n.user_id = $1 AND n.deleted_at IS NULL AND n.type = 'note'
        AND to_tsvector('spanish', COALESCE(n.title, '')) @@ ${tsq}
    )`);
    ctes.push(`content_hits AS (
      SELECT nb.id AS block_id
      FROM note_blocks nb
      JOIN notes n ON n.id = nb.note_id AND n.user_id = $1
      WHERE nb.block_type IN ('text', 'callout')
        AND to_tsvector('spanish', COALESCE(nb.content, '')) @@ ${tsq}
    )`);
  }
  if (hasTags) {
    // Mismo filtro que findBlocksByTags: OR dentro de un grupo, AND entre grupos.
    ctes.push(`tag_hits AS (
      SELECT a.block_id
      FROM note_block_tag_assignments a
      JOIN note_tags t ON t.id = a.tag_id AND t.user_id = $1
      WHERE a.tag_id = ANY(${tagsParam}::int[])
      GROUP BY a.block_id
      HAVING ${DISTINCT_TAG_GROUPS} = ${groupCountParam}
    )`);
  }

  const contentOrTitle = `(b.id IN (SELECT block_id FROM content_hits)
                           OR b.note_id IN (SELECT note_id FROM title_hits))`;
  let blockFilter = 'b.id IN (SELECT block_id FROM content_hits)';
  if (hasTags) blockFilter = 'b.id IN (SELECT block_id FROM tag_hits)';
  if (hasTags && hasText) blockFilter += ` AND ${contentOrTitle}`;

  // Solo texto: también las notas cuyo título hace match aunque ningún bloque lo haga.
  const hitNotes =
    hasText && !hasTags
      ? 'SELECT note_id FROM matched UNION SELECT note_id FROM title_hits'
      : 'SELECT DISTINCT note_id FROM matched';

  const blockRank = hasText ? `ts_rank(to_tsvector('spanish', COALESCE(b.content, '')), ${tsq})` : '0';
  const noteRank = hasText
    ? `ts_rank(to_tsvector('spanish', COALESCE(n.title, '')), ${tsq}) * 2 + COALESCE(s.best_rank, 0)`
    : '0';
  const noteOrder = hasText ? 'rank DESC, updated_at DESC, id DESC' : 'last_created DESC NULLS LAST, id DESC';
  const snippetOrder = hasText
    ? 'm.rank DESC, m.position COLLATE "C", m.block_id'
    : 'm.created_at DESC, m.block_id DESC';
  // Con texto + tags, un bloque puede entrar por el título de su nota sin que su
  // contenido haga match: ts_headline devolvería solo las primeras MinWords palabras.
  const snippet = hasText
    ? `CASE WHEN to_tsvector('spanish', COALESCE(b.content, '')) @@ ${tsq}
         THEN ts_headline('spanish', COALESCE(b.content, ''), ${tsq},
           'MaxWords=20, MinWords=5, MaxFragments=2, FragmentDelimiter=" … "')
         ELSE LEFT(b.content, 140) END`
    : 'LEFT(b.content, 140)';

  return `
    WITH ${ctes.join(',\n')},
    matched AS (
      SELECT b.id AS block_id, b.note_id, b.position, b.created_at, ${blockRank} AS rank
      FROM note_blocks b
      JOIN notes n ON n.id = b.note_id AND n.user_id = $1 AND n.deleted_at IS NULL AND n.type = 'note'
      WHERE b.block_type <> 'reference' AND ${blockFilter}
    ),
    hit_notes AS (${hitNotes}),
    scored AS (
      SELECT n.id, n.title, n.parent_note_id, n.updated_at,
             COALESCE(s.block_count, 0)::int AS block_count, s.last_created,
             ${noteRank} AS rank
      FROM hit_notes h
      JOIN notes n ON n.id = h.note_id
      LEFT JOIN (
        SELECT note_id, COUNT(*) AS block_count, MAX(rank) AS best_rank, MAX(created_at) AS last_created
        FROM matched GROUP BY note_id
      ) s ON s.note_id = n.id
    ),
    top_notes AS (
      SELECT *, ROW_NUMBER() OVER (ORDER BY ${noteOrder}) AS ord
      FROM scored
      ORDER BY ord
      LIMIT $2
    ),
    -- block_ids en orden de resultados (nota, y dentro de la nota por posición),
    -- con tope global $3.
    numbered AS (
      SELECT m.note_id, m.block_id,
             ROW_NUMBER() OVER (ORDER BY t.ord, m.position COLLATE "C", m.block_id) AS seq
      FROM matched m
      JOIN top_notes t ON t.id = m.note_id
    )
    SELECT t.id, t.title, t.parent_note_id, t.updated_at, t.block_count,
           -- HighlightAll: el título entero (con MaxWords se cortaba aunque no hiciera match).
           ${hasText ? `ts_headline('spanish', COALESCE(t.title, ''), ${tsq}, 'HighlightAll=true')` : 'NULL'}
             AS title_headline,
           ${hasText ? 't.id IN (SELECT note_id FROM title_hits)' : 'false'} AS title_match,
           COALESCE(
             (SELECT array_agg(x.block_id ORDER BY x.seq) FROM numbered x WHERE x.note_id = t.id AND x.seq <= $3),
             '{}'
           ) AS block_ids,
           sn.block_id, sn.block_type, sn.snippet, sn.created_at AS block_created_at,
           (SELECT COUNT(*) FROM scored)::int AS total_notes,
           (SELECT COUNT(*) FROM matched)::int AS total_blocks,
           (SELECT COUNT(*) FROM numbered) > $3 AS truncated
    FROM top_notes t
    LEFT JOIN LATERAL (
      SELECT b.id AS block_id, b.block_type, b.created_at, sel.snip_ord,
             CASE WHEN b.block_type IN ('text', 'callout') THEN ${snippet} END AS snippet
      FROM (
        SELECT m.block_id, ROW_NUMBER() OVER (ORDER BY ${snippetOrder}) AS snip_ord
        FROM matched m
        WHERE m.note_id = t.id
        ORDER BY snip_ord
        LIMIT $4
      ) sel
      JOIN note_blocks b ON b.id = sel.block_id
    ) sn ON true
    ORDER BY t.ord, sn.snip_ord`;
};

/**
 * `query`: { text, mode } de buildSearchQuery, o null sin texto. `tagIds` y
 * `groupCount` vienen validados del service ([] y 0 sin tags). Devuelve
 * { notes, total_notes, total_blocks, truncated }.
 */
export const search = async (userId, { query, tagIds, groupCount, limit, maxIds, snippetsPerNote }) => {
  // $1 usuario, $2 notas, $3 tope de block_ids, $4 snippets por nota; el resto, según el caso.
  const params = [userId, limit, maxIds, snippetsPerNote];
  let tsq = null;
  if (query) {
    const fn = TSQUERY_FNS[query.mode];
    if (!fn) throw new Error(`Modo de búsqueda desconocido: ${query.mode}`);
    params.push(query.text);
    tsq = `${fn}('spanish', $${params.length})`;
  }
  let tagsParam = null;
  let groupCountParam = null;
  if (tagIds.length > 0) {
    params.push(tagIds, groupCount);
    tagsParam = `$${params.length - 1}`;
    groupCountParam = `$${params.length}`;
  }

  const { rows } = await pool.query(searchSql({ tsq, tagsParam, groupCountParam }), params);

  const blockTags = await getBlockTags(
    rows.filter((r) => r.block_id !== null).map((r) => r.block_id),
    userId
  );
  const notes = [];
  for (const row of rows) {
    let note = notes.at(-1);
    if (note?.id !== row.id) {
      note = {
        id: row.id,
        title: row.title,
        parent_note_id: row.parent_note_id,
        updated_at: row.updated_at,
        title_headline: row.title_headline,
        title_match: row.title_match,
        block_count: row.block_count,
        blocks: [],
        block_ids: row.block_ids,
      };
      notes.push(note);
    }
    if (row.block_id !== null) {
      note.blocks.push({
        block_id: row.block_id,
        block_type: row.block_type,
        snippet: row.snippet,
        tags: blockTags.get(row.block_id) ?? [],
        created_at: row.block_created_at,
      });
    }
  }

  return {
    notes,
    total_notes: rows[0]?.total_notes ?? 0,
    total_blocks: rows[0]?.total_blocks ?? 0,
    truncated: rows[0]?.truncated ?? false,
  };
};

// ============================================================
// EXPORTACIÓN
// ============================================================

export const getFullTree = async (userId) => {
  const notesResult = await pool.query(
    `SELECT n.id, n.parent_note_id, n.title, n.position, n.created_at,
      COALESCE(
        (SELECT json_agg(nt.name ORDER BY ${tagOrder('nt', 'g')})
         FROM note_tag_assignments nta
         JOIN note_tags nt ON nt.id = nta.tag_id
         ${tagGroupJoin('nt', 'g')}
         WHERE nta.note_id = n.id), '[]'
      ) as tag_names
    FROM notes n
    WHERE n.user_id = $1 AND n.deleted_at IS NULL AND n.type = 'note'
    ORDER BY n.position COLLATE "C" ASC, n.created_at ASC`,
    [userId]
  );

  const blocksResult = await pool.query(
    `SELECT nb.id, nb.note_id, nb.block_type, nb.content, nb.metadata, nb.linked_note_id, nb.position,
      ln.title as linked_note_title,
      COALESCE(
        (SELECT json_agg(
          json_build_object('filename', nbi.image_path, 'caption', nbi.caption)
          ORDER BY nbi.position ASC
        )
        FROM note_block_images nbi WHERE nbi.block_id = nb.id), '[]'
      ) as images,
      COALESCE(
        (SELECT json_agg(
          json_build_object('id', t.id, 'symbol', t.symbol)
          ORDER BY nbt.position ASC
        )
        FROM note_block_trades nbt
        LEFT JOIN trades t ON t.id = nbt.trade_id AND t.deleted_at IS NULL
        WHERE nbt.block_id = nb.id), '[]'
      ) as trades
    FROM note_blocks nb
    JOIN notes n ON n.id = nb.note_id
    LEFT JOIN notes ln ON ln.id = nb.linked_note_id AND ln.deleted_at IS NULL AND ln.user_id = $1
    WHERE n.user_id = $1 AND n.deleted_at IS NULL AND n.type = 'note'
    ORDER BY nb.position COLLATE "C" ASC`,
    [userId]
  );

  // `group_name` NULL: Libre.
  const tagsResult = await pool.query(
    `SELECT t.id, t.name, t.color, t.group_id, g.name AS group_name
     FROM note_tags t
     ${tagGroupJoin('t', 'g')}
     WHERE t.user_id = $1
     ORDER BY t.name ASC`,
    [userId]
  );

  // Todas las asignaciones de bloques del usuario en una sola query, en orden
  // canónico dentro de cada bloque: cada bloque recibe `tag_names`.
  const blockTagsResult = await pool.query(
    `SELECT a.block_id, t.name
     FROM note_block_tag_assignments a
     JOIN note_tags t ON t.id = a.tag_id AND t.user_id = $1
     ${tagGroupJoin('t', 'g')}
     ORDER BY a.block_id, ${tagOrder('t', 'g')}`,
    [userId]
  );
  const tagNamesByBlock = new Map();
  for (const { block_id: blockId, name } of blockTagsResult.rows) {
    if (!tagNamesByBlock.has(blockId)) tagNamesByBlock.set(blockId, []);
    tagNamesByBlock.get(blockId).push(name);
  }
  for (const block of blocksResult.rows) block.tag_names = tagNamesByBlock.get(block.id) ?? [];

  return {
    notes: notesResult.rows,
    blocks: blocksResult.rows,
    tags: tagsResult.rows,
  };
};

// ============================================================
// SEGUIMIENTO DE BLOQUES
// ============================================================

export const setFollowUp = async (blockId, userId, requiresFollowUp) => {
  const result = await pool.query(
    `UPDATE note_blocks nb
     SET requires_follow_up = $3
     FROM notes n
     WHERE nb.id = $1 AND nb.note_id = n.id AND n.user_id = $2 AND n.deleted_at IS NULL
     RETURNING nb.*`,
    [blockId, userId, requiresFollowUp]
  );
  return result.rows[0] || null;
};

export const findPendingFollowUp = async (userId, hoursBack = null) => {
  const params = [userId];
  let timeFilter = '';
  if (hoursBack !== null) {
    params.push(hoursBack);
    timeFilter = `AND b.updated_at >= NOW() - ($${params.length} || ' hours')::INTERVAL`;
  }
  const result = await pool.query(
    `SELECT b.id, b.note_id, b.block_type, b.content, b.metadata,
            b.requires_follow_up, b.created_at, b.updated_at,
            n.title AS note_title, n.parent_note_id AS note_parent_id
     FROM note_blocks b
     INNER JOIN notes n ON n.id = b.note_id
     WHERE n.user_id = $1
       AND b.requires_follow_up = true
       AND n.deleted_at IS NULL
       AND n.type = 'note'
       ${timeFilter}
     ORDER BY b.updated_at ASC
     LIMIT 200`,
    params
  );
  return result.rows;
};

// ============================================================
// REPASO DE BLOQUES
// ============================================================

export const setRevisit = async (blockId, userId, markedForRevisit) => {
  const result = await pool.query(
    `UPDATE note_blocks nb
     SET marked_for_revisit = $3
     FROM notes n
     WHERE nb.id = $1 AND nb.note_id = n.id AND n.user_id = $2 AND n.deleted_at IS NULL
     RETURNING nb.*`,
    [blockId, userId, markedForRevisit]
  );
  return result.rows[0] || null;
};

export const findMarkedForRevisit = async (userId, hoursBack = null) => {
  const params = [userId];
  let timeFilter = '';
  if (hoursBack !== null) {
    params.push(hoursBack);
    timeFilter = `AND b.updated_at >= NOW() - ($${params.length} || ' hours')::INTERVAL`;
  }
  const result = await pool.query(
    `SELECT b.id, b.note_id, b.block_type, b.content, b.metadata,
            b.marked_for_revisit, b.created_at, b.updated_at,
            n.title AS note_title, n.parent_note_id AS note_parent_id
     FROM note_blocks b
     INNER JOIN notes n ON n.id = b.note_id
     WHERE n.user_id = $1
       AND b.marked_for_revisit = true
       AND n.deleted_at IS NULL
       AND n.type = 'note'
       ${timeFilter}
     ORDER BY b.updated_at ASC
     LIMIT 200`,
    params
  );
  return result.rows;
};

export const findRecentActivity = async (userId, hoursBack) => {
  const result = await pool.query(
    `SELECT b.id, b.note_id, b.block_type, b.content, b.metadata,
            b.requires_follow_up, b.created_at, b.updated_at,
            n.title AS note_title, n.parent_note_id AS note_parent_id
     FROM note_blocks b
     INNER JOIN notes n ON n.id = b.note_id
     WHERE n.user_id = $1
       AND b.updated_at >= NOW() - ($2 || ' hours')::INTERVAL
       AND n.deleted_at IS NULL
       AND n.type = 'note'
     ORDER BY b.updated_at DESC
     LIMIT 200`,
    [userId, hoursBack]
  );
  return result.rows;
};
