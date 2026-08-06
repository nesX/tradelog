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
 * Ejecuta `fn(client)` dentro de una transacción tomando primero un advisory lock
 * por usuario (`pg_advisory_xact_lock`). Serializa las operaciones de mover/crear/
 * reordenar del MISMO usuario, de modo que la validación (anti-ciclos, vecinos para
 * fractional-indexing) y el UPDATE ocurran de forma atómica y sin carreras
 * read-then-write entre pestañas. El lock se libera solo al terminar la transacción.
 *
 * @param {number} userId
 * @param {(client: pg.PoolClient) => Promise<any>} fn
 */
export const withUserLock = async (userId, fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [userId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
