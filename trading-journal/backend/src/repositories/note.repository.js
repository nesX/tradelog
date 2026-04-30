import { pool } from '../config/database.js';
import { generateKeyBetween } from 'fractional-indexing';

// ============================================================
// NOTAS
// ============================================================

export const getTree = async (userId) => {
  const result = await pool.query(
    `SELECT n.id, n.parent_note_id, n.title, n.position, n.created_at, n.updated_at,
      (SELECT COUNT(*) FROM note_blocks nb WHERE nb.note_id = n.id) as block_count,
      COALESCE(
        (SELECT json_agg(json_build_object('id', nt.id, 'name', nt.name, 'color', nt.color))
         FROM note_tag_assignments nta
         JOIN note_tags nt ON nt.id = nta.tag_id
         WHERE nta.note_id = n.id), '[]'
      ) as tags
    FROM notes n
    WHERE n.user_id = $1 AND n.deleted_at IS NULL
    ORDER BY n.position ASC, n.created_at ASC`,
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
      ln.title as linked_note_title
    FROM note_blocks nb
    LEFT JOIN notes ln ON ln.id = nb.linked_note_id AND ln.deleted_at IS NULL
    WHERE nb.note_id = $1
    ORDER BY nb.position ASC`,
    [noteId]
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

export const create = async (userId, { title = 'Sin título', parent_note_id = null }) => {
  const lastResult = await pool.query(
    `SELECT MAX(position) as last_pos
     FROM notes
     WHERE user_id = $1 AND parent_note_id IS NOT DISTINCT FROM $2 AND deleted_at IS NULL`,
    [userId, parent_note_id]
  );
  const position = generateKeyBetween(lastResult.rows[0]?.last_pos || null, null);

  const result = await pool.query(
    `INSERT INTO notes (user_id, parent_note_id, title, position)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, parent_note_id, title, position]
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
  const result = await pool.query(
    `WITH RECURSIVE descendants AS (
      SELECT id FROM notes WHERE id = $1 AND user_id = $2
      UNION ALL
      SELECT n.id FROM notes n INNER JOIN descendants d ON n.parent_note_id = d.id
    )
    UPDATE notes SET deleted_at = NOW() WHERE id IN (SELECT id FROM descendants)
    RETURNING id`,
    [noteId, userId]
  );
  return result.rows.map((r) => r.id);
};

export const isDescendant = async (noteId, targetId) => {
  const result = await pool.query(
    `WITH RECURSIVE descendants AS (
      SELECT id FROM notes WHERE id = $1
      UNION ALL
      SELECT n.id FROM notes n INNER JOIN descendants d ON n.parent_note_id = d.id
    )
    SELECT EXISTS(SELECT 1 FROM descendants WHERE id = $2) as is_descendant`,
    [noteId, targetId]
  );
  return result.rows[0].is_descendant;
};

export const move = async (userId, noteId, newParentId) => {
  const result = await pool.query(
    `UPDATE notes SET parent_note_id = $1 WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING *`,
    [newParentId, noteId, userId]
  );
  return result.rows[0] || null;
};

