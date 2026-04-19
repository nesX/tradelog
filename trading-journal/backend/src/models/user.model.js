/**
 * Constantes y configuración del modelo User
 */

export const USER_FIELDS = [
  'id',
  'email',
  'created_at',
  'updated_at',
  'last_login_at',
];

/**
 * @typedef {Object} User
 * @property {number} id - ID único del usuario
 * @property {string} email - Email del usuario
 * @property {Date} created_at - Fecha de registro
 * @property {Date} updated_at - Última actualización
 * @property {Date} last_login_at - Último login
 */
