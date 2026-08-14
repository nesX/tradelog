import { query, getClient } from '../config/database.js';
import {
  TRADE_FIELDS,
  IMAGE_FIELDS,
  PAGINATION_DEFAULTS,
} from '../models/trade.model.js';
import {
  getSystemDataForTrades,
  getTradeSignals,
  getTradeTimeframes,
  insertTradeSignals,
  insertTradeTimeframes,
  deleteTradeSignalsByRole,
  deleteAllTradeTimeframes,
} from './system.repository.js';

/**
 * Repository para operaciones de base de datos de trades
 */

const SELECT_FIELDS = TRADE_FIELDS.join(', ');
const SELECT_IMAGE_FIELDS = IMAGE_FIELDS.join(', ');

/**
 * Obtiene las imágenes de un trade
 * @param {number} tradeId - ID del trade
 * @returns {Promise<Array>}
 */
export const getTradeImages = async (tradeId) => {
  const result = await query(
    `SELECT ${SELECT_IMAGE_FIELDS} FROM trade_images WHERE trade_id = $1 ORDER BY created_at`,
    [tradeId],
  );
  return result.rows;
};

/**
 * Obtiene las imágenes de múltiples trades
 * @param {Array<number>} tradeIds - IDs de trades
 * @returns {Promise<Object>} Objeto con trade_id como key y array de imágenes como value
 */
export const getImagesForTrades = async (tradeIds) => {
  if (!tradeIds.length) return {};

  const result = await query(
    `SELECT ${SELECT_IMAGE_FIELDS} FROM trade_images WHERE trade_id = ANY($1) ORDER BY created_at`,
    [tradeIds],
  );

  // Agrupar por trade_id
  const imagesByTrade = {};
  for (const image of result.rows) {
    if (!imagesByTrade[image.trade_id]) {
      imagesByTrade[image.trade_id] = [];
    }
    imagesByTrade[image.trade_id].push(image);
  }
  return imagesByTrade;
};

/**
 * Obtiene todos los trades con paginación y filtros
 * @param {number} userId - ID del usuario
 * @param {Object} options - Opciones de consulta
 * @returns {Promise<{trades: Array, total: number, page: number, totalPages: number}>}
 */
export const findAll = async (userId, options = {}) => {
  const {
    page = PAGINATION_DEFAULTS.page,
    limit = PAGINATION_DEFAULTS.limit,
    sortBy = 'entry_date',
    sortDir = 'DESC',
    status,
    symbol,
    trade_type,
    dateFrom,
    dateTo,
    tagIds,
  } = options;

  const offset = (page - 1) * limit;
  const params = [userId];
  const conditions = ['deleted_at IS NULL', 'user_id = $1'];

  // Construir condiciones dinámicamente
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  if (symbol) {
    params.push(symbol);
    conditions.push(`symbol = $${params.length}`);
  }

  if (trade_type) {
    params.push(trade_type);
    conditions.push(`trade_type = $${params.length}`);
  }

  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`entry_date >= $${params.length}`);
  }

  if (dateTo) {
    params.push(dateTo);
    conditions.push(`entry_date <= $${params.length}`);
  }

  if (tagIds && tagIds.length > 0) {
    params.push(tagIds);
    conditions.push(`EXISTS (
      SELECT 1 FROM trade_tag_assignments tta_f
      WHERE tta_f.trade_id = trades.id AND tta_f.tag_id = ANY($${params.length})
    )`);
  }

  const whereClause = conditions.join(' AND ');

  // Query para obtener el total
  const countQuery = `SELECT COUNT(*) FROM trades WHERE ${whereClause}`;
  const countResult = await query(countQuery, params);
  const total = parseInt(countResult.rows[0].count, 10);

  // Query para obtener los trades
  const dataQuery = `
    SELECT ${SELECT_FIELDS}
    FROM trades
    WHERE ${whereClause}
    ORDER BY ${sortBy} ${sortDir}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  const dataResult = await query(dataQuery, [...params, limit, offset]);
  const trades = dataResult.rows;

  // Obtener imágenes, datos de sistemas y tags para todos los trades
  const tradeIds = trades.map((t) => t.id);
  const [imagesByTrade, systemData, tagsByTrade] = await Promise.all([
    getImagesForTrades(tradeIds),
    getSystemDataForTrades(tradeIds),
    getTagsForTrades(tradeIds),
  ]);

  // Agregar imágenes, señales/timeframes y tags a cada trade
  for (const trade of trades) {
    trade.images = imagesByTrade[trade.id] || [];
    const sigs = systemData.signals[trade.id] || { primary: [], secondary: [] };
    trade.primary_signals = sigs.primary;
    trade.secondary_signals = sigs.secondary;
    trade.timeframes = systemData.timeframes[trade.id] || [];
    trade.tags = tagsByTrade[trade.id] || [];
  }

  return {
    trades,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    limit,
  };
};

/**
 * Obtiene un trade por ID
 * @param {number} userId - ID del usuario
 * @param {number} id - ID del trade
 * @returns {Promise<Object|null>}
 */
export const findById = async (userId, id) => {
  const result = await query(
    `SELECT ${SELECT_FIELDS} FROM trades WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId],
  );

  if (!result.rows[0]) return null;

  const trade = result.rows[0];
  const [images, primarySignals, secondarySignals, timeframes, tags] =
    await Promise.all([
      getTradeImages(id),
      getTradeSignals(id, 'primary'),
      getTradeSignals(id, 'secondary'),
      getTradeTimeframes(id),
      getTradeTagsForTrade(id),
    ]);

  trade.images = images;
  trade.primary_signals = primarySignals;
  trade.secondary_signals = secondarySignals;
  trade.timeframes = timeframes.map((t) => t.label);
  trade.tags = tags;

  return trade;
};