export const reorderSiblings = async (userId, noteIds) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let prev = null;
    for (const noteId of noteIds) {
      const key = generateKeyBetween(prev, null);
      await client.query(
        `UPDATE notes SET position = $1 WHERE id = $2 AND user_id = $3`,
        [key, noteId, userId]
      );
      prev = key;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Obtener todas las notas (IDs) de una lista de IDs para validación
// ============================================================
// DRAG & DROP — NOTAS
// ============================================================

/**
 * Obtiene todos los IDs de descendientes de una nota (recursivo).
 * Usado para validar ciclos al mover.
 */
export const getDescendantIds = async (noteId) => {
  const result = await pool.query(
    `WITH RECURSIVE descendants AS (
       SELECT id FROM notes
       WHERE parent_note_id = $1 AND deleted_at IS NULL
       UNION ALL
       SELECT n.id FROM notes n
       INNER JOIN descendants d ON n.parent_note_id = d.id
       WHERE n.deleted_at IS NULL
     )
     SELECT id FROM descendants`,
    [noteId]
  );
  return result.rows.map((r) => r.id);
};

/**
 * Busca una nota verificando propiedad del usuario.
 */
export const findNoteByIdAndUser = async (noteId, userId) => {
  const result = await pool.query(
    `SELECT id, user_id, parent_note_id, title, position
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
export const getLastChildPosition = async (parentNoteId) => {
  const result = await pool.query(
    `SELECT position FROM notes
     WHERE parent_note_id = $1 AND deleted_at IS NULL
     ORDER BY position DESC
     LIMIT 1`,
    [parentNoteId]
  );
  return result.rows[0]?.position || null;
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
export const getSiblingPositions = async (parentNoteId, userId, targetPosition, side) => {
  const isRoot = parentNoteId === null;
  const parentClause = isRoot
    ? 'parent_note_id IS NULL AND user_id = $2'
    : 'parent_note_id = $2';
  const parentParam = isRoot ? userId : parentNoteId;

  if (side === 'above') {
    const before = await pool.query(
      `SELECT position FROM notes
       WHERE ${parentClause} AND deleted_at IS NULL AND position < $1
       ORDER BY position DESC LIMIT 1`,
      [targetPosition, parentParam]
    );
    return { before: before.rows[0]?.position || null, after: targetPosition };
  } else {
    const after = await pool.query(
      `SELECT position FROM notes
       WHERE ${parentClause} AND deleted_at IS NULL AND position > $1
       ORDER BY position ASC LIMIT 1`,
      [targetPosition, parentParam]
    );
    return { before: targetPosition, after: after.rows[0]?.position || null };
  }
};

/**
 * Persiste el move: actualiza padre y posición en una sola fila.
 */
export const updateNoteParentAndPosition = async (noteId, newParentId, newPosition, userId) => {
  const result = await pool.query(
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
export const findBlockByIdAndUser = async (blockId, userId) => {
  const result = await pool.query(
    `SELECT b.id, b.note_id, b.position, b.block_type
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
export const getSiblingBlockPositions = async (noteId, targetPosition, side) => {
  if (side === 'above') {
    const before = await pool.query(
      `SELECT position FROM note_blocks
       WHERE note_id = $1 AND position < $2
       ORDER BY position DESC LIMIT 1`,
      [noteId, targetPosition]
    );
    return { before: before.rows[0]?.position || null, after: targetPosition };
  } else {
    const after = await pool.query(
      `SELECT position FROM note_blocks
       WHERE note_id = $1 AND position > $2
       ORDER BY position ASC LIMIT 1`,
      [noteId, targetPosition]
    );
    return { before: targetPosition, after: after.rows[0]?.position || null };
  }
};

/**
 * Actualiza solo la posición de un bloque (single-row UPDATE).
 */
export const updateBlockPosition = async (blockId, newPosition, userId) => {
  const result = await pool.query(
    `UPDATE note_blocks b
     SET position = $1, updated_at = NOW()
     FROM notes n
     WHERE b.id = $2 AND b.note_id = n.id
       AND n.user_id = $3 AND n.deleted_at IS NULL
     RETURNING b.*`,
    [newPosition, blockId, userId]
  );
  return result.rows[0] || null;
};

export const getNotesByIds = async (userId, noteIds) => {
  const result = await pool.query(
    `SELECT id, parent_note_id FROM notes
     WHERE id = ANY($1) AND user_id = $2 AND deleted_at IS NULL`,
    [noteIds, userId]
  );
  return result.rows;
};

// Obtener imágenes de todos los bloques de notas dadas (para limpieza de archivos)
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

// ============================================================
// BLOQUES
// ============================================================

export const createBlock = async (noteId, { block_type, content = null, linked_note_id = null, position, metadata = {} }) => {
  const allBlocksResult = await pool.query(
    `SELECT position FROM note_blocks WHERE note_id = $1 ORDER BY position ASC`,
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

  const pos = generateKeyBetween(before, after);

  const result = await pool.query(
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
  const imagesResult = await pool.query(
    `SELECT image_path FROM note_block_images WHERE block_id = $1`,
    [blockId]
  );
  await pool.query(`DELETE FROM note_blocks WHERE id = $1`, [blockId]);
  return imagesResult.rows.map((r) => r.image_path);
};

export const reorderBlocks = async (noteId, blockIds) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let prev = null;
    for (const blockId of blockIds) {
      const key = generateKeyBetween(prev, null);
      await client.query(
        `UPDATE note_blocks SET position = $1 WHERE id = $2 AND note_id = $3`,
        [key, blockId, noteId]
      );
      prev = key;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const getBlocksByNoteId = async (noteId) => {
  const result = await pool.query(
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

const FTS_QUERY = `
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
      MAX(ts_rank(to_tsvector('spanish', COALESCE(content, '')), websearch_to_tsquery('spanish', $1))) AS content_rank,
      bool_or(to_tsvector('spanish', COALESCE(content, '')) @@ websearch_to_tsquery('spanish', $1)) AS content_match
    FROM note_blocks
    WHERE note_id = n.id AND block_type IN ('text', 'callout')
  ) nb ON true
  WHERE
    n.user_id = $2
    AND n.deleted_at IS NULL
    AND ($3 = '{}'::int[] OR EXISTS (
      SELECT 1 FROM note_tag_assignments nta_f
      WHERE nta_f.note_id = n.id AND nta_f.tag_id = ANY($3)
    ))
    AND (
      to_tsvector('spanish', COALESCE(n.title, '')) @@ websearch_to_tsquery('spanish', $1)
      OR nb.content_match = true
    )
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
    WHERE n.user_id = $1 AND n.deleted_at IS NULL
    ORDER BY n.position ASC, n.created_at ASC`,
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
      ) as images
    FROM note_blocks nb
    JOIN notes n ON n.id = nb.note_id
    LEFT JOIN notes ln ON ln.id = nb.linked_note_id AND ln.deleted_at IS NULL
    WHERE n.user_id = $1 AND n.deleted_at IS NULL
    ORDER BY nb.position ASC`,
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
