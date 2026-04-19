import * as systemRepo from '../repositories/system.repository.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';

// ==================
// SYSTEMS
// ==================

export const getAllSystems = async (userId) => {
  return systemRepo.findAllSystems(userId);
};

export const getSystemById = async (userId, systemId) => {
  const system = await systemRepo.findSystemById(userId, systemId);
  if (!system) throw new NotFoundError(`Sistema con ID ${systemId} no encontrado`);
  return system;
};

export const createSystem = async (userId, data) => {
  return systemRepo.createSystem(userId, data);
};

export const updateSystemName = async (userId, systemId, name) => {
  const updated = await systemRepo.updateSystemName(userId, systemId, name);
  if (!updated) throw new NotFoundError(`Sistema con ID ${systemId} no encontrado`);
  return updated;
};

export const deleteSystem = async (userId, systemId) => {
  // Verificar que el sistema pertenece al usuario
  const system = await systemRepo.findSystemById(userId, systemId);
  if (!system) throw new NotFoundError(`Sistema con ID ${systemId} no encontrado`);

  const hasTrades = await systemRepo.systemHasTrades(systemId);

  if (hasTrades) {
    await systemRepo.softDeleteSystem(userId, systemId);
  } else {
    await systemRepo.hardDeleteSystem(userId, systemId);
  }
};

// ==================
// TIMEFRAMES
// ==================

export const getAllTimeframes = async (userId) => {
  return systemRepo.findAllTimeframes(userId);
};

export const createTimeframe = async (userId, data) => {
  return systemRepo.createTimeframe(userId, data);
};

export const deleteTimeframe = async (userId, timeframeId) => {
  const count = await systemRepo.countTradesUsingTimeframe(timeframeId);
  if (count > 0) {
    throw new ValidationError(
      `No se puede eliminar: ${count} trade${count === 1 ? '' : 's'} usa${count === 1 ? '' : 'n'} este timeframe`
    );
  }
  const deleted = await systemRepo.deleteTimeframe(userId, timeframeId);
  if (!deleted) throw new NotFoundError('Timeframe no encontrado');
};
