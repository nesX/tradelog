import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger.js';

/**
 * Genera un nombre único para un archivo
 * @param {string} originalName - Nombre original del archivo
 * @returns {string} Nombre único generado
 */
export const generateUniqueFilename = (originalName) => {
  const ext = path.extname(originalName).toLowerCase();
  const timestamp = Date.now();
  const uuid = uuidv4().split('-')[0]; // Usar solo los primeros 8 caracteres
  return `${timestamp}-${uuid}${ext}`;
};

/**
 * Verifica si el directorio existe, si no lo crea
 * @param {string} dirPath - Ruta del directorio
 */
export const ensureDirectoryExists = async (dirPath) => {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
    logger.info(`Directorio creado: ${dirPath}`);
  }
};

/**
 * Elimina un archivo si existe
 * @param {string} filePath - Ruta del archivo
 * @returns {Promise<boolean>} true si se eliminó, false si no existía
 */
export const deleteFileIfExists = async (filePath) => {
  try {
    await fs.unlink(filePath);
    logger.debug(`Archivo eliminado: ${filePath}`);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};

/**
 * Obtiene la extensión de un archivo
 * @param {string} filename - Nombre del archivo
 * @returns {string} Extensión en minúsculas sin el punto
 */
export const getFileExtension = (filename) => {
  return path.extname(filename).toLowerCase().slice(1);
};

/**
 * Verifica si un archivo tiene una extensión permitida
 * @param {string} filename - Nombre del archivo
 * @param {Array<string>} allowedExtensions - Extensiones permitidas
 * @returns {boolean}
 */
export const isAllowedExtension = (filename, allowedExtensions) => {
  const ext = getFileExtension(filename);
  return allowedExtensions.includes(ext);
};

/**
 * Obtiene el tipo MIME basado en la extensión
 * @param {string} filename - Nombre del archivo
 * @returns {string} Tipo MIME
 */
export const getMimeType = (filename) => {
  const ext = getFileExtension(filename);
  const mimeTypes = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
  };
  return mimeTypes[ext] || 'application/octet-stream';
};
