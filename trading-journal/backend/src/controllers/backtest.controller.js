import * as service from '../services/backtest.service.js';
import { sendSuccess, sendCreated, sendDeleted } from '../utils/response.js';
import { logger } from '../utils/logger.js';

export const listSessions = async (req, res, next) => {
  try {
    const sessions = await service.getSessions(req.user.id);
    sendSuccess(res, sessions);
  } catch (error) {
    logger.error('BacktestController:listSessions', { error: error.message, userId: req.user?.id });
    next(error);
  }
};

export const getSession = async (req, res, next) => {
  try {
    const session = await service.getSession(req.user.id, parseInt(req.params.id, 10));
    sendSuccess(res, session);
  } catch (error) {
    logger.error('BacktestController:getSession', { error: error.message, userId: req.user?.id, sessionId: req.params.id });
    next(error);
  }
};

export const createSession = async (req, res, next) => {
  try {
    const session = await service.createSession(req.user.id, req.body);
    sendCreated(res, session, 'Sesión de backtesting creada');
  } catch (error) {
    logger.error('BacktestController:createSession', { error: error.message, userId: req.user?.id });
    next(error);
  }
};

export const closeSession = async (req, res, next) => {
  try {
    const session = await service.closeSession(req.user.id, parseInt(req.params.id, 10), req.body);
    sendSuccess(res, session, 'Sesión cerrada');
  } catch (error) {
    logger.error('BacktestController:closeSession', { error: error.message, userId: req.user?.id, sessionId: req.params.id });
    next(error);
  }
};

export const getContinuationData = async (req, res, next) => {
  try {
    const data = await service.getSessionForContinuation(req.user.id, parseInt(req.params.id, 10));
    sendSuccess(res, data);
  } catch (error) {
    logger.error('BacktestController:getContinuationData', { error: error.message, userId: req.user?.id, sessionId: req.params.id });
    next(error);
  }
};

export const addTrade = async (req, res, next) => {
  try {
    const trade = await service.addTrade(req.user.id, parseInt(req.params.id, 10), req.body, req.file);
    sendCreated(res, trade, 'Trade registrado');
  } catch (error) {
    logger.error('BacktestController:addTrade', { error: error.message, userId: req.user?.id, sessionId: req.params.id });
    next(error);
  }
};

export const deleteTrade = async (req, res, next) => {
  try {
    await service.deleteTrade(req.user.id, parseInt(req.params.tradeId, 10));
    sendDeleted(res, 'Trade eliminado');
  } catch (error) {
    logger.error('BacktestController:deleteTrade', { error: error.message, userId: req.user?.id, tradeId: req.params.tradeId });
    next(error);
  }
};

export const deleteTradeImage = async (req, res, next) => {
  try {
    await service.deleteTradeImage(req.user.id, parseInt(req.params.tradeId, 10));
    sendSuccess(res, null, 'Imagen eliminada');
  } catch (error) {
    logger.error('BacktestController:deleteTradeImage', { error: error.message, userId: req.user?.id, tradeId: req.params.tradeId });
    next(error);
  }
};
