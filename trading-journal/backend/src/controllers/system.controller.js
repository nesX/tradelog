import * as systemService from '../services/system.service.js';
import { sendSuccess, sendCreated, sendDeleted } from '../utils/response.js';
import { logger } from '../utils/logger.js';

// ==================
// SYSTEMS
// ==================

export const listSystems = async (req, res, next) => {
  try {
    const systems = await systemService.getAllSystems(req.user.id);
    sendSuccess(res, { systems });
  } catch (error) {
    logger.error('SystemController:listSystems', { error: error.message, userId: req.user?.id });
    next(error);
  }
};

export const getSystem = async (req, res, next) => {
  try {
    const system = await systemService.getSystemById(req.user.id, parseInt(req.params.id));
    sendSuccess(res, system);
  } catch (error) {
    logger.error('SystemController:getSystem', { error: error.message, userId: req.user?.id, systemId: req.params.id });
    next(error);
  }
};

export const createSystem = async (req, res, next) => {
  try {
    const system = await systemService.createSystem(req.user.id, req.body);
    sendCreated(res, system, 'Sistema creado exitosamente');
  } catch (error) {
    logger.error('SystemController:createSystem', { error: error.message, userId: req.user?.id });
    next(error);
  }
};

export const updateSystemName = async (req, res, next) => {
  try {
    const updated = await systemService.updateSystemName(req.user.id, parseInt(req.params.id), req.body.name);
    sendSuccess(res, updated, 'Sistema actualizado');
  } catch (error) {
    logger.error('SystemController:updateSystemName', { error: error.message, userId: req.user?.id, systemId: req.params.id });
    next(error);
  }
};

export const deleteSystem = async (req, res, next) => {
  try {
    await systemService.deleteSystem(req.user.id, parseInt(req.params.id));
    sendDeleted(res, 'Sistema eliminado');
  } catch (error) {
    logger.error('SystemController:deleteSystem', { error: error.message, userId: req.user?.id, systemId: req.params.id });
    next(error);
  }
};

// ==================
// TIMEFRAMES
// ==================

export const listTimeframes = async (req, res, next) => {
  try {
    const timeframes = await systemService.getAllTimeframes(req.user.id);
    sendSuccess(res, { timeframes });
  } catch (error) {
    logger.error('SystemController:listTimeframes', { error: error.message, userId: req.user?.id });
    next(error);
  }
};

export const createTimeframe = async (req, res, next) => {
  try {
    const timeframe = await systemService.createTimeframe(req.user.id, req.body);
    sendCreated(res, timeframe, 'Timeframe creado exitosamente');
  } catch (error) {
    logger.error('SystemController:createTimeframe', { error: error.message, userId: req.user?.id });
    next(error);
  }
};

export const deleteTimeframe = async (req, res, next) => {
  try {
    await systemService.deleteTimeframe(req.user.id, parseInt(req.params.id));
    sendDeleted(res, 'Timeframe eliminado');
  } catch (error) {
    logger.error('SystemController:deleteTimeframe', { error: error.message, userId: req.user?.id, timeframeId: req.params.id });
    next(error);
  }
};
