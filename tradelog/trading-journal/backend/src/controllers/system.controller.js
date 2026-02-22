import * as systemService from '../services/system.service.js';
import { sendSuccess, sendCreated, sendDeleted } from '../utils/response.js';

// ==================
// SYSTEMS
// ==================

export const listSystems = async (req, res) => {
  const systems = await systemService.getAllSystems(req.user.id);
  sendSuccess(res, { systems });
};

export const getSystem = async (req, res) => {
  const system = await systemService.getSystemById(req.user.id, parseInt(req.params.id));
  sendSuccess(res, system);
};

export const createSystem = async (req, res) => {
  const system = await systemService.createSystem(req.user.id, req.body);
  sendCreated(res, system, 'Sistema creado exitosamente');
};

export const updateSystemName = async (req, res) => {
  const updated = await systemService.updateSystemName(
    req.user.id,
    parseInt(req.params.id),
    req.body.name
  );
  sendSuccess(res, updated, 'Sistema actualizado');
};

export const deleteSystem = async (req, res) => {
  await systemService.deleteSystem(req.user.id, parseInt(req.params.id));
  sendDeleted(res, 'Sistema eliminado');
};

// ==================
// TIMEFRAMES
// ==================

export const listTimeframes = async (req, res) => {
  const timeframes = await systemService.getAllTimeframes(req.user.id);
  sendSuccess(res, { timeframes });
};

export const createTimeframe = async (req, res) => {
  const timeframe = await systemService.createTimeframe(req.user.id, req.body);
  sendCreated(res, timeframe, 'Timeframe creado exitosamente');
};

export const deleteTimeframe = async (req, res) => {
  await systemService.deleteTimeframe(req.user.id, parseInt(req.params.id));
  sendDeleted(res, 'Timeframe eliminado');
};
