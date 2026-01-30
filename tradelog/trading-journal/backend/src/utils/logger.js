import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Formato personalizado para logs
const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level}]: ${message}`;

  // Agregar metadata si existe
  if (Object.keys(meta).length > 0) {
    log += ` ${JSON.stringify(meta)}`;
  }

  // Agregar stack trace si existe
  if (stack) {
    log += `\n${stack}`;
  }

  return log;
});

// Configuración del logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [
    // Consola con colores en desarrollo
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        logFormat
      ),
    }),
  ],
});

// En producción, agregar archivo de logs
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    })
  );
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
    })
  );
}
