import * as adminService from '../services/admin.service.js';
import { sendSuccess } from '../utils/response.js';

export async function listUsers(req, res, next) {
  try {
    console.log('Listando usuarios con query:', req.query);
    const result = await adminService.listUsers(req.query);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getUser(req, res, next) {
  try {
    const user = await adminService.getUserById(parseInt(req.params.id, 10));
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}

export async function createUser(req, res, next) {
  try {
    const user = await adminService.createUser(req.body, req.user);
    sendSuccess(res, user, 'Usuario creado correctamente', 201);
  } catch (err) {
    next(err);
  }
}

export async function updateUserRole(req, res, next) {
  try {
    const user = await adminService.updateUserRole(
      parseInt(req.params.id, 10),
      req.body.role,
      req.user
    );
    sendSuccess(res, user, 'Rol actualizado');
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req, res, next) {
  try {
    const result = await adminService.deleteUser(parseInt(req.params.id, 10), req.user);
    sendSuccess(res, result, 'Usuario eliminado');
  } catch (err) {
    next(err);
  }
}
