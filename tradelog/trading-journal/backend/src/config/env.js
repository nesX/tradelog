import dotenv from 'dotenv';
import Joi from 'joi';

// Cargar variables de entorno
dotenv.config();

// Schema de validación para variables de entorno
const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(5000),

  // Base de datos
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),

  // Archivos
  UPLOAD_DIR: Joi.string().default('./uploads'),
  MAX_FILE_SIZE: Joi.number().default(5242880), // 5MB

  // CORS
  ALLOWED_ORIGINS: Joi.string().default('http://localhost:5173'),

  // Logging
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug')
    .default('info'),
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

  cors: {
    origins: envVars.ALLOWED_ORIGINS.split(','),
  },

  log: {
    level: envVars.LOG_LEVEL,
  },
};
