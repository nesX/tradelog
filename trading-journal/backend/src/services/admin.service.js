import * as userRepo from '../repositories/user.repository.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

export async function listUsers(query) {
  const { users, total } = await userRepo.findAll(query);
  return {
    users,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function getUserById(id) {
  const user = await userRepo.findById(id);
  if (!user) throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
  return user;
}

export async function createUser(data, actor) {
  const { email, role } = data;

  if (role === 'admin' && actor.role !== 'super_admin') {
    throw new AppError(
      'Solo el super administrador puede crear administradores',
      403,
      'FORBIDDEN'
    );
  }

  const existing = await userRepo.findByEmail(email);
  if (existing) {
    throw new AppError('Ya existe un usuario con ese email', 409, 'EMAIL_ALREADY_EXISTS');
  }

  return userRepo.createUser({ email, role, createdBy: actor.id });
}

export async function updateUserRole(id, newRole, actor) {
  if (actor.role !== 'super_admin') {
    throw new AppError(
      'Solo el super administrador puede cambiar roles',
      403,
      'FORBIDDEN'
    );
  }

  const target = await userRepo.findById(id);
  if (!target || target.deleted_at) {
    throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
  }

  if (target.role === 'super_admin') {
    throw new AppError(
      'No se puede modificar el rol del super administrador',
      403,
      'CANNOT_MODIFY_SUPER_ADMIN'
    );
  }

  if (target.role === newRole) {
    return target;
  }

  return userRepo.updateRole(id, newRole);
}

export async function deleteUser(id, actor) {
  if (id === actor.id) {
    throw new AppError('No puedes eliminarte a ti mismo', 400, 'CANNOT_DELETE_SELF');
  }

  const target = await userRepo.findById(id);
  if (!target || target.deleted_at) {
    throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
  }

  if (target.role === 'super_admin') {
    throw new AppError(
      'No se puede eliminar al super administrador',
      403,
      'CANNOT_DELETE_SUPER_ADMIN'
    );
  }

  if (target.role === 'admin' && actor.role !== 'super_admin') {
    throw new AppError(
      'Solo el super administrador puede eliminar administradores',
      403,
      'FORBIDDEN'
    );
  }

  const ok = await userRepo.softDelete(id);
  if (!ok) {
    throw new AppError('No se pudo eliminar el usuario', 500, 'DELETE_FAILED');
  }
  return { id, deleted: true };
}

export async function initSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  if (!email) {
    throw new Error('SUPER_ADMIN_EMAIL no está configurado en el entorno');
  }

  await userRepo.promoteToSuperAdmin(email);
  logger.info(`[bootstrap] super_admin configurado: ${email}`);
}