/**
 * Crea un nuevo trade
 * @param {number} userId - ID del usuario
 * @param {Object} tradeData - Datos del trade
 * @returns {Promise<Object>}
 */
export const create = async (userId, tradeData) => {
  const {
    symbol,
    trade_type,
    entry_price,
    exit_price,
    quantity,
    entry_date,
    exit_date,
    commission,
    notes,
    post_analysis,
    primary_system_id,
    secondary_system_id,
    primary_signals,
    secondary_signals,
    timeframe_ids,
    tag_ids,
  } = tradeData;

  const hasSystemData =
    primary_signals?.length ||
    secondary_signals?.length ||
    timeframe_ids?.length ||
    tag_ids?.length;

  if (hasSystemData) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO trades (
          user_id, symbol, trade_type, entry_price, exit_price, quantity,
          entry_date, exit_date, commission, notes, post_analysis,
          primary_system_id, secondary_system_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING ${SELECT_FIELDS}`,
        [
          userId,
          symbol,
          trade_type,
          entry_price,
          exit_price || null,
          quantity,
          entry_date,
          exit_date || null,
          commission || 0,
          notes || null,
          post_analysis || null,
          primary_system_id || null,
          secondary_system_id || null,
        ],
      );
      const trade = result.rows[0];

      if (primary_signals?.length) {
        await insertTradeSignals(client, trade.id, 'primary', primary_signals);
      }
      if (secondary_signals?.length) {
        await insertTradeSignals(
          client,
          trade.id,
          'secondary',
          secondary_signals,
        );
      }
      if (timeframe_ids?.length) {
        await insertTradeTimeframes(client, trade.id, timeframe_ids);
      }
      if (tag_ids?.length) {
        await insertTradeTags(client, trade.id, tag_ids);
      }

      await client.query('COMMIT');

      trade.images = [];
      trade.primary_signals = primary_signals || [];
      trade.secondary_signals = secondary_signals || [];
      trade.timeframes = [];
      trade.tags = tag_ids?.length ? await getTradeTagsForTrade(trade.id) : [];
      return trade;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  const result = await query(
    `INSERT INTO trades (
      user_id, symbol, trade_type, entry_price, exit_price, quantity,
      entry_date, exit_date, commission, notes, post_analysis,
      primary_system_id, secondary_system_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING ${SELECT_FIELDS}`,
    [
      userId,
      symbol,
      trade_type,
      entry_price,
      exit_price || null,
      quantity,
      entry_date,
      exit_date || null,
      commission || 0,
      notes || null,
      post_analysis || null,
      primary_system_id || null,
      secondary_system_id || null,
    ],
  );

  const trade = result.rows[0];
  trade.images = [];
  trade.primary_signals = [];
  trade.secondary_signals = [];
  trade.timeframes = [];
  trade.tags = [];

  return trade;
};

/**
 * Crea múltiples trades (para import CSV)
 * @param {number} userId - ID del usuario
 * @param {Array<Object>} tradesData - Array de datos de trades
 * @returns {Promise<Array<Object>>}
 */
export const createMany = async (userId, tradesData) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const createdTrades = [];

    for (const tradeData of tradesData) {
      const {
        symbol,
        trade_type,
        entry_price,
        exit_price,
        quantity,
        entry_date,
        exit_date,
        commission,
        notes,
        post_analysis,
      } = tradeData;

      const result = await client.query(
        `INSERT INTO trades (
          user_id, symbol, trade_type, entry_price, exit_price, quantity,
          entry_date, exit_date, commission, notes, post_analysis
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING ${SELECT_FIELDS}`,
        [
          userId,
          symbol,
          trade_type,
          entry_price,
          exit_price || null,
          quantity,
          entry_date,
          exit_date || null,
          commission || 0,
          notes || null,
          post_analysis || null,
        ],
      );

      const trade = result.rows[0];
      trade.images = [];
      trade.primary_signals = [];
      trade.secondary_signals = [];
      trade.timeframes = [];
      trade.tags = [];
      createdTrades.push(trade);
    }

    await client.query('COMMIT');
    return createdTrades;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Actualiza un trade
 * @param {number} userId - ID del usuario
 * @param {number} id - ID del trade
 * @param {Object} updateData - Datos a actualizar
 * @returns {Promise<Object|null>}
 */
export const update = async (userId, id, updateData) => {
  const allowedFields = [
    'symbol',
    'trade_type',
    'entry_price',
    'exit_price',
    'quantity',
    'entry_date',
    'exit_date',
    'commission',
    'notes',
    'post_analysis',
    'primary_system_id',
    'secondary_system_id',
  ];

  const {
    primary_signals,
    secondary_signals,
    timeframe_ids,
    tag_ids,
    ...coreData
  } = updateData;

  const updates = [];
  const params = [userId, id];

  for (const [key, value] of Object.entries(coreData)) {
    if (allowedFields.includes(key)) {
      params.push(value);
      updates.push(`${key} = $${params.length}`);
    }
  }

  const hasSystemData =
    primary_signals !== undefined ||
    secondary_signals !== undefined ||
    timeframe_ids !== undefined ||
    tag_ids !== undefined;

  if (updates.length === 0 && !hasSystemData) {
    return findById(userId, id);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    let trade;
    if (updates.length > 0) {
      const result = await client.query(
        `UPDATE trades
         SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND user_id = $1 AND deleted_at IS NULL
         RETURNING ${SELECT_FIELDS}`,
        params,
      );
      if (!result.rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
      trade = result.rows[0];
    } else {
      const result = await client.query(
        `SELECT ${SELECT_FIELDS} FROM trades WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [id, userId],
      );
      if (!result.rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
      trade = result.rows[0];
    }

    if (primary_signals !== undefined) {
      await deleteTradeSignalsByRole(client, id, 'primary');
      if (primary_signals.length > 0) {
        await insertTradeSignals(client, id, 'primary', primary_signals);
      }
    }
    if (secondary_signals !== undefined) {
      await deleteTradeSignalsByRole(client, id, 'secondary');
      if (secondary_signals.length > 0) {
        await insertTradeSignals(client, id, 'secondary', secondary_signals);
      }
    }
    if (timeframe_ids !== undefined) {
      await deleteAllTradeTimeframes(client, id);
      if (timeframe_ids.length > 0) {
        await insertTradeTimeframes(client, id, timeframe_ids);
      }
    }
    // Reemplazo total (replace-all), igual que note.repository.js assignTags: con
    // tag_ids: [] se borran todos los tags asignados al trade.
    if (tag_ids !== undefined) {
      await deleteAllTradeTags(client, id);
      if (tag_ids.length > 0) {
        await insertTradeTags(client, id, tag_ids);
      }
    }

    await client.query('COMMIT');

    // Enriquecer con datos actualizados
    const [images, primarySignals, secondarySignals, timeframes, tags] =
      await Promise.all([
        getTradeImages(id),
        getTradeSignals(id, 'primary'),
        getTradeSignals(id, 'secondary'),
        getTradeTimeframes(id),
        getTradeTagsForTrade(id),
      ]);

    trade.images = images;
    trade.primary_signals = primarySignals;
    trade.secondary_signals = secondarySignals;
    trade.timeframes = timeframes.map((t) => t.label);
    trade.tags = tags;

    return trade;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Elimina un trade (soft delete)
 * @param {number} userId - ID del usuario
 * @param {number} id - ID del trade
 * @returns {Promise<boolean>}
 */
export const softDelete = async (userId, id) => {
  const result = await query(
    `UPDATE trades SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId],
  );
  return result.rowCount > 0;
};

/**
 * Elimina un trade permanentemente
 * @param {number} userId - ID del usuario
 * @param {number} id - ID del trade
 * @returns {Promise<boolean>}
 */
export const hardDelete = async (userId, id) => {
  // Las imágenes se eliminan automáticamente por CASCADE
  const result = await query(
    `DELETE FROM trades WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return result.rowCount > 0;
};

/**
 * Obtiene símbolos únicos del usuario
 * @param {number} userId - ID del usuario
 * @returns {Promise<Array<string>>}
 */
export const getUniqueSymbols = async (userId) => {
  const result = await query(
    `SELECT DISTINCT symbol FROM trades WHERE user_id = $1 AND deleted_at IS NULL ORDER BY symbol`,
    [userId],
  );
  return result.rows.map((row) => row.symbol);
};

// ==================
// FUNCIONES DE IMÁGENES
// ==================

/**
 * Agrega una imagen a un trade
 * @param {number} tradeId - ID del trade
 * @param {Object} imageData - Datos de la imagen
 * @returns {Promise<Object>}
 */
export const addImage = async (tradeId, imageData) => {
  const { filename, originalName, fileSize, mimeType } = imageData;

  const result = await query(
    `INSERT INTO trade_images (trade_id, filename, original_name, file_size, mime_type)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${SELECT_IMAGE_FIELDS}`,
    [tradeId, filename, originalName, fileSize, mimeType],
  );

  return result.rows[0];
};

/**
 * Agrega múltiples imágenes a un trade
 * @param {number} tradeId - ID del trade
 * @param {Array<Object>} imagesData - Array de datos de imágenes
 * @returns {Promise<Array>}
 */
export const addImages = async (tradeId, imagesData) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const createdImages = [];

    for (const imageData of imagesData) {
      const { filename, originalName, fileSize, mimeType } = imageData;

      const result = await client.query(
        `INSERT INTO trade_images (trade_id, filename, original_name, file_size, mime_type)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${SELECT_IMAGE_FIELDS}`,
        [tradeId, filename, originalName, fileSize, mimeType],
      );

      createdImages.push(result.rows[0]);
    }

    await client.query('COMMIT');
    return createdImages;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Obtiene una imagen por ID
 * @param {number} imageId - ID de la imagen
 * @returns {Promise<Object|null>}
 */
export const getImageById = async (imageId) => {
  const result = await query(
    `SELECT ${SELECT_IMAGE_FIELDS} FROM trade_images WHERE id = $1`,
    [imageId],
  );
  return result.rows[0] || null;
};

/**
 * Elimina una imagen
 * @param {number} imageId - ID de la imagen
 * @returns {Promise<Object|null>} La imagen eliminada o null
 */
export const deleteImage = async (imageId) => {
  const result = await query(
    `DELETE FROM trade_images WHERE id = $1 RETURNING ${SELECT_IMAGE_FIELDS}`,
    [imageId],
  );
  return result.rows[0] || null;
};

/**
 * Elimina todas las imágenes de un trade
 * @param {number} tradeId - ID del trade
 * @returns {Promise<Array>} Las imágenes eliminadas
 */
export const deleteAllImages = async (tradeId) => {
  const result = await query(
    `DELETE FROM trade_images WHERE trade_id = $1 RETURNING ${SELECT_IMAGE_FIELDS}`,
    [tradeId],
  );
  return result.rows;
};

// ============================================================
// TAGS (espejo de note.repository.js: TAGS)
// ============================================================

/**
 * Lista los tags globales del usuario
 */
export const getTradeTags = async (userId) => {
  const result = await query(
    `SELECT id, name, color, created_at FROM trade_tags WHERE user_id = $1 ORDER BY name ASC`,
    [userId],
  );
  return result.rows;
};

/**
 * Crea un tag
 */
export const createTradeTag = async (userId, { name, color }) => {
  const result = await query(
    `INSERT INTO trade_tags (user_id, name, color) VALUES ($1, $2, $3) RETURNING *`,
    [userId, name, color || '#6B7280'],
  );
  return result.rows[0];
};

export const getTradeTagByName = async (userId, name) => {
  const result = await query(
    `SELECT * FROM trade_tags WHERE user_id = $1 AND LOWER(name) = LOWER($2)`,
    [userId, name],
  );
  return result.rows[0] || null;
};

export const getTradeTagById = async (userId, tagId) => {
  const result = await query(
    `SELECT * FROM trade_tags WHERE id = $1 AND user_id = $2`,
    [tagId, userId],
  );
  return result.rows[0] || null;
};

export const updateTradeTag = async (userId, tagId, { name, color }) => {
  const fields = [];
  const values = [];
  let idx = 1;
  if (name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(name);
  }
  if (color !== undefined) {
    fields.push(`color = $${idx++}`);
    values.push(color);
  }
  if (fields.length === 0) return await getTradeTagById(userId, tagId);

  values.push(tagId, userId);
  const result = await query(
    `UPDATE trade_tags SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
    values,
  );
  return result.rows[0] || null;
};

export const deleteTradeTag = async (userId, tagId) => {
  const result = await query(
    `DELETE FROM trade_tags WHERE id = $1 AND user_id = $2 RETURNING id`,
    [tagId, userId],
  );
  return result.rows[0] || null;
};

/**
 * Verifica que los tagIds dados pertenezcan al usuario (para validar ownership
 * antes de asignarlos a un trade)
 */
export const getTradeTagsByIds = async (userId, tagIds) => {
  const result = await query(
    `SELECT id FROM trade_tags WHERE id = ANY($1) AND user_id = $2`,
    [tagIds, userId],
  );
  return result.rows;
};

// ============================================================
// TRADE_TAG_ASSIGNMENTS — mismo patrón que insertTradeSignals/
// insertTradeTimeframes en system.repository.js: reciben el `client` de una
// transacción existente (ver create/update de arriba).
// ============================================================

/**
 * Guarda asignaciones de tags de un trade (dentro de una transacción existente)
 */
export const insertTradeTags = async (client, tradeId, tagIds) => {
  for (const tagId of tagIds) {
    await client.query(
      `INSERT INTO trade_tag_assignments (trade_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [tradeId, tagId],
    );
  }
};

/**
 * Elimina todos los tags de un trade (para reemplazo total en update)
 */
export const deleteAllTradeTags = async (client, tradeId) => {
  await client.query(`DELETE FROM trade_tag_assignments WHERE trade_id = $1`, [
    tradeId,
  ]);
};

/**
 * Obtiene los tags asignados a un trade
 */
export const getTradeTagsForTrade = async (tradeId) => {
  const result = await query(
    `SELECT tt.id, tt.name, tt.color
     FROM trade_tag_assignments tta
     JOIN trade_tags tt ON tt.id = tta.tag_id
     WHERE tta.trade_id = $1
     ORDER BY tt.name ASC`,
    [tradeId],
  );
  return result.rows;
};

/**
 * Obtiene tags para múltiples trades a la vez (batch)
 * Retorna { tradeId: [{id, name, color}, ...] }
 */
export const getTagsForTrades = async (tradeIds) => {
  if (!tradeIds.length) return {};

  const result = await query(
    `SELECT tta.trade_id, tt.id, tt.name, tt.color
     FROM trade_tag_assignments tta
     JOIN trade_tags tt ON tt.id = tta.tag_id
     WHERE tta.trade_id = ANY($1)
     ORDER BY tt.name ASC`,
    [tradeIds],
  );

  const tagsByTrade = {};
  for (const row of result.rows) {
    if (!tagsByTrade[row.trade_id]) tagsByTrade[row.trade_id] = [];
    tagsByTrade[row.trade_id].push({
      id: row.id,
      name: row.name,
      color: row.color,
    });
  }
  return tagsByTrade;
};
