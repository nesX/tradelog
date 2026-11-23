import dotenv from 'dotenv';
import Joi from 'joi';

// Cargar variables de entorno
dotenv.config();

// Schema de validación para variables de entorno
const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3088),

  // Base de datos
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),

  // Archivos
  UPLOAD_DIR: Joi.string().default('./uploads'),
  MAX_FILE_SIZE: Joi.number().default(5242880), // 5MB

  // Purga diferida de notas soft-deleted (y sus imágenes en disco)
  NOTE_PURGE_DAYS: Joi.number().min(1).default(30), // gracia antes de borrar definitivamente
  NOTE_PURGE_INTERVAL_HOURS: Joi.number().min(0).default(24), // 0 = desactivar el job

  // Recordatorios de análisis (alertas de precio sobre Binance Futures y por fecha)
  REMINDERS_TICK_MINUTES: Joi.number().min(0).default(30), // 0 = desactivar el job
  BINANCE_FUTURES_API_URL: Joi.string().uri().default('https://fapi.binance.com'),
  // Si x-mbx-used-weight-1m lo supera, se corta el tick (límite de futuros: 2400/min por IP)
  BINANCE_MAX_USED_WEIGHT: Joi.number().integer().min(1).default(1200),

  // Notificaciones push (Web Push). Opcionales y sin formato a propósito: una clave
  // mal pegada no puede tumbar el arranque. Las comprueba clients/webPush.js, que
  // deja el push desactivado si falta alguna o no es válida.
  VAPID_PUBLIC_KEY: Joi.string().allow('').optional(),
  VAPID_PRIVATE_KEY: Joi.string().allow('').optional(),
  VAPID_SUBJECT: Joi.string().allow('').optional(), // default: mailto: + SUPER_ADMIN_EMAIL

  // CORS
  ALLOWED_ORIGINS: Joi.string().default('http://localhost:5179'),

  // Logging
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug')
    .default('info'),
  LOG_DIR: Joi.string().default('./logs'),

  // JWT
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),

  // Google OAuth
  GOOGLE_CLIENT_ID: Joi.string().required(),

  // Super admin bootstrap
  SUPER_ADMIN_EMAIL: Joi.string().email().optional(),

  // Frontend URL
  FRONTEND_URL: Joi.string().default('http://localhost:5179'),
}).unknown();

// Validar y extraer variables
const { value: envVars, error } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Error de configuración: ${error.message}`);
}

// Exportar configuración validada
export const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,

  db: {
    host: envVars.DB_HOST,
    port: envVars.DB_PORT,
    name: envVars.DB_NAME,
    user: envVars.DB_USER,
    password: envVars.DB_PASSWORD,
  },

  upload: {
    dir: envVars.UPLOAD_DIR,
    maxFileSize: envVars.MAX_FILE_SIZE,
  },

  notePurge: {
    days: envVars.NOTE_PURGE_DAYS,
    intervalHours: envVars.NOTE_PURGE_INTERVAL_HOURS,
  },

  reminders: {
    tickMinutes: envVars.REMINDERS_TICK_MINUTES,
  },

  push: {
    publicKey: envVars.VAPID_PUBLIC_KEY || null,
    privateKey: envVars.VAPID_PRIVATE_KEY || null,
    subject: envVars.VAPID_SUBJECT || (envVars.SUPER_ADMIN_EMAIL ? `mailto:${envVars.SUPER_ADMIN_EMAIL}` : null),
  },

  binance: {
    futuresApiUrl: envVars.BINANCE_FUTURES_API_URL.replace(/\/+$/, ''),
    maxUsedWeight: envVars.BINANCE_MAX_USED_WEIGHT,
  },

  cors: {
    origins: envVars.ALLOWED_ORIGINS.split(','),
  },

  log: {
    level: envVars.LOG_LEVEL,
    dir: envVars.LOG_DIR,
  },

  jwt: {
    secret: envVars.JWT_SECRET,
    expiresIn: envVars.JWT_EXPIRES_IN,
  },

  google: {
    clientId: envVars.GOOGLE_CLIENT_ID,
  },

  frontendUrl: envVars.FRONTEND_URL,
};
