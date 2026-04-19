import { query } from '../config/database.js';
import { USER_FIELDS } from '../models/user.model.js';

const SELECT_FIELDS = USER_FIELDS.join(', ');

/**
 * Busca un usuario por email
 */
export const findByEmail = async (email) => {
  const result = await query(
    `SELECT ${SELECT_FIELDS} FROM users WHERE email = $1`,
    [email]
  );
  return result.rows[0] || null;
};

/**
 * Busca un usuario por ID
 */
export const findById = async (id) => {
  const result = await query(
    `SELECT ${SELECT_FIELDS} FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Actualiza último login del usuario
 */
export const updateLastLogin = async (id) => {
  const result = await query(
    `UPDATE users
     SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING ${SELECT_FIELDS}`,
    [id]
  );

  return result.rows[0];
};
