import multer from 'multer';
import path from 'path';
import { config } from '../config/env.js';
import { generateUniqueFilename, ensureDirectoryExists } from '../utils/fileUtils.js';

// Tipos MIME permitidos para imágenes
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

// Extensiones permitidas
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.resolve(config.upload.dir);
    await ensureDirectoryExists(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = generateUniqueFilename(file.originalname);
    cb(null, uniqueName);
  },
});

// Filtro de archivos
const fileFilter = (req, file, cb) => {
  // Verificar tipo MIME
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`), false);
    return;
  }

  // Verificar extensión
  const ext = path.extname(file.originalname).toLowerCase().slice(1);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    cb(new Error(`Extensión no permitida: ${ext}`), false);
    return;
  }

  cb(null, true);
};

// Crear instancia de multer
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
    files: 10, // Máximo 10 archivos por request
  },
});

/**
 * Middleware para upload de múltiples imágenes de trade (máximo 10)
 */
export const uploadTradeImages = upload.array('images', 10);

/**
 * Middleware para upload de imagen única (compatibilidad)
 */
export const uploadTradeImage = upload.single('image');

/**
 * Middleware para manejar errores de multer
 */
export const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      err.code = 'LIMIT_FILE_SIZE';
      err.message = 'El archivo excede el tamaño máximo de 5MB';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      err.message = 'Campo de archivo inesperado';
    }
  }
  next(err);
};
