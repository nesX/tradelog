import { pool } from '../config/database.js';

// Estado del job de recordatorios: una sola fila (id = 1), sembrada por la
// migración 028.

export const get = async (exec = pool) => {
  const result = await exec.query(`SELECT * FROM reminder_job_state WHERE id = 1`);
  return result.rows[0] || null;
};

export const setLastRunAt = async (exec = pool) => {
  await exec.query(`UPDATE reminder_job_state SET last_run_at = NOW() WHERE id = 1`);
};

export const setCatalogSyncedAt = async (exec = pool) => {
  await exec.query(`UPDATE reminder_job_state SET catalog_synced_at = NOW() WHERE id = 1`);
};

/** 429/418 de Binance: persistido para que sobreviva a un reinicio. */
export const setBackoffUntil = async (date, exec = pool) => {
  await exec.query(`UPDATE reminder_job_state SET backoff_until = $1 WHERE id = 1`, [date]);
};
