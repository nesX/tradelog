import { pool } from '../config/database.js';
import { generateKeyBetween } from 'fractional-indexing';

// ============================================================
// LISTAS
// ============================================================

// Cantidad de pendientes que se devuelven como vista previa de cada lista.
const PREVIEW_ITEMS_LIMIT = 5;

export const getLists = async (userId) => {
  const result = await pool.query(
    `SELECT l.id, l.name, l.position, l.created_at, l.updated_at,
      (SELECT COUNT(*)::int FROM todo_items ti
       WHERE ti.list_id = l.id AND ti.completed_at IS NULL) AS pending_count,
      COALESCE((
        SELECT json_agg(json_build_object('id', p.id, 'title', p.title)
                        ORDER BY p.position COLLATE "C" ASC, p.created_at ASC)
        FROM (
          SELECT ti.id, ti.title, ti.position, ti.created_at FROM todo_items ti
          WHERE ti.list_id = l.id AND ti.completed_at IS NULL
          ORDER BY ti.position COLLATE "C" ASC, ti.created_at ASC
          LIMIT $2
        ) p
      ), '[]'::json) AS preview_items
    FROM todo_lists l
    WHERE l.user_id = $1
    ORDER BY l.position COLLATE "C" ASC, l.created_at ASC`,
    [userId, PREVIEW_ITEMS_LIMIT]
  );
  return result.rows;
};

export const getListById = async (userId, listId, exec = pool) => {
  const result = await exec.query(
    `SELECT * FROM todo_lists WHERE id = $1 AND user_id = $2`,
    [listId, userId]
  );
  return result.rows[0] || null;
};

export const createList = async (userId, name, exec = pool) => {
  const lastResult = await exec.query(
    `SELECT position FROM todo_lists
     WHERE user_id = $1
     ORDER BY position COLLATE "C" DESC
     LIMIT 1`,
    [userId]
  );
  const position = generateKeyBetween(lastResult.rows[0]?.position ?? null, null);

  const result = await exec.query(
    `INSERT INTO todo_lists (user_id, name, position)
     VALUES ($1, $2, $3)
     RETURNING *, 0 AS pending_count, '[]'::json AS preview_items`,
    [userId, name, position]
  );
  return result.rows[0];
};

export const updateListName = async (userId, listId, name) => {
  const result = await pool.query(
    `UPDATE todo_lists SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
    [name, listId, userId]
  );
  return result.rows[0] || null;
};

// Soft-delete de las notas de contenido de todos los items de la lista. Sus
// imágenes las elimina después la purga diferida de notas (purgeDeletedNotes).
export const softDeleteListNotes = async (listId, exec = pool) => {
  await exec.query(
    `UPDATE notes SET deleted_at = NOW()
     WHERE id IN (SELECT note_id FROM todo_items WHERE list_id = $1)
       AND deleted_at IS NULL`,
    [listId]
  );
};

// Borra la lista; ON DELETE CASCADE arrastra sus items.
export const deleteList = async (listId, exec = pool) => {
  await exec.query(`DELETE FROM todo_lists WHERE id = $1`, [listId]);
};

// ============================================================
// ITEMS
// ============================================================

// has_content: el item tiene algo más que el título (texto no vacío o imágenes).
const ITEM_COLUMNS = `
  ti.id, ti.list_id, ti.note_id, ti.title, ti.position, ti.completed_at,
  ti.created_at, ti.updated_at,
  EXISTS (
    SELECT 1 FROM note_blocks nb
    WHERE nb.note_id = ti.note_id
      AND (COALESCE(TRIM(nb.content), '') <> ''
           OR EXISTS (SELECT 1 FROM note_block_images nbi WHERE nbi.block_id = nb.id))
  ) AS has_content
`;

export const getItems = async (listId) => {
  const result = await pool.query(
    `SELECT ${ITEM_COLUMNS}
     FROM todo_items ti
     WHERE ti.list_id = $1
     ORDER BY ti.position COLLATE "C" ASC, ti.created_at ASC`,
    [listId]
  );
  return result.rows;
};

// Item con ownership verificado vía su lista.
export const getItemById = async (userId, itemId, exec = pool) => {
  const result = await exec.query(
    `SELECT ti.*
     FROM todo_items ti
     JOIN todo_lists l ON l.id = ti.list_id
     WHERE ti.id = $1 AND l.user_id = $2`,
    [itemId, userId]
  );
  return result.rows[0] || null;
};

// Los items nuevos entran arriba de todo (antes del primero de la lista).
export const createItem = async (listId, noteId, title, exec = pool) => {
  const firstResult = await exec.query(
    `SELECT position FROM todo_items
     WHERE list_id = $1
     ORDER BY position COLLATE "C" ASC
     LIMIT 1`,
    [listId]
  );
  const position = generateKeyBetween(null, firstResult.rows[0]?.position ?? null);

  const result = await exec.query(
    `INSERT INTO todo_items (list_id, note_id, title, position)
     VALUES ($1, $2, $3, $4)
     RETURNING *, false AS has_content`,
    [listId, noteId, title, position]
  );
  return result.rows[0];
};

export const updateItem = async (itemId, { title, completed }) => {
  const sets = [];
  const params = [];
  if (title !== undefined) {
    params.push(title);
    sets.push(`title = $${params.length}`);
  }
  if (completed !== undefined) {
    // Re-marcar un item ya completado conserva su completed_at original.
    sets.push(completed ? 'completed_at = COALESCE(completed_at, NOW())' : 'completed_at = NULL');
  }
  params.push(itemId);
  const result = await pool.query(
    `UPDATE todo_items ti SET ${sets.join(', ')}
     WHERE ti.id = $${params.length}
     RETURNING ${ITEM_COLUMNS}`,
    params
  );
  return result.rows[0] || null;
};

/**
 * Posiciones vecinas dentro de la misma lista para DnD (mismo esquema que
 * getSiblingBlockPositions en note.repository).
 */
export const getSiblingItemPositions = async (listId, targetPosition, side, excludeItemId, exec = pool) => {
  if (side === 'above') {
    const before = await exec.query(
      `SELECT position FROM todo_items
       WHERE list_id = $1 AND id <> $3 AND position COLLATE "C" < $2
       ORDER BY position COLLATE "C" DESC LIMIT 1`,
      [listId, targetPosition, excludeItemId]
    );
    return { before: before.rows[0]?.position ?? null, after: targetPosition };
  }
  const after = await exec.query(
    `SELECT position FROM todo_items
     WHERE list_id = $1 AND id <> $3 AND position COLLATE "C" > $2
     ORDER BY position COLLATE "C" ASC LIMIT 1`,
    [listId, targetPosition, excludeItemId]
  );
  return { before: targetPosition, after: after.rows[0]?.position ?? null };
};

export const updateItemPosition = async (itemId, position, exec = pool) => {
  const result = await exec.query(
    `UPDATE todo_items ti SET position = $1 WHERE ti.id = $2 RETURNING ${ITEM_COLUMNS}`,
    [position, itemId]
  );
  return result.rows[0] || null;
};

export const deleteItem = async (itemId, exec = pool) => {
  await exec.query(`DELETE FROM todo_items WHERE id = $1`, [itemId]);
};
