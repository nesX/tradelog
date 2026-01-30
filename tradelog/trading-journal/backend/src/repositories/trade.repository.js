import { query, getClient } from '../config/database.js';
import { TRADE_FIELDS, IMAGE_FIELDS, PAGINATION_DEFAULTS } from '../models/trade.model.js';

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
    [tradeId]
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
    [tradeIds]
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
 * @param {Object} options - Opciones de consulta
 * @returns {Promise<{trades: Array, total: number, page: number, totalPages: number}>}
 */
export const findAll = async (options = {}) => {
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
  } = options;

  const offset = (page - 1) * limit;
  const params = [];
  const conditions = ['deleted_at IS NULL'];

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

  // Obtener imágenes para todos los trades
  const tradeIds = trades.map(t => t.id);
  const imagesByTrade = await getImagesForTrades(tradeIds);

  // Agregar imágenes a cada trade
  for (const trade of trades) {
    trade.images = imagesByTrade[trade.id] || [];
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
 * @param {number} id - ID del trade
 * @returns {Promise<Object|null>}
 */
export const findById = async (id) => {
  const result = await query(
    `SELECT ${SELECT_FIELDS} FROM trades WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  if (!result.rows[0]) return null;

  const trade = result.rows[0];
  trade.images = await getTradeImages(id);

  return trade;
};

/**
 * Crea un nuevo trade
 * @param {Object} tradeData - Datos del trade
 * @returns {Promise<Object>}
 */
export const create = async (tradeData) => {
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
  } = tradeData;

  const result = await query(
    `INSERT INTO trades (
      symbol, trade_type, entry_price, exit_price, quantity,
      entry_date, exit_date, commission, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING ${SELECT_FIELDS}`,
    [
      symbol,
      trade_type,
      entry_price,
      exit_price || null,
      quantity,
      entry_date,
      exit_date || null,
      commission || 0,
      notes || null,
    ]
  );

  const trade = result.rows[0];
  trade.images = [];

  return trade;
};

/**
 * Crea múltiples trades (para import CSV)
 * @param {Array<Object>} tradesData - Array de datos de trades
 * @returns {Promise<Array<Object>>}
 */
export const createMany = async (tradesData) => {
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
      } = tradeData;

      const result = await client.query(
        `INSERT INTO trades (
          symbol, trade_type, entry_price, exit_price, quantity,
          entry_date, exit_date, commission, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING ${SELECT_FIELDS}`,
        [
          symbol,
          trade_type,
          entry_price,
          exit_price || null,
          quantity,
          entry_date,
          exit_date || null,
          commission || 0,
          notes || null,
        ]
      );

      const trade = result.rows[0];
      trade.images = [];
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
 * @param {number} id - ID del trade
 * @param {Object} updateData - Datos a actualizar
 * @returns {Promise<Object|null>}
 */
export const update = async (id, updateData) => {
  const allowedFields = [
    'symbol', 'trade_type', 'entry_price', 'exit_price', 'quantity',
    'entry_date', 'exit_date', 'commission', 'notes'
  ];

  const updates = [];
  const params = [];

  // Construir SET clause dinámicamente
  for (const [key, value] of Object.entries(updateData)) {
    if (allowedFields.includes(key)) {
      params.push(value);
      updates.push(`${key} = $${params.length}`);
    }
  }

  if (updates.length === 0) {
    return findById(id);
  }

  params.push(id);
  const result = await query(
    `UPDATE trades
     SET ${updates.join(', ')}
     WHERE id = $${params.length} AND deleted_at IS NULL
     RETURNING ${SELECT_FIELDS}`,
    params
  );

  if (!result.rows[0]) return null;

  const trade = result.rows[0];
  trade.images = await getTradeImages(id);

  return trade;
};

/**
 * Elimina un trade (soft delete)
 * @param {number} id - ID del trade
 * @returns {Promise<boolean>}
 */
export const softDelete = async (id) => {
  const result = await query(
    `UPDATE trades SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return result.rowCount > 0;
};

/**
 * Elimina un trade permanentemente
 * @param {number} id - ID del trade
 * @returns {Promise<boolean>}
 */
export const hardDelete = async (id) => {
  // Las imágenes se eliminan automáticamente por CASCADE
  const result = await query(
    `DELETE FROM trades WHERE id = $1`,
    [id]
  );
  return result.rowCount > 0;
};

/**
 * Obtiene símbolos únicos
 * @returns {Promise<Array<string>>}
 */
export const getUniqueSymbols = async () => {
  const result = await query(
    `SELECT DISTINCT symbol FROM trades WHERE deleted_at IS NULL ORDER BY symbol`
  );
  return result.rows.map(row => row.symbol);
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
    [tradeId, filename, originalName, fileSize, mimeType]
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
        [tradeId, filename, originalName, fileSize, mimeType]
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
    [imageId]
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
    [imageId]
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
    [tradeId]
  );
  return result.rows;
};
