import { pool } from '../config/database.js';
import { generateKeyBetween } from 'fractional-indexing';

// ============================================================
// NOTAS
// ============================================================

export const getTree = async (userId) => {
  const result = await pool.query(
    `SELECT n.id, n.parent_note_id, n.title, n.position, n.type, n.created_at, n.updated_at,
      (SELECT COUNT(*) FROM note_blocks nb WHERE nb.note_id = n.id) as block_count,
      COALESCE(
        (SELECT json_agg(json_build_object('id', nt.id, 'name', nt.name, 'color', nt.color))
         FROM note_tag_assignments nta
         JOIN note_tags nt ON nt.id = nta.tag_id
         WHERE nta.note_id = n.id), '[]'
      ) as tags
    FROM notes n
    WHERE n.user_id = $1 AND n.deleted_at IS NULL
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
    `SELECT nb.*,
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
      ln.title as linked_note_title
    FROM note_blocks nb
    LEFT JOIN notes ln ON ln.id = nb.linked_note_id AND ln.deleted_at IS NULL AND ln.user_id = $2
    WHERE nb.note_id = $1
    ORDER BY nb.position COLLATE "C" ASC`,
    [noteId, userId]
  );

  const tagsResult = await pool.query(
    `SELECT nt.id, nt.name, nt.color
    FROM note_tag_assignments nta
    JOIN note_tags nt ON nt.id = nta.tag_id
    WHERE nta.note_id = $1`,
    [noteId]
  );

  const note = noteResult.rows[0];
  note.blocks = blocksResult.rows;
  note.tags = tagsResult.rows;
  return note;
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

export const softDelete = async (userId, noteId) => {
  // Cap de profundidad (depth < 100) + DISTINCT como guard anti-ciclos: si por una
  // carrera quedara un ciclo en el árbol, el CTE no entra en recursión infinita.
  // `AND deleted_at IS NULL` en el UPDATE evita re-marcar descendientes ya borrados
  // (que perderían su deleted_at original).
  const result = await pool.query(
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
     WHERE parent_note_id IS NOT DISTINCT FROM $1 AND user_id = $2 AND deleted_at IS NULL`,
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

export const deleteBlock = async (blockId) => {
  // Un solo statement: borra las imágenes (RETURNING sus paths) y el bloque de forma
  // atómica. Antes eran dos queries: una imagen añadida entre el SELECT y el DELETE
  // quedaba huérfana en disco.
  const result = await pool.query(
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
  const result = await pool.query(
    `SELECT id, name, color, created_at FROM note_tags WHERE user_id = $1 ORDER BY name ASC`,
    [userId]
  );
  return result.rows;
};

export const createTag = async (userId, { name, color }) => {
  const result = await pool.query(
    `INSERT INTO note_tags (user_id, name, color) VALUES ($1, $2, $3) RETURNING *`,
    [userId, name, color || '#6B7280']
  );
  return result.rows[0];
};

export const getTagByName = async (userId, name) => {
  const result = await pool.query(
    `SELECT * FROM note_tags WHERE user_id = $1 AND LOWER(name) = LOWER($2)`,
    [userId, name]
  );
  return result.rows[0] || null;
};

export const getTagById = async (userId, tagId) => {
  const result = await pool.query(
    `SELECT * FROM note_tags WHERE id = $1 AND user_id = $2`,
    [tagId, userId]
  );
  return result.rows[0] || null;
};

export const updateTag = async (userId, tagId, { name, color }) => {
  const fields = [];
  const values = [];
  let idx = 1;
  if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
  if (color !== undefined) { fields.push(`color = $${idx++}`); values.push(color); }
  if (fields.length === 0) return await getTagById(userId, tagId);

  values.push(tagId, userId);
  const result = await pool.query(
    `UPDATE note_tags SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
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
    `SELECT id FROM note_tags WHERE id = ANY($1) AND user_id = $2`,
    [tagIds, userId]
  );
  return result.rows;
};

// ============================================================
// BÚSQUEDA
// ============================================================

const TAGS_AGG = `COALESCE(
    (SELECT json_agg(json_build_object('id', nt.id, 'name', nt.name, 'color', nt.color))
     FROM note_tag_assignments nta
     JOIN note_tags nt ON nt.id = nta.tag_id
     WHERE nta.note_id = n.id), '[]'
  )`;

const TAG_FILTER = `($2 = '{}'::int[] OR EXISTS (
    SELECT 1 FROM note_tag_assignments nta_f
    WHERE nta_f.note_id = n.id AND nta_f.tag_id = ANY($2)
  ))`;

// Búsqueda FTS en dos fases para que se usen los índices GIN de la migración 015.
//
// Fase 1 (CTE `candidates`): obtiene los note_id que hacen match vía predicados
// que coinciden EXACTAMENTE con las expresiones indexadas
// (`to_tsvector('spanish', COALESCE(title|content, ''))`), de modo que el planner
// use Bitmap Index Scan sobre `idx_notes_title_fts` e `idx_note_blocks_content_fts`
// en vez de un seq scan calculando el tsvector de todo el contenido al vuelo.
//
// Fase 2: calcula rank, ts_headline y tags SOLO para esos candidatos (conjunto
// chico). El ranking, los snippets y el orden son idénticos a la versión anterior.
const FTS_QUERY = `
  WITH candidates AS (
    SELECT n.id AS note_id
    FROM notes n
    WHERE n.user_id = $2
      AND n.deleted_at IS NULL
      AND n.type = 'note'
      AND to_tsvector('spanish', COALESCE(n.title, '')) @@ websearch_to_tsquery('spanish', $1)
    UNION
    SELECT nb.note_id
    FROM note_blocks nb
    WHERE nb.block_type IN ('text', 'callout')
      AND to_tsvector('spanish', COALESCE(nb.content, '')) @@ websearch_to_tsquery('spanish', $1)
  )
  SELECT
    n.id, n.title, n.parent_note_id, n.updated_at,
    ts_rank(to_tsvector('spanish', COALESCE(n.title, '')), websearch_to_tsquery('spanish', $1)) * 2
      + COALESCE(nb.content_rank, 0) AS rank,
    ts_headline('spanish', COALESCE(n.title, ''), websearch_to_tsquery('spanish', $1),
      'MaxWords=8, MinWords=3, MaxFragments=1') AS title_headline,
    COALESCE(ts_headline('spanish', COALESCE(nb.content_agg, ''), websearch_to_tsquery('spanish', $1),
      'MaxWords=20, MinWords=5, MaxFragments=2, FragmentDelimiter=" … "'), '') AS content_snippet,
    ${TAGS_AGG} AS tags
  FROM notes n
  LEFT JOIN LATERAL (
    SELECT
      string_agg(content, ' ' ORDER BY position) AS content_agg,
      MAX(ts_rank(to_tsvector('spanish', COALESCE(content, '')), websearch_to_tsquery('spanish', $1))) AS content_rank
    FROM note_blocks
    WHERE note_id = n.id AND block_type IN ('text', 'callout')
  ) nb ON true
  WHERE
    n.id IN (SELECT note_id FROM candidates)
    AND n.user_id = $2
    AND n.deleted_at IS NULL
    AND n.type = 'note'
    AND ($3 = '{}'::int[] OR EXISTS (
      SELECT 1 FROM note_tag_assignments nta_f
      WHERE nta_f.note_id = n.id AND nta_f.tag_id = ANY($3)
    ))
  ORDER BY rank DESC, n.updated_at DESC
  LIMIT $4
`;

const TAG_ONLY_QUERY = `
  SELECT
    n.id, n.title, n.parent_note_id, n.updated_at,
    0 AS rank,
    n.title AS title_headline,
    '' AS content_snippet,
    ${TAGS_AGG} AS tags
  FROM notes n
  WHERE
    n.user_id = $1
    AND n.deleted_at IS NULL
    AND n.type = 'note'
    AND ${TAG_FILTER}
  ORDER BY n.updated_at DESC
  LIMIT $3
`;

export const search = async (userId, { q = '', tagIds = [], limit = 30 }) => {
  if (q) {
    const result = await pool.query(FTS_QUERY, [q, userId, tagIds, limit]);
    return result.rows;
  }
  const result = await pool.query(TAG_ONLY_QUERY, [userId, tagIds, limit]);
  return result.rows;
};

// ============================================================
// EXPORTACIÓN
// ============================================================

export const getFullTree = async (userId) => {
  const notesResult = await pool.query(
    `SELECT n.id, n.parent_note_id, n.title, n.position, n.created_at,
      COALESCE(
        (SELECT json_agg(nt.name ORDER BY nt.name)
         FROM note_tag_assignments nta
         JOIN note_tags nt ON nt.id = nta.tag_id
         WHERE nta.note_id = n.id), '[]'
      ) as tag_names
    FROM notes n
    WHERE n.user_id = $1 AND n.deleted_at IS NULL AND n.type = 'note'
    ORDER BY n.position COLLATE "C" ASC, n.created_at ASC`,
    [userId]
  );

  const blocksResult = await pool.query(
    `SELECT nb.id, nb.note_id, nb.block_type, nb.content, nb.linked_note_id, nb.position,
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
    WHERE n.user_id = $1 AND n.deleted_at IS NULL
    ORDER BY nb.position COLLATE "C" ASC`,
    [userId]
  );

  const tagsResult = await pool.query(
    `SELECT id, name, color FROM note_tags WHERE user_id = $1 ORDER BY name ASC`,
    [userId]
  );

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
     ORDER BY b.updated_at DESC
     LIMIT 200`,
    [userId, hoursBack]
  );
  return result.rows;
};
