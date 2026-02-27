import fs from 'fs';
import path from 'path';
import winston from 'winston';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// Directorio de logs — se lee antes del config para evitar dependencias circulares
const LOG_DIR = process.env.LOG_DIR || './logs';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Crear el directorio si no existe
const resolvedLogDir = path.resolve(LOG_DIR);
if (!fs.existsSync(resolvedLogDir)) {
  fs.mkdirSync(resolvedLogDir, { recursive: true });
}

// Formato texto para consola
const consoleFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(meta).length > 0) {
    log += ` ${JSON.stringify(meta)}`;
  }
  if (stack) {
    log += `\n${stack}`;
  }
  return log;
});

// Formato JSON para archivos (facilita búsqueda y análisis)
const fileFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  json()
);

export const logger = winston.createLogger({
  level: LOG_LEVEL,
  transports: [
    // Consola — siempre activa, con colores en desarrollo
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        consoleFormat
      ),
    }),

    // Archivo de errores — solo nivel error
    new winston.transports.File({
      filename: path.join(resolvedLogDir, 'error.log'),
      level: 'error',
      format: fileFormat,
    }),

    // Archivo combinado — todos los niveles
    new winston.transports.File({
      filename: path.join(resolvedLogDir, 'combined.log'),
      format: fileFormat,
    }),
  ],
});
