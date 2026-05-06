import { query, getClient } from '../config/database.js';
import { USER_FIELDS } from '../models/user.model.js';

const SELECT_FIELDS = USER_FIELDS.join(', ');

export const findByEmail = async (email) => {
  const result = await query(
    `SELECT ${SELECT_FIELDS} FROM users WHERE email = $1`,
    [email]
  );
  return result.rows[0] || null;
};

export const findById = async (id) => {
  const result = await query(
    `SELECT ${SELECT_FIELDS} FROM users WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
};

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

export async function findActiveByEmail(email) {
  const result = await query(
    `SELECT ${SELECT_FIELDS}
     FROM users
     WHERE email = $1 AND deleted_at IS NULL
     LIMIT 1`,
    [email]
  );
  return result.rows[0] || null;
}

export async function findAll({ page = 1, limit = 20, role, includeDeleted = false }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const values = [];
  let idx = 1;

  if (!includeDeleted) {
    conditions.push('deleted_at IS NULL');
  }
  if (role) {
    conditions.push(`role = $${idx++}`);
    values.push(role);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT id, email, role, created_by, deleted_at,
           created_at, last_login_at,
           COUNT(*) OVER() AS total_count
    FROM users
    ${where}
    ORDER BY created_at DESC
    LIMIT $${idx++} OFFSET $${idx++}
  `;
  values.push(limit, offset);

  const result = await query(sql, values);
  const total = result.rows[0]?.total_count ? parseInt(result.rows[0].total_count, 10) : 0;
  const users = result.rows.map(({ total_count, ...rest }) => rest);

  return { users, total };
}

export async function createUser({ email, role = 'user', createdBy = null }) {
  const result = await query(
    `INSERT INTO users (email, role, created_by)
     VALUES ($1, $2, $3)
     RETURNING id, email, role, created_by, created_at`,
    [email, role, createdBy]
  );
  return result.rows[0];
}

export async function updateRole(id, role) {
  const result = await query(
    `UPDATE users
     SET role = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING id, email, role, updated_at`,
    [role, id]
  );
  return result.rows[0] || null;
}

export async function softDelete(id) {
  const result = await query(
    `UPDATE users
     SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return result.rowCount > 0;
}

export async function touchLastLogin(id) {
  await query(
    `UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [id]
  );
}

export async function findCurrentSuperAdmin() {
  const result = await query(
    `SELECT id, email, role FROM users
     WHERE role = 'super_admin' AND deleted_at IS NULL
     LIMIT 1`
  );
  return result.rows[0] || null;
}

export async function promoteToSuperAdmin(email) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const current = await client.query(
      `SELECT id, email FROM users WHERE role = 'super_admin' AND deleted_at IS NULL LIMIT 1`
    );

    if (current.rows[0] && current.rows[0].email !== email) {
      await client.query(
        `UPDATE users SET role = 'user', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [current.rows[0].id]
      );
    } else if (current.rows[0] && current.rows[0].email === email) {
      // Ya está configurado correctamente, no hay nada que hacer
      await client.query('ROLLBACK');
      return;
    }

    const existing = await client.query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );

    if (existing.rows[0]) {
      await client.query(
        `UPDATE users SET role = 'super_admin', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [existing.rows[0].id]
      );
    } else {
      await client.query(
        `INSERT INTO users (email, role) VALUES ($1, 'super_admin')`,
        [email]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
