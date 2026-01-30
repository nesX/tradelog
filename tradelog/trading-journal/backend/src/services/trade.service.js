import * as tradeRepository from '../repositories/trade.repository.js';
import { NotFoundError } from '../middleware/errorHandler.js';
import { deleteFileIfExists } from '../utils/fileUtils.js';
import { config } from '../config/env.js';
import path from 'path';

/**
 * Service para lógica de negocio de trades
 */

/**
 * Obtiene todos los trades con filtros
 * @param {Object} filters - Filtros de búsqueda
 * @returns {Promise<Object>}
 */
export const getAllTrades = async (filters) => {
  return tradeRepository.findAll(filters);
};

/**
 * Obtiene un trade por ID
 * @param {number} id - ID del trade
 * @returns {Promise<Object>}
 */
export const getTradeById = async (id) => {
  const trade = await tradeRepository.findById(id);

  if (!trade) {
    throw new NotFoundError(`Trade con ID ${id} no encontrado`);
  }

  return trade;
};

/**
 * Crea un nuevo trade
 * @param {Object} tradeData - Datos del trade
 * @param {Array} files - Archivos de imagen subidos
 * @returns {Promise<Object>}
 */
export const createTrade = async (tradeData, files = []) => {
  // Si tiene exit_price y exit_date, calcular exit_date si no se proporcionó
  if (tradeData.exit_price && !tradeData.exit_date) {
    tradeData.exit_date = new Date();
  }

  // Crear el trade
  const trade = await tradeRepository.create(tradeData);

  // Si hay imágenes, agregarlas
  if (files && files.length > 0) {
    const imagesData = files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
    }));

    trade.images = await tradeRepository.addImages(trade.id, imagesData);
  }

  return trade;
};

/**
 * Actualiza un trade existente
 * @param {number} id - ID del trade
 * @param {Object} updateData - Datos a actualizar
 * @param {Array} newFiles - Nuevas imágenes si se subieron
 * @returns {Promise<Object>}
 */
export const updateTrade = async (id, updateData, newFiles = []) => {
  // Verificar que existe
  await getTradeById(id);

  // Actualizar trade
  const updatedTrade = await tradeRepository.update(id, updateData);

  if (!updatedTrade) {
    throw new NotFoundError(`Trade con ID ${id} no encontrado`);
  }

  // Si hay nuevas imágenes, agregarlas
  if (newFiles && newFiles.length > 0) {
    const imagesData = newFiles.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
    }));

    const newImages = await tradeRepository.addImages(id, imagesData);
    updatedTrade.images = [...updatedTrade.images, ...newImages];
  }

  return updatedTrade;
};

/**
 * Elimina un trade
 * @param {number} id - ID del trade
 * @param {boolean} permanent - Si es eliminación permanente
 * @returns {Promise<void>}
 */
export const deleteTrade = async (id, permanent = false) => {
  // Verificar que existe y obtener datos
  const trade = await getTradeById(id);

  // Si tiene imágenes y es eliminación permanente, eliminar archivos
  if (trade.images && trade.images.length > 0 && permanent) {
    for (const image of trade.images) {
      const imagePath = path.join(config.upload.dir, image.filename);
      await deleteFileIfExists(imagePath);
    }
  }

  const deleted = permanent
    ? await tradeRepository.hardDelete(id)
    : await tradeRepository.softDelete(id);

  if (!deleted) {
    throw new NotFoundError(`Trade con ID ${id} no encontrado`);
  }
};

/**
 * Agrega imágenes a un trade
 * @param {number} tradeId - ID del trade
 * @param {Array} files - Archivos de imagen subidos
 * @returns {Promise<Array>}
 */
export const addImages = async (tradeId, files) => {
  // Verificar que existe
  await getTradeById(tradeId);

  if (!files || files.length === 0) {
    throw new NotFoundError('No se proporcionaron imágenes');
  }

  const imagesData = files.map(file => ({
    filename: file.filename,
    originalName: file.originalname,
    fileSize: file.size,
    mimeType: file.mimetype,
  }));

  return tradeRepository.addImages(tradeId, imagesData);
};

/**
 * Elimina una imagen específica de un trade
 * @param {number} tradeId - ID del trade
 * @param {number} imageId - ID de la imagen
 * @returns {Promise<Object>}
 */
export const deleteImage = async (tradeId, imageId) => {
  // Verificar que el trade existe
  await getTradeById(tradeId);

  // Obtener la imagen
  const image = await tradeRepository.getImageById(imageId);

  if (!image || image.trade_id !== tradeId) {
    throw new NotFoundError('Imagen no encontrada');
  }

  // Eliminar archivo del disco
  const imagePath = path.join(config.upload.dir, image.filename);
  await deleteFileIfExists(imagePath);

  // Eliminar de la base de datos
  await tradeRepository.deleteImage(imageId);

  // Retornar trade actualizado
  return getTradeById(tradeId);
};

/**
 * Elimina todas las imágenes de un trade
 * @param {number} tradeId - ID del trade
 * @returns {Promise<Object>}
 */
export const deleteAllImages = async (tradeId) => {
  // Verificar que existe
  const trade = await getTradeById(tradeId);

  if (!trade.images || trade.images.length === 0) {
    throw new NotFoundError('El trade no tiene imágenes');
  }

  // Eliminar archivos del disco
  for (const image of trade.images) {
    const imagePath = path.join(config.upload.dir, image.filename);
    await deleteFileIfExists(imagePath);
  }

  // Eliminar de la base de datos
  await tradeRepository.deleteAllImages(tradeId);

  // Retornar trade actualizado
  return getTradeById(tradeId);
};

/**
 * Obtiene símbolos únicos para filtros
 * @returns {Promise<Array<string>>}
 */
export const getUniqueSymbols = async () => {
  return tradeRepository.getUniqueSymbols();
};
