import pg from 'pg';
import { config } from './env.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

// Crear pool de conexiones
const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  max: 20, // máximo de conexiones
  idleTimeoutMillis: 30000, // tiempo antes de cerrar conexiones inactivas
  connectionTimeoutMillis: 2000, // tiempo máximo para establecer conexión
});

// Manejar errores del pool
pool.on('error', (err) => {
  logger.error('Error inesperado en el pool de PostgreSQL', err);
});

// Manejar conexiones nuevas
pool.on('connect', () => {
  logger.debug('Nueva conexión establecida con PostgreSQL');
});

/**
 * Ejecuta una query en la base de datos
 * @param {string} text - Query SQL
 * @param {Array} params - Parámetros de la query
 * @returns {Promise<Object>} Resultado de la query
 */
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    logger.debug('Query ejecutada', {
      text: text.substring(0, 100),
      duration: `${duration}ms`,
      rows: result.rowCount,
    });

    return result;
  } catch (error) {
    logger.error('Error en query', {
      text: text.substring(0, 100),
      error: error.message,
    });
    throw error;
  }
};

/**
 * Obtiene un cliente del pool para transacciones
 * @returns {Promise<pg.PoolClient>} Cliente de conexión
 */
export const getClient = async () => {
  const client = await pool.connect();
  return client;
};

/**
 * Verifica la conexión a la base de datos
 * @returns {Promise<boolean>} true si la conexión es exitosa
 */
export const testConnection = async () => {
  try {
    const result = await query('SELECT NOW()');
    logger.info('Conexión a PostgreSQL establecida', {
      timestamp: result.rows[0].now,
    });
    return true;
  } catch (error) {
    logger.error('Error al conectar con PostgreSQL', error);
    return false;
  }
};

/**
 * Cierra el pool de conexiones
 */
export const closePool = async () => {
  await pool.end();
  logger.info('Pool de conexiones cerrado');
};

export { pool };
